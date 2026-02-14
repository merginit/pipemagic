import type { ExecutionContext } from '../types/execution'
import type { ImageFrame } from '../types/image-frame'
import { bitmapToImageData, imageDataToBitmap } from '../utils/image'

let faceParser: any = null
let loadingPromise: Promise<any> | null = null

// 19 class colors: background, skin, nose, eye_g, l_eye, r_eye, l_brow, r_brow,
// l_ear, r_ear, mouth, u_lip, l_lip, hair, hat, ear_r, neck_l, neck, cloth
const CLASS_COLORS: [number, number, number][] = [
  [0, 0, 0],       // 0  background
  [255, 224, 189],  // 1  skin
  [255, 172, 68],   // 2  nose
  [255, 255, 109],  // 3  eye_g (glasses)
  [0, 153, 255],    // 4  l_eye
  [0, 102, 204],    // 5  r_eye
  [102, 204, 0],    // 6  l_brow
  [76, 153, 0],     // 7  r_brow
  [204, 102, 255],  // 8  l_ear
  [153, 51, 204],   // 9  r_ear
  [255, 0, 102],    // 10 mouth
  [255, 102, 102],  // 11 u_lip
  [204, 0, 51],     // 12 l_lip
  [102, 51, 0],     // 13 hair
  [255, 0, 255],    // 14 hat
  [178, 102, 255],  // 15 ear_r (earring)
  [0, 204, 153],    // 16 neck_l (necklace)
  [0, 255, 204],    // 17 neck
  [51, 153, 255],   // 18 cloth
]

async function getFaceParser(device: string, onStatus?: (msg: string) => void, onDownloadProgress?: (progress: number) => void) {
  if (faceParser) return faceParser
  if (loadingPromise) return loadingPromise

  loadingPromise = (async () => {
    onStatus?.('Loading transformers.js...')
    const { env, pipeline } = await import('@huggingface/transformers')
    env.allowLocalModels = false

    let actualDevice = device
    if (actualDevice === 'auto') {
      try {
        if (navigator.gpu) {
          const adapter = await navigator.gpu.requestAdapter()
          actualDevice = adapter ? 'webgpu' : 'wasm'
        } else {
          actualDevice = 'wasm'
        }
      } catch {
        actualDevice = 'wasm'
      }
    }

    onStatus?.('Downloading model...')
    onDownloadProgress?.(0.01)
    let largestFile = ''
    let largestTotal = 0
    const progress_callback = (event: any) => {
      if (event.status === 'progress' && event.total) {
        if (event.total > largestTotal) {
          largestFile = event.file
          largestTotal = event.total
        }
        if (event.file === largestFile) {
          onDownloadProgress?.(event.loaded / event.total)
        }
      }
    }

    try {
      faceParser = await pipeline('image-segmentation', 'Xenova/face-parsing', {
        device: actualDevice as 'webgpu' | 'wasm',
        dtype: 'fp32',
        progress_callback,
      })
    } catch (e) {
      if (actualDevice === 'webgpu') {
        onStatus?.('WebGPU failed, falling back to WASM...')
        faceParser = await pipeline('image-segmentation', 'Xenova/face-parsing', {
          device: 'wasm',
          dtype: 'fp32',
          progress_callback,
        })
      } else {
        throw e
      }
    }
    onStatus?.(null as any)
    return faceParser
  })()

  try {
    const result = await loadingPromise
    return result
  } catch (e) {
    loadingPromise = null
    throw e
  }
}

export async function executeFaceParse(
  ctx: ExecutionContext,
  inputs: ImageFrame[],
  params: Record<string, unknown>,
): Promise<ImageFrame> {
  const input = inputs[0]
  if (!input) throw new Error('No input image')

  const device = (params.device as string) || 'auto'

  ctx.onProgress('', 0.05)
  const model = await getFaceParser(
    device,
    (msg) => ctx.onStatusMessage?.('', msg),
    (progress) => ctx.onDownloadProgress?.('', progress),
  )
  ctx.onStatusMessage?.('', null)
  ctx.onDownloadProgress?.('', null as any)
  ctx.onProgress('', 0.2)

  if (ctx.abortSignal.aborted) throw new DOMException('Aborted', 'AbortError')

  const imageData = bitmapToImageData(input.bitmap)
  const { RawImage } = await import('@huggingface/transformers')
  const rawImage = new RawImage(new Uint8ClampedArray(imageData.data), input.width, input.height, 4)

  ctx.onProgress('', 0.3)

  const result = await model(rawImage)

  ctx.onProgress('', 0.7)

  // Build label→color lookup from the known class order
  const LABEL_ORDER = [
    'background', 'skin', 'nose', 'eye_g', 'l_eye', 'r_eye',
    'l_brow', 'r_brow', 'l_ear', 'r_ear', 'mouth', 'u_lip',
    'l_lip', 'hair', 'hat', 'ear_r', 'neck_l', 'neck', 'cloth',
  ]
  const labelToColor = new Map<string, [number, number, number]>()
  for (let i = 0; i < LABEL_ORDER.length; i++) {
    labelToColor.set(LABEL_ORDER[i], CLASS_COLORS[i])
  }

  // Composite all masks into one RGBA image
  const { width, height } = input
  const output = new Uint8ClampedArray(width * height * 4)

  for (const segment of result) {
    const label = segment.label as string
    const color = labelToColor.get(label) || CLASS_COLORS[0]
    const mask = segment.mask
    if (!mask) continue

    const maskData = mask.data as Uint8Array
    const maskChannels = mask.channels || 1
    const mw = mask.width || width
    const mh = mask.height || height

    // If mask dimensions differ, scale coordinates
    const scaleX = mw / width
    const scaleY = mh / height

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const mx = Math.min(Math.round(x * scaleX), mw - 1)
        const my = Math.min(Math.round(y * scaleY), mh - 1)
        const mi = my * mw + mx
        const maskVal = maskChannels >= 4 ? maskData[mi * maskChannels] : maskData[mi]

        if (maskVal > 127) {
          const pi = (y * width + x) * 4
          output[pi] = color[0]
          output[pi + 1] = color[1]
          output[pi + 2] = color[2]
          output[pi + 3] = 255
        }
      }
    }
  }

  ctx.onProgress('', 1)

  const outImageData = new ImageData(output, width, height)
  const bitmap = await imageDataToBitmap(outImageData)
  return {
    bitmap,
    width: bitmap.width,
    height: bitmap.height,
    revision: Date.now(),
  }
}

import type { ExecutionContext } from '../types/execution'
import type { ImageFrame } from '../types/image-frame'
import { bitmapToImageData, imageDataToBitmap } from '../utils/image'

let depthPipeline: any = null
let loadingPromise: Promise<any> | null = null
let loadedModel: string | null = null

const MODEL_MAP: Record<string, string> = {
  'fast': 'onnx-community/depth-anything-v2-small',
  'quality': 'onnx-community/depth-anything-v2-base',
}

async function getDepthPipeline(model: string, device: string, onStatus?: (msg: string) => void, onDownloadProgress?: (progress: number) => void) {
  const modelId = MODEL_MAP[model] || MODEL_MAP['fast']
  if (depthPipeline && loadedModel === modelId) return depthPipeline
  if (loadingPromise && loadedModel === modelId) return loadingPromise

  // Reset if model changed
  depthPipeline = null
  loadingPromise = null

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
      depthPipeline = await pipeline('depth-estimation', modelId, {
        device: actualDevice as 'webgpu' | 'wasm',
        dtype: 'fp32',
        progress_callback,
      })
    } catch (e) {
      if (actualDevice === 'webgpu') {
        onStatus?.('WebGPU failed, falling back to WASM...')
        depthPipeline = await pipeline('depth-estimation', modelId, {
          device: 'wasm',
          dtype: 'fp32',
          progress_callback,
        })
      } else {
        throw e
      }
    }
    loadedModel = modelId
    onStatus?.(null as any)
    return depthPipeline
  })()

  try {
    const result = await loadingPromise
    return result
  } catch (e) {
    loadingPromise = null
    throw e
  }
}

export async function executeDepth(
  ctx: ExecutionContext,
  inputs: ImageFrame[],
  params: Record<string, unknown>,
): Promise<ImageFrame> {
  const input = inputs[0]
  if (!input) throw new Error('No input image')

  const model = (params.model as string) || 'fast'
  const device = (params.device as string) || 'auto'

  ctx.onProgress('', 0.05)
  const depthModel = await getDepthPipeline(
    model,
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

  const result = await depthModel(rawImage)

  ctx.onProgress('', 0.8)

  // Convert depth tensor to grayscale RGBA image
  const { width, height } = input
  const depthMap = result.predicted_depth ?? result.depth
  const depthData = depthMap.data as Float32Array

  // Find min/max for normalization
  let min = Infinity
  let max = -Infinity
  for (let i = 0; i < depthData.length; i++) {
    if (depthData[i] < min) min = depthData[i]
    if (depthData[i] > max) max = depthData[i]
  }
  const range = max - min || 1

  // The depth output may be a different resolution than input, so use its dimensions
  const dw = depthMap.dims?.[1] ?? depthMap.width ?? width
  const dh = depthMap.dims?.[0] ?? depthMap.height ?? height

  const output = new Uint8ClampedArray(dw * dh * 4)
  for (let i = 0; i < dw * dh; i++) {
    const v = Math.round(((depthData[i] - min) / range) * 255)
    output[i * 4] = v
    output[i * 4 + 1] = v
    output[i * 4 + 2] = v
    output[i * 4 + 3] = 255
  }

  ctx.onProgress('', 1)

  const outImageData = new ImageData(output, dw, dh)
  const bitmap = await imageDataToBitmap(outImageData)
  return {
    bitmap,
    width: bitmap.width,
    height: bitmap.height,
    revision: Date.now(),
  }
}

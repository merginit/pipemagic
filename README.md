# PipeMagic

Visual image processing pipeline editor that runs entirely in the browser. Build node-based pipelines to process images using AI models — no server required.

**[Try it live](https://mo1app.github.io/pipemagic/)** · **[Example app](https://mo1app.github.io/pipemagic/example/)** · **[npm package](https://www.npmjs.com/package/pipemagic)**

## Features

- **Node-based editor** — Drag-and-drop pipeline builder powered by Vue Flow
- **Background removal** — AI-powered using RMBG-1.4 (via Hugging Face Transformers.js)
- **Normalize** — Auto-crop and center subjects with configurable padding
- **Outline** — GPU-accelerated outline generation using WebGPU (JFA algorithm)
- **Upscale 2x** — AI upscaling with Real-ESRGAN
- **Fully client-side** — All processing happens in-browser using WebGPU and WASM
- **Save/Load** — Export and import pipelines as JSON files

## Packages

| Package | Description |
|---------|-------------|
| [`packages/runtime`](packages/runtime/) | Standalone pipeline runtime, published as [`pipemagic`](https://www.npmjs.com/package/pipemagic) on npm. Framework-agnostic — use it in any web app to run image processing pipelines. |
| [`packages/example`](packages/example/) | Minimal demo app ([live](https://mo1app.github.io/pipemagic/example/)). Vanilla Vite + TypeScript, ~180 lines. Drop an image and it runs the full sticker pipeline. |
| `app/` | The main PipeMagic editor UI — Nuxt 3 / Vue 3 app with Vue Flow, Pinia, and Tailwind CSS. Imports the runtime from `pipemagic`. |
| `shared/types/` | TypeScript type definitions shared between the editor and the runtime. |

## Using the runtime in your own app

```sh
npm install pipemagic
```

```ts
import { PipeMagic } from 'pipemagic'

const pm = new PipeMagic()
const result = await pm.run(pipeline, imageFile)
// result.blob → output PNG
```

See the [runtime README](packages/runtime/README.md) for the full API and node type docs.

## Running locally

```bash
yarn install
yarn dev
```

Open [http://localhost:3003](http://localhost:3003).

To run the example app:

```bash
yarn build:runtime
yarn dev:example
```

Open [http://localhost:3005](http://localhost:3005).

## License

MIT

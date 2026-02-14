# Contributing to PipeMagic

## Adding a New Node

Each node requires changes across 14 files. Use this checklist to make sure nothing is missed.

### 1. Type definitions (both copies must stay in sync)

**`shared/types/pipeline.ts`** + **`packages/runtime/src/types/pipeline.ts`**
- Add node type to `NodeType` union (e.g. `| 'depth'`)

**`shared/types/node-params.ts`** + **`packages/runtime/src/types/node-params.ts`**
- Add params interface (e.g. `DepthParams`)
- Add entry to `NodeParamsMap`
- Add defaults to `DEFAULT_PARAMS`

**`packages/runtime/src/types.ts`**
- Add new params type to the re-export list

### 2. Executor

**`packages/runtime/src/executors/<name>.ts`** (new file)
- Follow existing executor pattern (e.g. `remove-bg.ts` for AI models, `outline.ts` for GPU)
- Signature: `(ctx: ExecutionContext, inputs: ImageFrame[], params: Record<string, unknown>) => Promise<ImageFrame>`
- Use `ctx.onProgress`, `ctx.onStatusMessage`, `ctx.onDownloadProgress` for UI feedback
- Check `ctx.abortSignal.aborted` before heavy work
- Return `{ bitmap, width, height, revision: Date.now() }`

### 3. Runtime wiring

**`packages/runtime/src/runner.ts`**
- Import executor, add to `executors` map

**`packages/runtime/src/index.ts`**
- Export new params type and executor function

### 4. App executor registration

**`app/composables/usePipelineRunner.ts`**
- Import executor from `pipemagic`
- Add to local `executors` map
- **This is easy to miss!** The app has its own executor map separate from the runtime's.

### 5. UI components

**`app/components/nodes/<Name>Node.vue`** (new file)
- Extend `BaseNode`, pick an icon from `@heroicons/vue/20/solid`
- Props: `{ id: string; label?: string; data: { params: Record<string, unknown> } }`
- Show key param values in the node body

**`app/components/PipelineCanvas.vue`**
- Import node component, add to `nodeTypes` map (wrapped in `markRaw()`)
- Add to `addableNodes` array (for right-click context menu)

**`app/components/TopBar.vue`**
- Import icon, add entry to `addNodeItems` (for Add Node dropdown)

**`app/components/NodeInspector.vue`**
- Add `<template v-if="nodeType === '<name>' && params">` block with param controls
- Use existing patterns: `<select>` for enums, `<input type="range">` for numbers

### 6. Store label

**`app/stores/pipeline.ts`**
- Add entry to `labels` record in `addNode()` function

### 7. README

**`README.md`**
- Add node to "Supported Nodes" list

### 8. Build & sync

```bash
cd packages/runtime && yarn build
# Yarn 1 doesn't auto-sync workspace builds, so copy dist manually:
rm -rf ../../node_modules/pipemagic/dist && cp -r dist ../../node_modules/pipemagic/dist
rm -rf ../../node_modules/.cache/vite
```

### 9. Optional: Preset

**`app/components/TopBar.vue`**
- Add a `build<Name>Preset()` function returning a `PipelineDefinition`
- Add entry to `presetMenuItems`

## Common Pitfalls

- **Stale node_modules**: Yarn 1 workspaces don't auto-sync built files. After `yarn build` in `packages/runtime/`, you must copy dist to `node_modules/pipemagic/dist` and clear the Vite cache.
- **Forgetting `usePipelineRunner.ts`**: The app has its own executor map — updating only `runner.ts` in the package causes "No executor for node type" at runtime.
- **Forgetting store labels**: Missing label in `pipeline.ts` `addNode()` causes a TypeScript error.
- **Both type copies**: `shared/types/` and `packages/runtime/src/types/` must be kept structurally identical.

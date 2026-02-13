// WebSR ships a webpack dev bundle that uses eval() referencing `exports`.
// This shim provides the CJS globals so the UMD factory can execute in ESM.
const module = { exports: {} as any }
const exports = module.exports
const self = globalThis as any

// Temporarily inject CJS globals
self.module = module
self.exports = exports

// Load the bundle (side-effect: populates module.exports)
await import('@websr/websr/dist/websr.js')

// Clean up
delete self.module
delete self.exports

const WebSR = module.exports.default || module.exports
export default WebSR

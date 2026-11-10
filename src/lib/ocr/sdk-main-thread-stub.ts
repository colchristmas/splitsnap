// The OCR SDK statically imports OpenCV (10 MB) and Clipper on the main thread,
// but only uses them when worker mode is off. We always run OCR in its worker,
// which bundles its own copies, so this stub (aliased in vite.config.ts) keeps
// them out of the main thread: no download, no WASM compile, less memory.
//
// The imports are static, so the stub must load fine and fail only on use.
// Symbols and `then` read as undefined so inspecting it (or a thenable check)
// doesn't throw.
const unavailable = new Proxy(
  {},
  {
    get(_target, key) {
      if (typeof key === 'symbol' || key === 'then') return undefined
      throw new Error('OpenCV is only available inside the OCR worker.')
    },
  },
)

export default unavailable

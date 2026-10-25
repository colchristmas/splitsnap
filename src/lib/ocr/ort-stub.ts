// The OCR SDK imports onnxruntime-web on the main thread only when worker mode
// is off. We always run it in its worker, which bundles its own copy, so this
// stub (aliased in vite.config.ts) keeps a second 25 MB runtime out of the build.
throw new Error('ONNX Runtime is only available inside the OCR worker.')

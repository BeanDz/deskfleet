import { resolve } from "node:path"
import { defineConfig } from "vite"
import { nodeBuiltins } from "./build/node-builtins.ts"

export default defineConfig({
  build: {
    emptyOutDir: true,
    lib: {
      entry: resolve(import.meta.dirname, "src/main/index.ts"),
      formats: ["es"],
      fileName: () => "index.js",
    },
    minify: false,
    outDir: resolve(import.meta.dirname, "out/main"),
    rolldownOptions: {
      external: ["electron", ...nodeBuiltins],
    },
    sourcemap: true,
    target: "node22",
  },
})

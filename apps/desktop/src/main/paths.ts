import { join } from "node:path"

// Vite bundles the main process into out/main, alongside out/renderer. Packaged
// builds keep the same layout inside app.asar.
export const rendererDirectory = join(import.meta.dirname, "../renderer")

/** A runtime image from build/, which electron-builder packages beside out/. */
export function buildResourcePath(name: string): string {
  return join(import.meta.dirname, "../../build", name)
}

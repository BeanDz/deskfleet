export const RENDERER_SCHEME = "deskfleet-app"
export const RENDERER_HOST = "bundle"
export const DEVELOPMENT_RENDERER_URL = "http://127.0.0.1:5173/"
export const BUNDLED_RENDERER_URL = `${RENDERER_SCHEME}://${RENDERER_HOST}/index.html`

export interface RendererEntrypoint {
  url: string
  mode: "bundle" | "development"
}

/**
 * Packaged builds always load the bundled renderer. Development builds accept
 * only the fixed loopback Vite server so an inherited environment variable
 * cannot point the privileged preload at another origin.
 */
export function resolveRendererEntrypoint(
  isPackaged: boolean,
  environmentUrl: string | undefined,
): RendererEntrypoint {
  if (isPackaged || environmentUrl === undefined) {
    return { url: BUNDLED_RENDERER_URL, mode: "bundle" }
  }
  if (environmentUrl !== DEVELOPMENT_RENDERER_URL) {
    throw new Error(
      `DESKFLEET_RENDERER_URL must be exactly ${DEVELOPMENT_RENDERER_URL} in development`,
    )
  }
  return { url: DEVELOPMENT_RENDERER_URL, mode: "development" }
}

/** Whether a document URL is the main renderer, ignoring its router hash. */
export function isMainRendererUrl(url: string): boolean {
  try {
    const candidate = new URL(url)
    if (candidate.search !== "" || candidate.username !== "" || candidate.password !== "") {
      return false
    }
    const identity = `${candidate.protocol}//${candidate.host}${candidate.pathname}`
    return identity === BUNDLED_RENDERER_URL || identity === DEVELOPMENT_RENDERER_URL
  } catch {
    return false
  }
}

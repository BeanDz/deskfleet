import { isSea } from "node:sea"
import { fileURLToPath } from "node:url"
import { connectAcpProcess, type AgentProvider } from "./acp.ts"

export const codexProvider: AgentProvider = {
  id: "codex",
  connect: (config, client) => connectAcpProcess({
    command: process.execPath,
    args: isSea()
      ? ["--codex-acp"]
      : [fileURLToPath(new URL("../main.ts", import.meta.url)), "--codex-acp"],
    env: {
      ...config.env,
      // Always select the installed CLI rather than the adapter's bundled Codex.
      CODEX_PATH: config.binaryPath || "codex",
    },
  }, client),
}

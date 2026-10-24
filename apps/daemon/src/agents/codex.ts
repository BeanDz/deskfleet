/// <reference path="../codex-acp.d.ts" />
import { connectAcpProcess, type AgentProvider } from "./acp.ts"
import { adapterProcess, CODEX_ACP_ARGUMENT } from "./adapter-host.ts"

/** Shared by source, SEA, and Electron's Node-mode adapter host. */
export async function runCodexAdapter(): Promise<void> {
  process.env.CODEX_PATH ||= "codex"
  await import("@agentclientprotocol/codex-acp")
}

export const codexProvider: AgentProvider = {
  id: "codex",
  connect(config, client) {
    const host = adapterProcess(CODEX_ACP_ARGUMENT)
    return connectAcpProcess({
      ...host,
      env: {
        ...config.env,
        ...host.env,
        // Always select the installed CLI rather than the adapter's bundled Codex.
        CODEX_PATH: config.binaryPath || "codex",
      },
    }, client)
  },
}

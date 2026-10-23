import { resolve } from "node:path"
import { parseArgs } from "node:util"
import type { AgentConfig } from "./agents/acp.ts"
import { codexProvider } from "./agents/codex.ts"

export async function runAgent(args: string[]) {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      help: { type: "boolean", short: "h" },
      check: { type: "boolean" },
      cwd: { type: "string", default: process.cwd() },
      prompt: { type: "string" },
      name: { type: "string", default: "Codex" },
      "binary-path": { type: "string" },
      env: { type: "string", multiple: true, default: [] },
    },
  })
  if (values.help) {
    console.log("Usage: deskfleet-daemon agent codex [--check | --prompt <text>] [--cwd <directory>] [--name <name>] [--binary-path <executable>] [--env KEY=value ...]")
    return
  }
  if (positionals.length !== 1 || positionals[0] !== "codex") {
    throw new Error("supported agent: codex")
  }
  if (values.check ? values.prompt !== undefined : !values.prompt) {
    throw new Error("choose --check or --prompt <text>")
  }

  const config: AgentConfig = {
    name: values.name,
    binaryPath: values["binary-path"],
    env: Object.fromEntries(values.env.map(value => {
      const separator = value.indexOf("=")
      if (separator < 1) throw new Error("--env must be KEY=value")
      return [value.slice(0, separator), value.slice(separator + 1)]
    })),
  }
  const agent = await codexProvider.connect(config, {
    onUpdate: notification => console.log(JSON.stringify({ event: "session_update", ...notification })),
    requestPermission: async request => {
      console.log(JSON.stringify({ event: "permission_cancelled", ...request }))
      return { outcome: { outcome: "cancelled" } }
    },
  })
  let sessionId: string | undefined
  const interrupt = () => {
    process.off("SIGINT", interrupt)
    process.off("SIGTERM", interrupt)
    const stopping = sessionId ? agent.cancel(sessionId) : agent.close()
    void stopping.catch(error => {
      console.error(error instanceof Error ? error.message : String(error))
      process.exitCode = 1
      void agent.close()
    })
  }
  process.once("SIGINT", interrupt)
  process.once("SIGTERM", interrupt)
  try {
    console.log(JSON.stringify({ event: "initialized", provider: codexProvider.id, name: config.name, ...agent.initialization }))
    if (values.check) return

    const session = await agent.newSession({ cwd: resolve(values.cwd), mcpServers: [] })
    sessionId = session.sessionId
    console.log(JSON.stringify({ event: "session", provider: codexProvider.id, name: config.name, ...session }))
    const result = await agent.prompt({
      sessionId,
      prompt: [{ type: "text", text: values.prompt! }],
    })
    console.log(JSON.stringify({ event: "stop", sessionId, ...result }))
  } finally {
    process.off("SIGINT", interrupt)
    process.off("SIGTERM", interrupt)
    await agent.close()
  }
}

import { spawn } from "node:child_process"
import { Readable, Writable } from "node:stream"
import * as acp from "@agentclientprotocol/sdk"

export interface AgentConfig {
  name: string
  binaryPath?: string
  env?: Record<string, string>
}

export interface AgentProvider {
  readonly id: string
  connect(config: AgentConfig, client: AgentClient): Promise<AgentConnection>
}

export interface AgentProcess {
  command: string
  args?: string[]
  env?: NodeJS.ProcessEnv
}

export interface AgentClient {
  onUpdate(notification: acp.SessionNotification): void
  requestPermission?(
    params: acp.RequestPermissionRequest,
    signal: AbortSignal,
  ): Promise<acp.RequestPermissionResponse>
}

export interface AgentConnection {
  readonly initialization: acp.InitializeResponse
  newSession(params: acp.NewSessionRequest): Promise<acp.NewSessionResponse>
  prompt(params: acp.PromptRequest): Promise<acp.PromptResponse>
  cancel(sessionId: string): Promise<void>
  close(): Promise<void>
}

export async function connectAcpProcess(launch: AgentProcess, client: AgentClient): Promise<AgentConnection> {
  const child = spawn(launch.command, launch.args ?? [], {
    env: Object.fromEntries(
      [...Object.entries(process.env), ...Object.entries(launch.env ?? {})]
        .map(([key, value]) => [process.platform === "win32" ? key.toUpperCase() : key, value]),
    ),
    stdio: ["pipe", "pipe", "inherit"],
  })
  const exited = new Promise<void>(resolve => child.once("close", () => resolve()))
  const connection = acp.client({ name: "deskfleet" })
    .onNotification(acp.methods.client.session.update, ({ params }) => {
      try {
        client.onUpdate(params)
      } catch (error) {
        connection.close(error)
      }
    })
    .onRequest(acp.methods.client.session.requestPermission, async ({ params, signal }) => {
      if (!client.requestPermission) return { outcome: { outcome: "cancelled" } }
      try {
        return await client.requestPermission(params, signal)
      } catch (error) {
        connection.close(error)
        throw error
      }
    })
    .connect(acp.ndJsonStream(
      Writable.toWeb(child.stdin!),
      Readable.toWeb(child.stdout!) as ReadableStream<Uint8Array>,
    ))

  child.once("error", error => {
    connection.close(new Error(`Could not start ${launch.command}: ${error.message}`, { cause: error }))
  })

  let closing: Promise<void> | undefined
  function close(): Promise<void> {
    if (closing) return closing
    child.stdin!.end()
    connection.close()
    // Give adapters time to stop their own agent subprocesses after stdin EOF.
    const timeout = setTimeout(() => child.kill("SIGKILL"), 10_000)
    timeout.unref()
    closing = exited.finally(() => clearTimeout(timeout))
    return closing
  }
  void connection.closed.then(close)

  const timeout = setTimeout(() => {
    connection.close(new Error(`${launch.command} ACP initialization timed out`))
  }, 15_000)
  timeout.unref()
  try {
    const initialization = await connection.agent.request(acp.methods.agent.initialize, {
      protocolVersion: acp.PROTOCOL_VERSION,
      clientInfo: { name: "deskfleet", version: "0.1.0" },
      clientCapabilities: {},
    })
    if (initialization.protocolVersion !== acp.PROTOCOL_VERSION) {
      throw new Error(`${launch.command} uses unsupported ACP protocol version ${initialization.protocolVersion}`)
    }
    return {
      initialization,
      newSession: params => connection.agent.request(acp.methods.agent.session.new, params),
      prompt: params => connection.agent.request(acp.methods.agent.session.prompt, params),
      cancel: sessionId => connection.agent.notify(acp.methods.agent.session.cancel, { sessionId }),
      close,
    }
  } catch (error) {
    await close()
    throw error
  } finally {
    clearTimeout(timeout)
  }
}

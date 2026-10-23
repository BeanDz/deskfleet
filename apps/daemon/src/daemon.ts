import { once } from "node:events"
import { createServer } from "node:http"
import type { AddressInfo } from "node:net"
import { join } from "node:path"
import { nativeInfo } from "@deskfleet/native"
import { PeerSessions } from "./peers.ts"
import { startControlServer } from "./control-server.ts"
import { TerminalSessions } from "./terminals.ts"
import { daemonControlDirectory } from "./control-discovery.ts"

export async function startDaemon(port = 0, options: { controlDirectory?: string } = {}) {
  const native = nativeInfo()
  const peers = new PeerSessions()
  const controlDirectory = options.controlDirectory ?? daemonControlDirectory()
  const terminals = new TerminalSessions({ directory: join(controlDirectory, "terminals") })
  const server = createServer((request, response) => {
    if (request.method === "GET" && request.url === "/healthz") {
      response.writeHead(200, { "content-type": "application/json" })
      response.end(JSON.stringify({ status: "ok", native }))
      return
    }
    response.writeHead(404)
    response.end()
  })

  server.listen(port, "127.0.0.1")
  await once(server, "listening")
  const address = server.address() as AddressInfo

  let control: Awaited<ReturnType<typeof startControlServer>> | undefined
  try {
    control = await startControlServer(peers, controlDirectory, undefined, terminals)
  } catch (error) {
    const cleanup = await Promise.allSettled([peers.closeAll(), terminals.close(), server[Symbol.asyncDispose]()])
    const failures = cleanup.flatMap(result => result.status === "rejected" ? [result.reason] : [])
    if (failures.length) throw new AggregateError([error, ...failures], "Daemon startup and cleanup failed", { cause: error })
    throw error
  }
  let closing: Promise<void> | undefined

  return {
    address: `http://127.0.0.1:${address.port}`,
    peers,
    terminals,
    close: () => closing ??= (async () => {
      try {
        await control?.close()
      } finally {
        try {
          await peers.closeAll()
        } finally {
          try {
            await terminals.close()
          } finally {
            await server[Symbol.asyncDispose]()
          }
        }
      }
    })(),
  }
}

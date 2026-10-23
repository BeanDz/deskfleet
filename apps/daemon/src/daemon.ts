import { once } from "node:events"
import { createServer } from "node:http"
import type { AddressInfo } from "node:net"
import { nativeInfo } from "@deskfleet/native"

export async function startDaemon(port = 0) {
  const native = nativeInfo()
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

  return {
    address: `http://127.0.0.1:${address.port}`,
    close: () => server[Symbol.asyncDispose](),
  }
}

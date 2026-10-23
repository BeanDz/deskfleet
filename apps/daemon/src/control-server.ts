import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto"
import { once } from "node:events"
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { connect, createServer, type Socket } from "node:net"
import { hostname, tmpdir } from "node:os"
import { join } from "node:path"
import { captureDisplays, supportedVideoCodecs, type NativePeer, type PeerConfig } from "@deskfleet/native"
import { daemonDiscoveryPath, readDaemonDiscovery } from "./control-discovery.ts"
import { MAX_CONTROL_MESSAGE_BYTES, type ControlMessage, type ControlRequest, type DaemonDiscovery, type DesktopCapabilities, type DesktopEvent } from "./control-protocol.ts"
import { parseControlRequest } from "./control-request.ts"
import { TerminalChannel } from "./terminal-channel.ts"
import { TERMINAL_CHANNEL } from "./terminal-protocol.ts"
import { TerminalSessions } from "./terminals.ts"

/** The daemon's ownership surface, injectable without screen capture in tests. */
export interface ControlPeers {
  create(id: string, config: PeerConfig): Promise<NativePeer>
  close(id: string): Promise<void>
}

type Capabilities = () => Promise<DesktopCapabilities>

async function desktopCapabilities(): Promise<DesktopCapabilities> {
  const [displays, codecs] = await Promise.all([captureDisplays(), supportedVideoCodecs()])
  return {
    displays,
    codecs: codecs.filter((codec): codec is "h264" | "h265" | "av1" => codec === "h264" || codec === "h265" || codec === "av1"),
    audio: process.platform === "darwin",
  }
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

interface OwnedPeer {
  nativeId: string
  peer: Promise<NativePeer>
  terminal?: TerminalChannel
}

class ControlConnection {
  readonly #socket: Socket
  readonly #token: string
  readonly #peers: ControlPeers
  readonly #capabilities: Capabilities
  readonly #terminals: TerminalSessions
  readonly #sessions = new Map<string, OwnedPeer>()
  readonly #dialed = new Set<string>()
  readonly #unsubscribe: () => void
  #authenticated = false
  #closing: Promise<void> | undefined

  constructor(socket: Socket, token: string, peers: ControlPeers, capabilities: Capabilities, terminals: TerminalSessions) {
    this.#socket = socket
    this.#token = token
    this.#peers = peers
    this.#capabilities = capabilities
    this.#terminals = terminals
    this.#unsubscribe = terminals.onChange(event => {
      if (event.kind === "terminalHungup") this.#dialed.delete(event.terminalId)
      if (this.#authenticated) this.#send({ event })
    })
    socket.on("error", () => {})
    socket.once("close", () => { void this.close().catch(error => console.error("Desktop session cleanup failed", error)) })
  }

  #send(value: ControlMessage): void {
    if (this.#socket.destroyed || this.#socket.writableEnded) return
    const data = JSON.stringify(value) + "\n"
    // A stalled client must not grow the native event consumer's write queue.
    if (this.#socket.writableLength + Buffer.byteLength(data) > MAX_CONTROL_MESSAGE_BYTES * 4) {
      this.#socket.destroy()
      return
    }
    this.#socket.write(data)
  }

  async run(): Promise<void> {
    let pending = Buffer.alloc(0)
    try {
      for await (const data of this.#socket) {
        pending = Buffer.concat([pending, data as Buffer])
        for (;;) {
          const end = pending.indexOf(10)
          if (end < 0) break
          if (end > MAX_CONTROL_MESSAGE_BYTES) throw new Error("Local daemon request is too large")
          const request = parseControlRequest(JSON.parse(pending.subarray(0, end).toString("utf8")))
          pending = pending.subarray(end + 1)
          try {
            const result = await this.#handle(request)
            this.#send({ id: request.id, result })
          } catch (error) {
            this.#send({ id: request.id, error: message(error) })
            if (!this.#authenticated) {
              await new Promise<void>(resolve => this.#socket.end(resolve))
              return
            }
          }
          if (this.#socket.destroyed) return
        }
        if (pending.length > MAX_CONTROL_MESSAGE_BYTES) throw new Error("Local daemon request is too large")
      }
    } catch {
      // Malformed framing and socket errors terminate only this client's sessions.
      this.#socket.destroy()
    } finally {
      await this.close()
    }
  }

  async #handle(request: ControlRequest): Promise<unknown> {
    if (request.method === "hello") {
      const received = Buffer.from(request.params.token)
      const expected = Buffer.from(this.#token)
      if (received.length !== expected.length || !timingSafeEqual(received, expected)) throw new Error("Local daemon authentication failed")
      this.#authenticated = true
      return { name: hostname(), desktop: process.platform === "darwin" || process.platform === "win32" }
    }
    if (!this.#authenticated) throw new Error("Authenticate with the local daemon first")
    if (this.#closing) throw new Error("Local daemon connection is closed")
    switch (request.method) {
      case "capabilities":
        return this.#capabilities()
      case "terminalList":
        return this.#terminals.list()
      case "terminalDial": {
        const terminal = await this.#terminals.dial(request.params)
        this.#dialed.add(terminal.id)
        return terminal
      }
      case "terminalHangup":
        await this.#terminals.hangup(request.params.terminalId)
        return null
      case "offer":
      case "terminalOffer": {
        const { sessionId, sdp } = request.params
        if (this.#sessions.has(sessionId)) throw new Error("Desktop session already exists")
        if (this.#sessions.size >= 8) throw new Error("Too many desktop sessions")
        const config: PeerConfig = request.method === "offer" ? { video: request.params.codec, audio: request.params.audio } : {}
        if (config.audio && process.platform !== "darwin") throw new Error("System audio capture is unavailable on this platform")
        const nativeId = randomUUID()
        const owned: OwnedPeer = { nativeId, peer: this.#peers.create(nativeId, config) }
        this.#sessions.set(sessionId, owned)
        try {
          const peer = await owned.peer
          if (request.method === "terminalOffer") {
            owned.terminal = new TerminalChannel(
              this.#terminals,
              text => peer.sendText(TERMINAL_CHANNEL, text),
              error => {
                this.#send({ event: { sessionId, kind: "error", error: message(error) } })
                void this.#closeSession(sessionId).catch(cleanup => console.error("Terminal peer cleanup failed", cleanup))
              },
              id => this.#dialed.has(id),
            )
          }
          void this.#events(sessionId, owned, peer)
          return { sdp: await peer.answerOffer(sdp) }
        } catch (error) {
          await this.#closeSession(sessionId)
          throw error
        }
      }
      case "candidate":
        await (await this.#session(request.params.sessionId)).addIceCandidate(request.params.candidate)
        return null
      case "start": {
        const { sessionId, displayId, fps, bitrateBps } = request.params
        if (this.#sessions.get(sessionId)?.terminal) throw new Error("Terminal peers cannot start desktop capture")
        await (await this.#session(sessionId)).startDesktop({ displayId, fps, bitrateBps })
        return null
      }
      case "close":
        await this.#closeSession(request.params.sessionId)
        return null
    }
  }

  async #session(sessionId: string): Promise<NativePeer> {
    const owned = this.#sessions.get(sessionId)
    if (!owned) throw new Error("Unknown desktop session on this connection")
    return owned.peer
  }

  async #events(sessionId: string, owned: OwnedPeer, peer: NativePeer): Promise<void> {
    try {
      for (;;) {
        const event = await peer.nextEvent()
        if (this.#sessions.get(sessionId) !== owned || this.#socket.destroyed) return
        if (!event) {
          await this.#closeSession(sessionId)
          return
        }
        if (owned.terminal && event.label === TERMINAL_CHANNEL) {
          if (event.kind === "data" && event.data) {
            void owned.terminal.receive(event.data, event.isString === true).catch(error => {
              if (this.#sessions.get(sessionId) !== owned) return
              this.#send({ event: { sessionId, kind: "error", error: message(error) } })
              void this.#closeSession(sessionId).catch(cleanup => console.error("Terminal peer cleanup failed", cleanup))
            })
          }
          if (event.kind === "dataChannelClosed") owned.terminal.close()
        }
        let outgoing: DesktopEvent | undefined
        if (event.kind === "iceCandidate" && event.candidate) outgoing = { sessionId, kind: "iceCandidate", candidate: event.candidate }
        if (event.kind === "stateChanged" && event.state) outgoing = { sessionId, kind: "stateChanged", state: event.state }
        if (event.kind === "error") outgoing = { sessionId, kind: "error", error: event.error ?? "Desktop stream failed" }
        if (outgoing) this.#send({ event: outgoing })
        if (event.kind === "error" || event.state === "failed" || event.state === "closed") {
          await this.#closeSession(sessionId)
          return
        }
      }
    } catch (error) {
      if (this.#sessions.get(sessionId) === owned) {
        this.#send({ event: { sessionId, kind: "error", error: message(error) } })
        await this.#closeSession(sessionId).catch(cleanup => console.error("Desktop peer cleanup failed", cleanup))
      }
    }
  }

  async #closeSession(sessionId: string): Promise<void> {
    const owned = this.#sessions.get(sessionId)
    if (!owned) return
    this.#sessions.delete(sessionId)
    owned.terminal?.close()
    await this.#peers.close(owned.nativeId)
  }

  close(): Promise<void> {
    this.#socket.destroy()
    this.#unsubscribe()
    this.#dialed.clear()
    this.#closing ??= Promise.allSettled([...this.#sessions.keys()].map(id => this.#closeSession(id))).then(results => {
      const errors = results.flatMap(result => result.status === "rejected" ? [result.reason] : [])
      if (errors.length) throw new AggregateError(errors, "Failed to close desktop sessions")
    })
    return this.#closing
  }
}

async function endpointIsLive(endpoint: string): Promise<boolean> {
  return new Promise(resolve => {
    const socket = connect(endpoint)
    const finish = (live: boolean) => { socket.destroy(); resolve(live) }
    socket.once("connect", () => finish(true))
    socket.once("error", () => finish(false))
    socket.setTimeout(1_000, () => finish(true))
  })
}

async function publishDiscovery(directory: string, discovery: DaemonDiscovery): Promise<void> {
  const path = daemonDiscoveryPath(directory)
  try {
    await writeFile(path, JSON.stringify(discovery), { flag: "wx", mode: 0o600 })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error
    const previous = await readDaemonDiscovery(directory)
    if (await endpointIsLive(previous.endpoint)) throw new Error("A local deskfleet daemon is already running")
    // Only replace the stale record we inspected; publication itself remains exclusive.
    const current = await readDaemonDiscovery(directory)
    if (current.token !== previous.token) throw new Error("Local daemon discovery changed during startup; retry")
    await rm(path)
    await writeFile(path, JSON.stringify(discovery), { flag: "wx", mode: 0o600 })
  }
}

export async function startControlServer(peers: ControlPeers, directory: string, capabilities: Capabilities = desktopCapabilities, terminals?: TerminalSessions) {
  const sessions = terminals ?? new TerminalSessions({ directory: join(directory, "terminals") })
  await mkdir(directory, { recursive: true, mode: 0o700 })
  if (process.platform !== "win32") await chmod(directory, 0o700)
  const temporary = await mkdtemp(join(tmpdir(), "df-ipc-"))
  const endpoint = process.platform === "win32" ? `\\\\.\\pipe\\deskfleet-${randomUUID()}` : join(temporary, "c.sock")
  const discovery: DaemonDiscovery = { endpoint, token: randomBytes(32).toString("hex") }
  const connections = new Set<ControlConnection>()
  let ready!: () => void
  let failed!: (error: unknown) => void
  const initialized = new Promise<void>((resolve, reject) => { ready = resolve; failed = reject })
  void initialized.catch(() => {})
  const server = createServer(socket => {
    const connection = new ControlConnection(socket, discovery.token, peers, capabilities, sessions)
    connections.add(connection)
    void initialized.then(() => connection.run()).catch(error => {
      if (published) console.error("Local desktop connection failed", error)
      return connection.close().catch(cleanup => console.error("Local connection cleanup failed", cleanup))
    }).finally(() => connections.delete(connection))
  })
  let published = false
  let closing: Promise<void> | undefined
  const close = () => closing ??= (async () => {
    const stopped = server.listening ? new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())) : Promise.resolve()
    try {
      await Promise.all([...connections].map(connection => connection.close()))
      await stopped
    } finally {
      if (published) {
        const current = await readFile(daemonDiscoveryPath(directory), "utf8").catch(() => "")
        if (current === JSON.stringify(discovery)) await rm(daemonDiscoveryPath(directory), { force: true })
      }
      await rm(temporary, { recursive: true, force: true })
      if (!terminals) await sessions.close()
    }
  })()
  try {
    server.listen(endpoint)
    await once(server, "listening")
    if (process.platform !== "win32") await chmod(endpoint, 0o600)
    await publishDiscovery(directory, discovery)
    published = true
    // Recover only after owning discovery: a second daemon must never rewrite
    // the active daemon's terminal metadata while probing its endpoint.
    await sessions.init()
    ready()
    return { close }
  } catch (error) {
    failed(error)
    await close()
    throw error
  }
}

export { startDaemon } from "./daemon.ts"
export { DaemonClient } from "./control-client.ts"
export { daemonControlDirectory, daemonDiscoveryPath, readDaemonDiscovery } from "./control-discovery.ts"
export type { ControlMethod, ControlMethods, DaemonDiscovery, DaemonEvent, LocalDaemonInfo } from "./control-protocol.ts"

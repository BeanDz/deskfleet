import "../../src/preload/index.ts"
import { contextBridge, ipcRenderer } from "electron"

contextBridge.exposeInMainWorld("terminalSmoke", {
  context: JSON.parse(process.argv.find(argument => argument.startsWith("--terminal-smoke-context="))?.slice("--terminal-smoke-context=".length) ?? "{}") as unknown,
  finish: (result: unknown) => ipcRenderer.send("terminal-smoke:result", result),
})

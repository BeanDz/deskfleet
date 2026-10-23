import { contextBridge, ipcRenderer } from "electron"

contextBridge.exposeInMainWorld("mediaSmoke", {
  send: (message: unknown) => ipcRenderer.send("media-smoke:send", message),
  onMessage: (listener: (message: unknown) => void) => {
    ipcRenderer.on("media-smoke:message", (_event, message: unknown) => listener(message))
  },
})

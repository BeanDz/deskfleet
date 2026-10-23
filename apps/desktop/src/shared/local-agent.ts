export const SETTINGS_CHANNEL = "deskfleet:settings"
export const SETTINGS_CHANGED_EVENT = "deskfleet:settings-changed"

export interface LocalAgentState {
  enabled: boolean
  status: "stopped" | "starting" | "running" | "stopping" | "error"
  error?: string
}

export type LocalAgentSettingsResult<T> = { ok: true; value: T } | { ok: false; error: string }

export interface LocalAgentSettingsApi {
  get(): Promise<LocalAgentState>
  setLocalAgentEnabled(enabled: boolean): Promise<LocalAgentState>
  onChanged(listener: (state: LocalAgentState) => void): () => void
}

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, useTemplateRef } from "vue"
import { useI18n } from "vue-i18n"
import type { TerminalSummary } from "../../../../../../daemon/src/terminal-protocol.ts"
import { intlLocale, type AppLocale } from "../../../../shared/i18n.ts"
import { decodeTerminalBytes } from "../../services/terminal-client.ts"
import { useTerminalsStore } from "../../stores/terminals.ts"
import TerminalSurface from "./TerminalSurface.vue"

const props = defineProps<{ terminalId: string }>()
const { t, locale } = useI18n()
const terminals = useTerminalsStore()
const surface = useTemplateRef<InstanceType<typeof TerminalSurface>>("surface")
const attached = ref(false)
const connecting = ref(false)
const replayed = ref(false)
const interactive = ref(false)
const error = ref<string | null>(null)
const sessionStatus = ref<TerminalSummary["status"]>("running")
const exitCode = ref<number | undefined>()
const historyLines = ref(5_000)
const formattedHistoryLines = computed(() => new Intl.NumberFormat(intlLocale(locale.value as AppLocale)).format(historyLines.value))
let size = { cols: 80, rows: 24 }
let attachment: ReturnType<typeof terminals.attach> | null = null
let resizeTimer: ReturnType<typeof setTimeout> | undefined
let disposed = false
let activating: ReturnType<typeof terminals.attach> | null = null

const status = computed(() => {
  if (connecting.value) return t("terminal.connecting")
  if (attached.value && !replayed.value) return t("terminal.replaying")
  if (sessionStatus.value === "interrupted") return t("terminal.interrupted")
  if (sessionStatus.value === "exited") return exitCode.value === undefined ? t("terminal.ended") : t("terminal.exited", { code: exitCode.value })
  return attached.value ? t("terminal.connected") : t("terminal.disconnected")
})

function failed(reason: unknown): void {
  if (!disposed) error.value = reason instanceof Error ? reason.message : String(reason)
}

async function activate(): Promise<void> {
  const active = attachment
  if (!active || activating === active || !attached.value || !replayed.value || sessionStatus.value !== "running" || error.value) return
  activating = active
  try {
    await terminals.resize(props.terminalId, size.cols, size.rows)
    if (disposed || attachment !== active || !attached.value || sessionStatus.value !== "running") return
    interactive.value = true
    surface.value?.focus()
  } catch (reason) { failed(reason) }
  finally { if (activating === active) activating = null }
}

async function connect(): Promise<void> {
  attachment?.detach()
  clearTimeout(resizeTimer)
  connecting.value = true
  attached.value = false
  interactive.value = false
  replayed.value = false
  error.value = null
  sessionStatus.value = "running"
  exitCode.value = undefined
  const active = terminals.attach(props.terminalId, (event, acknowledge) => {
    if (disposed || attachment !== active) { acknowledge(); return }
    if (event.kind === "reset") {
      replayed.value = false
      interactive.value = false
      surface.value?.reset()
    } else if (event.kind === "output") {
      if (surface.value) surface.value.write(decodeTerminalBytes(event.data), acknowledge)
      else acknowledge()
    } else if (event.kind === "ready") {
      replayed.value = true
      void activate()
    } else if (event.kind === "exit") {
      interactive.value = false
      sessionStatus.value = "exited"
      exitCode.value = event.exitCode
    } else if (event.kind === "hungup") {
      interactive.value = false
      attached.value = false
    } else {
      interactive.value = false
      attached.value = false
      failed(event.error)
    }
  })
  attachment = active
  try {
    const summary = await active.ready
    if (disposed || attachment !== active) return
    attached.value = true
    sessionStatus.value = summary.status
    exitCode.value = summary.exitCode
    await activate()
  } catch (reason) {
    if (attachment === active) failed(reason)
  } finally {
    if (!disposed && attachment === active) connecting.value = false
  }
}

function ready(next: { cols: number; rows: number }): void {
  size = next
  void connect()
}

function resize(next: { cols: number; rows: number }): void {
  size = next
  clearTimeout(resizeTimer)
  if (!interactive.value) return
  resizeTimer = setTimeout(() => {
    void terminals.resize(props.terminalId, size.cols, size.rows).catch(failed)
  }, 100)
}

function input(data: string): void {
  if (interactive.value) void terminals.input(props.terminalId, data).catch(failed)
}

async function moreHistory(): Promise<void> {
  historyLines.value = Math.min(0xffff_ffff, historyLines.value * 2)
  await nextTick()
  await connect()
}

onBeforeUnmount(() => {
  disposed = true
  clearTimeout(resizeTimer)
  attachment?.detach()
})
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col gap-2">
    <div class="flex flex-wrap items-center gap-3 text-xs text-ui-text-muted">
      <span role="status">{{ status }}</span>
      <button
        v-if="!attached && !connecting"
        type="button"
        class="cursor-pointer rounded-md px-2 py-1 hover:bg-ui-hover hover:text-ui-text"
        @click="connect"
      >{{ t("terminal.reconnect") }}</button>
      <span class="ml-auto" :title="t('terminal.historyRetained')">{{ t("terminal.historyLines", { count: formattedHistoryLines }) }}</span>
      <button
        type="button"
        class="cursor-pointer rounded-md px-2 py-1 hover:bg-ui-hover hover:text-ui-text disabled:op-40"
        :disabled="!attached || !replayed || connecting || historyLines >= 0xffff_ffff"
        @click="moreHistory"
      >{{ t("terminal.moreHistory") }}</button>
    </div>
    <p v-if="error" role="alert" class="m-0 text-xs text-red-500">{{ error }}</p>
    <div class="min-h-0 flex-1 overflow-hidden rounded-xl bg-ui-terminal p-3">
      <TerminalSurface
        ref="surface"
        :interactive="interactive"
        :scrollback="historyLines"
        @ready="ready"
        @input="input"
        @resize="resize"
      />
    </div>
  </div>
</template>

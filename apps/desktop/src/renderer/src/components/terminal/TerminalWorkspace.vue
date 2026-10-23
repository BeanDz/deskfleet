<script setup lang="ts">
import { Plus, X } from "@lucide/vue"
import { nextTick, ref, watch } from "vue"
import { useI18n } from "vue-i18n"
import { useRouter } from "vue-router"
import { useTerminalsStore } from "../../stores/terminals.ts"
import LiveTerminal from "./LiveTerminal.vue"

const props = defineProps<{ activeId?: string }>()
const terminals = useTerminalsStore()
const router = useRouter()
const { t } = useI18n()
const creating = ref(false)
const closing = ref(new Set<string>())
const error = ref<string | null>(null)
const tabName = (index: number) => t("terminal.tab", { number: index + 1 })
const tabId = (id: string) => `terminal-tab-${id}`
const panelId = (id: string) => `terminal-panel-${id}`

function failed(reason: unknown): void {
  error.value = reason instanceof Error ? reason.message : String(reason)
}

async function select(id: string, focus = false): Promise<void> {
  await router.push({ name: "terminal", params: { terminalId: id } })
  if (focus) {
    await nextTick()
    document.getElementById(tabId(id))?.focus()
  }
}

async function create(): Promise<void> {
  if (creating.value) return
  creating.value = true
  error.value = null
  try { await select((await terminals.create()).id) }
  catch (reason) { failed(reason) }
  finally { creating.value = false }
}

async function hangup(id: string): Promise<void> {
  if (closing.value.has(id)) return
  closing.value.add(id)
  error.value = null
  try { await terminals.hangup(id) }
  catch (reason) { failed(reason) }
  finally { closing.value.delete(id) }
}

function keydown(event: KeyboardEvent, index: number): void {
  let next: number
  if (event.key === "ArrowRight") next = (index + 1) % terminals.sessions.length
  else if (event.key === "ArrowLeft") next = (index + terminals.sessions.length - 1) % terminals.sessions.length
  else if (event.key === "Home") next = 0
  else if (event.key === "End") next = terminals.sessions.length - 1
  else if (event.key === "Delete") {
    event.preventDefault()
    void hangup(terminals.sessions[index]!.id)
    return
  } else return
  event.preventDefault()
  void select(terminals.sessions[next]!.id, true).catch(failed)
}

watch(() => terminals.sessions.map(({ id }) => id), (ids, previous = []) => {
  if (props.activeId && previous.includes(props.activeId) && !ids.includes(props.activeId)) {
    const next = ids[Math.min(previous.indexOf(props.activeId), ids.length - 1)]
    void router.replace(next
      ? { name: "terminal", params: { terminalId: next } }
      : { name: "machine-terminals", params: { machineId: "local-daemon" } }).catch(failed)
  } else if (!props.activeId && ids[0]) {
    void router.replace({ name: "terminal", params: { terminalId: ids[0] } }).catch(failed)
  }
}, { immediate: true })
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col gap-3">
    <div class="flex min-w-0 items-center gap-1 border-b border-ui-border">
      <div role="tablist" :aria-label="t('terminal.tabs')" class="flex min-w-0 flex-1 overflow-x-auto">
        <div
          v-for="(terminal, index) in terminals.sessions"
          :key="terminal.id"
          role="presentation"
          class="flex shrink-0 items-center rounded-t-md"
          :class="activeId === terminal.id ? 'bg-ui-hover text-ui-text' : 'text-ui-text-muted'"
        >
          <button
            :id="tabId(terminal.id)"
            role="tab"
            type="button"
            :aria-selected="activeId === terminal.id"
            :aria-controls="panelId(terminal.id)"
            :tabindex="activeId === terminal.id ? 0 : -1"
            :title="terminal.cwd"
            class="cursor-pointer px-3 py-2 text-sm"
            @click="select(terminal.id).catch(failed)"
            @keydown="keydown($event, index)"
          >{{ tabName(index) }}</button>
          <button
            type="button"
            :aria-label="t('terminal.hangupTab', { name: tabName(index) })"
            :title="t('terminal.hangupHint')"
            :disabled="closing.has(terminal.id)"
            class="mr-1 inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded hover:bg-ui-surface disabled:op-40"
            @click="hangup(terminal.id)"
          ><X :size="13" aria-hidden="true" /></button>
        </div>
      </div>
      <button
        type="button"
        :aria-label="t('terminal.newTab')"
        :title="t('terminal.newTab')"
        :disabled="creating"
        class="inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded text-ui-text-muted hover:bg-ui-hover hover:text-ui-text disabled:op-40"
        @click="create"
      ><Plus :size="16" aria-hidden="true" /></button>
    </div>
    <p v-if="error" role="alert" class="m-0 text-xs text-red-500">{{ error }}</p>
    <div
      v-if="activeId && terminals.sessions.some(({ id }) => id === activeId)"
      :id="panelId(activeId)"
      role="tabpanel"
      :aria-labelledby="tabId(activeId)"
      class="flex min-h-0 flex-1 flex-col"
    ><LiveTerminal :key="activeId" :terminal-id="activeId" /></div>
    <div v-else class="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 text-ui-text-muted">
      <p>{{ t("terminal.empty") }}</p>
      <button
        type="button"
        :disabled="creating"
        class="cursor-pointer rounded-md border border-ui-border px-3 py-2 text-sm hover:bg-ui-hover disabled:op-40"
        @click="create"
      >{{ t("terminal.newTab") }}</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue"
import { useI18n } from "vue-i18n"
import type { LocalAgentState } from "../../../shared/local-agent.ts"
import PaneHeader from "../components/chrome/PaneHeader.vue"

const { t } = useI18n()
const state = ref<LocalAgentState | null>(null)
const loading = ref(true)
const saving = ref(false)
const requestError = ref<string | null>(null)
let revision = 0
const unsubscribe = window.deskfleet.settings.onChanged((next) => {
  revision += 1
  state.value = next
  requestError.value = null
})
const busy = computed(() => loading.value || saving.value || state.value?.status === "starting" || state.value?.status === "stopping")
const statusLabel = computed(() => {
  switch (state.value?.status) {
    case "stopped": return t("settings.stopped")
    case "starting": return t("settings.starting")
    case "running": return t("settings.running")
    case "stopping": return t("settings.stopping")
    case "error": return t("settings.error")
    default: return loading.value ? t("settings.loading") : t("settings.unavailable")
  }
})

async function load() {
  loading.value = true
  requestError.value = null
  const currentRevision = revision
  try {
    const next = await window.deskfleet.settings.get()
    if (revision === currentRevision) state.value = next
  } catch (error) {
    if (revision === currentRevision) requestError.value = error instanceof Error ? error.message : String(error)
  } finally { loading.value = false }
}

async function setEnabled(enabled: boolean) {
  saving.value = true
  requestError.value = null
  try {
    state.value = await window.deskfleet.settings.setLocalAgentEnabled(enabled)
  } catch (error) {
    requestError.value = error instanceof Error ? error.message : String(error)
  } finally { saving.value = false }
}

onMounted(load)
onBeforeUnmount(unsubscribe)
</script>

<template>
  <PaneHeader>{{ t("nav.settings") }}</PaneHeader>
  <div class="min-h-0 flex-1 overflow-y-auto p-6">
    <section class="max-w-2xl" aria-labelledby="local-agent-heading">
      <div class="flex items-center justify-between gap-6">
        <div>
          <h1 id="local-agent-heading" class="text-base font-semibold">{{ t("settings.localAgent") }}</h1>
          <p id="local-agent-description" class="mt-2 text-sm text-ui-muted">{{ t("settings.autoStart") }}</p>
        </div>
        <button
          type="button"
          role="switch"
          :aria-label="t('settings.enableLocalAgent')"
          :aria-checked="state?.enabled ?? false"
          aria-describedby="local-agent-description local-agent-lifetime"
          :disabled="busy || !state"
          class="relative h-6 w-10 shrink-0 rounded-full border border-ui-border transition-colors disabled:cursor-wait disabled:opacity-50"
          :class="state?.enabled ? 'bg-ui-accent' : 'bg-ui-hover'"
          @click="setEnabled(!state?.enabled)"
        >
          <span class="absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform" :class="state?.enabled ? 'left-0.5 translate-x-4' : 'left-0.5'" />
        </button>
      </div>
      <div id="local-agent-lifetime" class="mt-4 space-y-1 text-sm text-ui-muted">
        <p>{{ t("settings.keepRunning") }}</p>
        <p>{{ t("settings.stopEffect") }}</p>
      </div>
      <p role="status" class="mt-5 text-sm">{{ statusLabel }}</p>
      <p v-if="state && !state.enabled && state.status === 'running'" class="mt-2 text-sm text-ui-muted">{{ t("settings.runningSeparately") }}</p>
      <p v-if="requestError || state?.error" role="alert" class="mt-2 text-sm text-ui-danger">{{ requestError || state?.error }}</p>
      <button v-if="state?.status === 'error'" class="catalog-button mt-3" :disabled="busy" @click="setEnabled(state.enabled)">{{ state.enabled ? t("settings.retryStart") : t("settings.retryStop") }}</button>
      <button v-else-if="!state && requestError" class="catalog-button mt-3" :disabled="busy" @click="load">{{ t("settings.retryLoad") }}</button>
    </section>
  </div>
</template>

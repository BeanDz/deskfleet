<script setup lang="ts">
import { computed, ref, watch } from "vue"
import { useI18n } from "vue-i18n"
import PaneHeader from "../components/chrome/PaneHeader.vue"
import ResourcePath from "../components/chrome/ResourcePath.vue"
import TerminalSurface from "../components/terminal/TerminalSurface.vue"
import TerminalWorkspace from "../components/terminal/TerminalWorkspace.vue"
import { useFleetStore } from "../stores/fleet.ts"

const props = defineProps<{ terminalId?: string; machineId?: string }>()
const { t } = useI18n()
const fleet = useFleetStore()
const location = computed(() => props.terminalId ? fleet.findTerminal(props.terminalId) : null)
// Retain the workspace while a hung-up terminal leaves the catalog and the route advances.
const lastLocalTerminalId = ref<string>()
watch(location, (value) => {
  if (value?.machine.id === "local-daemon") lastLocalTerminalId.value = value.terminal.id
}, { immediate: true })
const localWorkspace = computed(() => props.machineId === "local-daemon"
  || location.value?.machine.id === "local-daemon"
  || (props.terminalId !== undefined && props.terminalId === lastLocalTerminalId.value))
const scope = computed(() => localWorkspace.value
  ? [fleet.localDesktopTarget.name]
  : [location.value?.machine, location.value?.workspace, location.value?.worktree]
    .filter((resource) => resource !== undefined)
    .map(({ name }) => name),
)
const banner = computed(() => `\x1b[2m${t("terminal.unavailable")}\x1b[0m\n`)
</script>

<template>
  <PaneHeader>
    <template v-if="localWorkspace || location">
      {{ localWorkspace ? t("terminal.tabs") : location?.terminal.title }}
      <ResourcePath :segments="scope" />
    </template>
  </PaneHeader>

  <div v-if="localWorkspace" class="flex min-h-0 flex-1 flex-col px-4 pb-4">
    <TerminalWorkspace :active-id="terminalId" />
  </div>
  <div
    v-else-if="!location"
    class="flex min-h-0 flex-1 items-center justify-center px-6 text-ui-text-muted"
  >{{ t("terminal.notFound") }}</div>
  <div v-else class="flex min-h-0 flex-1 flex-col px-4 pb-4">
    <div class="min-h-0 flex-1 overflow-hidden rounded-xl bg-ui-terminal p-3">
      <TerminalSurface :key="terminalId" :banner="banner" />
    </div>
  </div>
</template>

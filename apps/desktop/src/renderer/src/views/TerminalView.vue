<script setup lang="ts">
import { computed } from "vue"
import { useI18n } from "vue-i18n"
import PaneHeader from "../components/chrome/PaneHeader.vue"
import ResourcePath from "../components/chrome/ResourcePath.vue"
import TerminalSurface from "../components/terminal/TerminalSurface.vue"
import { useFleetStore } from "../stores/fleet.ts"

const props = defineProps<{ terminalId: string }>()
const { t } = useI18n()
const fleet = useFleetStore()
const location = computed(() => fleet.findTerminal(props.terminalId))
// The owner, which can be the machine, a workspace, or a worktree.
const scope = computed(() =>
  [location.value?.machine, location.value?.workspace, location.value?.worktree]
    .filter((resource) => resource !== undefined)
    .map(({ name }) => name),
)
// Shown in dim text until the terminal streams output from its machine.
const banner = computed(() => `\x1b[2m${t("terminal.unavailable")}\x1b[0m\n`)
</script>

<template>
  <PaneHeader>
    <template v-if="location">
      {{ location.terminal.title }}
      <ResourcePath :segments="scope" />
    </template>
  </PaneHeader>

  <div
    v-if="!location"
    class="flex min-h-0 flex-1 items-center justify-center px-6 text-ui-text-muted"
  >
    {{ t("terminal.notFound") }}
  </div>

  <div v-else class="flex min-h-0 flex-1 flex-col px-4 pb-4">
    <div class="min-h-0 flex-1 overflow-hidden rounded-xl bg-ui-terminal p-3">
      <!-- Remount for each terminal; one surface never shows two sessions' output. -->
      <TerminalSurface :key="terminalId" :banner="banner" />
    </div>
  </div>
</template>

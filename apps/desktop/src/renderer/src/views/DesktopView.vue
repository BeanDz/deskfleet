<script setup lang="ts">
import { MonitorPlay } from "@lucide/vue"
import { computed } from "vue"
import { useI18n } from "vue-i18n"
import PaneHeader from "../components/chrome/PaneHeader.vue"
import ResourcePath from "../components/chrome/ResourcePath.vue"
import { useFleetStore } from "../stores/fleet.ts"

const props = defineProps<{ machineId: string }>()
const { t } = useI18n()
const fleet = useFleetStore()
const machine = computed(() => fleet.findMachine(props.machineId))

const connectable = computed(() => machine.value?.online === true && machine.value.desktop)
const status = computed(() => {
  if (!machine.value) return t("desktop.notFound")
  if (!machine.value.online) return t("desktop.offline", { machine: machine.value.name })
  if (!machine.value.desktop) return t("desktop.noDisplay", { machine: machine.value.name })
  return t("desktop.unavailable")
})
</script>

<template>
  <PaneHeader>
    <template v-if="machine">
      {{ t("machine.remoteDesktop") }}
      <ResourcePath :segments="[machine.name]" />
    </template>
  </PaneHeader>

  <div class="flex min-h-0 flex-1 items-center justify-center p-6">
    <div
      class="flex aspect-video max-h-full w-full max-w-4xl flex-col items-center justify-center gap-3 rounded-xl border border-ui-border bg-ui-surface text-ui-text-muted"
    >
      <MonitorPlay :size="32" :stroke-width="1.5" aria-hidden="true" />
      <p class="m-0">{{ status }}</p>
      <button
        v-if="connectable"
        type="button"
        class="ui-text-button cursor-default border border-ui-border"
        :title="t('common.placeholderControl', { label: t('desktop.connect') })"
        aria-disabled="true"
      >
        {{ t("desktop.connect") }}
      </button>
    </div>
  </div>
</template>

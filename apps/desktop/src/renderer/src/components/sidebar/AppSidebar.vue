<script setup lang="ts">
import { SquarePen } from "@lucide/vue"
import { storeToRefs } from "pinia"
import { useI18n } from "vue-i18n"
import { useFleetStore } from "../../stores/fleet.ts"
import WindowToolbar from "../chrome/WindowToolbar.vue"
import MachineSection from "./MachineSection.vue"
import SidebarFooter from "./SidebarFooter.vue"
import SidebarLink from "./SidebarLink.vue"

const { t } = useI18n()
const { machines } = storeToRefs(useFleetStore())
const platform = window.deskfleet.platform
</script>

<template>
  <aside class="flex w-65 shrink-0 flex-col border-r border-ui-border bg-ui-sidebar">
    <!-- On macOS the traffic lights sit at the start of this row. -->
    <div
      class="app-drag flex h-12 shrink-0 items-center justify-end pr-2"
      :class="platform === 'darwin' ? 'pl-20' : 'pl-2'"
    >
      <WindowToolbar />
    </div>

    <nav :aria-label="t('nav.label')" class="flex shrink-0 flex-col gap-0.5 px-2">
      <SidebarLink :to="{ name: 'new-session' }" :icon="SquarePen" :label="t('nav.newSession')" />
    </nav>

    <div class="mt-4 min-h-0 flex-1 overflow-y-auto px-2 pb-3">
      <MachineSection v-for="machine in machines" :key="machine.id" :machine="machine" />
    </div>

    <SidebarFooter />
  </aside>
</template>

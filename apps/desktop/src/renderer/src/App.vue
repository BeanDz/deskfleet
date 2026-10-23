<script setup lang="ts">
import { storeToRefs } from "pinia"
import { onMounted, watch } from "vue"
import { RouterView } from "vue-router"
import DetailsPanel from "./components/details/DetailsPanel.vue"
import AppSidebar from "./components/sidebar/AppSidebar.vue"
import { useLayoutStore } from "./stores/layout.ts"
import { useFleetStore } from "./stores/fleet.ts"
import { useTerminalsStore } from "./stores/terminals.ts"

const { sidebarOpen, detailsOpen } = storeToRefs(useLayoutStore())
const fleet = useFleetStore()
const terminals = useTerminalsStore()
watch(() => fleet.localDesktopTarget.online, (online) => { if (online) void terminals.refresh() })
onMounted(() => { void fleet.refreshLocalDesktop() })
</script>

<template>
  <div class="flex h-full overflow-hidden">
    <AppSidebar v-if="sidebarOpen" />
    <main class="flex min-w-0 flex-1 flex-col">
      <RouterView />
    </main>
    <DetailsPanel v-if="detailsOpen" />
  </div>
</template>

import { useLocalStorage } from "@vueuse/core"
import { defineStore } from "pinia"

export type DetailsTab = "details" | "changes"

export const useLayoutStore = defineStore("layout", () => {
  // Per-device preferences; they fall back to the defaults when storage is unavailable.
  const sidebarOpen = useLocalStorage("deskfleet.sidebar-open", true)
  const detailsOpen = useLocalStorage("deskfleet.details-open", true)
  const detailsTab = useLocalStorage<DetailsTab>("deskfleet.details-tab", "details")

  function toggleSidebar(): void {
    sidebarOpen.value = !sidebarOpen.value
  }

  function toggleDetails(): void {
    detailsOpen.value = !detailsOpen.value
  }

  return { sidebarOpen, detailsOpen, detailsTab, toggleSidebar, toggleDetails }
})

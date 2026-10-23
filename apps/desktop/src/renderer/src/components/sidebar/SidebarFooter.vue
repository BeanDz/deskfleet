<script setup lang="ts">
import { Settings } from "@lucide/vue"
import { storeToRefs } from "pinia"
import { computed } from "vue"
import { useI18n } from "vue-i18n"
import { useRouter } from "vue-router"
import { useFleetStore } from "../../stores/fleet.ts"
import IconButton from "../common/IconButton.vue"

const { t } = useI18n()
const router = useRouter()
const { team } = storeToRefs(useFleetStore())
const initial = computed(() => team.value.name.trim().charAt(0).toUpperCase())
</script>

<template>
  <footer class="flex h-12 shrink-0 items-center gap-1 border-t border-ui-border px-2">
    <div
      class="flex min-w-0 flex-1 items-center gap-2 px-1"
      :title="t('common.placeholderControl', { label: t('nav.team') })"
    >
      <span
        class="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-ui-avatar text-xs font-semibold text-white"
        aria-hidden="true"
      >
        {{ initial }}
      </span>
      <span class="truncate">{{ team.name }}</span>
    </div>
    <IconButton :icon="Settings" :label="t('nav.settings')" @click="router.push({ name: 'settings' })" />
  </footer>
</template>

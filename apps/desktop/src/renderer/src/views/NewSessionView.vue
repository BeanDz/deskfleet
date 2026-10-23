<script setup lang="ts">
import { storeToRefs } from "pinia"
import { useI18n } from "vue-i18n"
import PaneHeader from "../components/chrome/PaneHeader.vue"
import SessionComposer from "../components/composer/SessionComposer.vue"
import { useFleetStore } from "../stores/fleet.ts"

const { t } = useI18n()
const { newSessionTarget } = storeToRefs(useFleetStore())
</script>

<template>
  <PaneHeader />
  <div class="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 px-6">
    <h1 class="m-0 text-center text-3xl font-semibold">{{ t("newSession.heading") }}</h1>
    <p v-if="!newSessionTarget" class="m-0 text-ui-text-muted">{{ t("newSession.noTarget") }}</p>
  </div>
  <SessionComposer :location="newSessionTarget" show-target />
</template>

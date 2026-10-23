<script setup lang="ts">
import { computed } from "vue"
import { useI18n } from "vue-i18n"
import PaneHeader from "../components/chrome/PaneHeader.vue"
import ResourcePath from "../components/chrome/ResourcePath.vue"
import SessionComposer from "../components/composer/SessionComposer.vue"
import { useFleetStore } from "../stores/fleet.ts"

const props = defineProps<{ sessionId: string }>()
const { t } = useI18n()
const fleet = useFleetStore()
const location = computed(() => fleet.findSession(props.sessionId))
</script>

<template>
  <PaneHeader>
    <template v-if="location">
      {{ location.session.title }}
      <ResourcePath
        :segments="[location.machine.name, location.workspace.name, location.worktree.name]"
      />
    </template>
  </PaneHeader>
  <div class="flex min-h-0 flex-1 items-center justify-center px-6 text-ui-text-muted">
    {{ location ? t("session.historyUnavailable") : t("session.notFound") }}
  </div>
  <SessionComposer v-if="location" :location="location" />
</template>

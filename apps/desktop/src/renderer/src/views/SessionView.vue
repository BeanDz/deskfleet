<script setup lang="ts">
import { computed } from "vue"
import { useI18n } from "vue-i18n"
import { RouterLink } from "vue-router"
import PaneHeader from "../components/chrome/PaneHeader.vue"
import ResourcePath from "../components/chrome/ResourcePath.vue"
import SessionComposer from "../components/composer/SessionComposer.vue"
import { useFleetStore } from "../stores/fleet.ts"
import { useWorktreeLabel } from "../composables/useWorktreeLabel.ts"
import { useSessionLabel } from "../composables/useSessionLabel.ts"

const props = defineProps<{ sessionId: string }>()
const { t } = useI18n()
const worktreeLabel = useWorktreeLabel()
const sessionLabel = useSessionLabel()
const fleet = useFleetStore()
const location = computed(() => fleet.findSession(props.sessionId))
</script>

<template>
  <PaneHeader>
    <template v-if="location">
      {{ sessionLabel(location.session) }}
      <ResourcePath
        :segments="[location.machine.name, location.workspace.name]"
      />
    </template>
  </PaneHeader>
  <div v-if="location" class="mx-auto w-full max-w-3xl px-6 pt-4">
    <RouterLink :to="{ name: 'worktree', params: { worktreeId: location.worktree.id } }" class="ui-card-row rounded-lg border border-ui-border bg-ui-surface hover:bg-ui-hover">
      <span class="flex-1">{{ worktreeLabel() }}</span>
      <span class="text-xs text-ui-text-muted">{{ t("workspace.directoryCount", { count: location.worktree.directories.length }) }}</span>
    </RouterLink>
  </div>
  <div class="flex min-h-0 flex-1 items-center justify-center px-6 text-ui-text-muted">
    {{ location ? t("session.historyUnavailable") : t("session.notFound") }}
  </div>
  <SessionComposer v-if="location" :location="location" />
</template>

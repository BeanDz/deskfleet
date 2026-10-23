<script setup lang="ts">
import { SquarePen } from "@lucide/vue"
import { computed } from "vue"
import { useI18n } from "vue-i18n"
import { RouterLink, useRouter } from "vue-router"
import PaneHeader from "../components/chrome/PaneHeader.vue"
import ResourcePath from "../components/chrome/ResourcePath.vue"
import DirectoryList from "../components/catalog/DirectoryList.vue"
import { useWorktreeLabel } from "../composables/useWorktreeLabel.ts"
import { useFleetStore } from "../stores/fleet.ts"

const props = defineProps<{ worktreeId: string }>()
const { t } = useI18n()
const worktreeLabel = useWorktreeLabel()
const fleet = useFleetStore()
const router = useRouter()
const location = computed(() => fleet.findWorktree(props.worktreeId))
const available = computed(() => fleet.canManageCatalog && location.value?.machine.local)
function startSession(): void {
  fleet.targetWorktree(props.worktreeId)
  void router.push({ name: "new-session" })
}
</script>

<template>
  <PaneHeader>
    <template v-if="location">
      {{ worktreeLabel(location.worktree) }}
      <ResourcePath :segments="[location.machine.name, location.workspace.name]" />
    </template>
  </PaneHeader>
  <div v-if="!location" class="flex min-h-0 flex-1 items-center justify-center px-6 text-ui-text-muted">
    {{ fleet.catalogLoading ? t("catalog.loading") : t("worktree.notFound") }}
  </div>
  <div v-else class="min-h-0 flex-1 overflow-y-auto">
    <div class="mx-auto flex max-w-3xl flex-col gap-8 px-6 pb-8 pt-4">
      <p v-if="!available" class="m-0 text-sm text-ui-text-muted">{{ t("catalog.offline") }}</p>
      <section>
        <h2 class="ui-section-title">{{ t("worktree.directories") }}</h2>
        <DirectoryList :directories="location.worktree.directories" :disabled="!available" />
        <RouterLink v-if="location.worktree.sessionId === undefined" :to="{ name: 'workspace', params: { workspaceId: location.workspace.id } }" class="mt-3 inline-block text-sm text-ui-accent">{{ t("worktree.manageWorkspace") }}</RouterLink>
      </section>
      <section v-if="location.worktree.sessionId === undefined || location.worktree.sessions.length">
        <div class="flex items-center justify-between">
          <h2 class="ui-section-title">{{ t("worktree.sessions") }}</h2>
          <button v-if="location.worktree.sessionId === undefined" type="button" class="ui-text-button cursor-pointer hover:bg-ui-hover" @click="startSession">
            <SquarePen :size="15" :stroke-width="1.75" aria-hidden="true" />{{ t("worktree.newSession") }}
          </button>
        </div>
        <ul v-if="location.worktree.sessions.length" class="ui-card">
          <li v-for="session in location.worktree.sessions" :key="session.id">
            <RouterLink :to="{ name: 'session', params: { sessionId: session.id } }" class="ui-card-row hover:bg-ui-hover">{{ session.title }}</RouterLink>
          </li>
        </ul>
        <p v-else class="m-0 text-ui-text-muted">{{ t("worktree.noSessions") }}</p>
      </section>
    </div>
  </div>
</template>

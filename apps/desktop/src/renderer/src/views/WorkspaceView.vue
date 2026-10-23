<script setup lang="ts">
import { computed, ref, watch } from "vue"
import { useI18n } from "vue-i18n"
import { RouterLink, useRouter } from "vue-router"
import type { CatalogDirectory } from "../../../shared/catalog.ts"
import PaneHeader from "../components/chrome/PaneHeader.vue"
import ResourcePath from "../components/chrome/ResourcePath.vue"
import ConfirmDelete from "../components/catalog/ConfirmDelete.vue"
import DirectoryList from "../components/catalog/DirectoryList.vue"
import WorkspaceForm from "../components/catalog/WorkspaceForm.vue"
import { useWorktreeLabel } from "../composables/useWorktreeLabel.ts"
import { useFleetStore } from "../stores/fleet.ts"

const props = defineProps<{ workspaceId: string }>()
const { t } = useI18n()
const worktreeLabel = useWorktreeLabel()
const fleet = useFleetStore()
const router = useRouter()
const location = computed(() => fleet.findWorkspace(props.workspaceId))
const editable = computed(() => fleet.canManageCatalog && location.value?.machine.local)
const main = computed(() => location.value?.workspace.worktrees.find(worktree => worktree.sessionId === undefined))
const directories = computed(() => main.value?.directories ?? [])
const editing = ref(false)
watch(() => props.workspaceId, () => { editing.value = false })
async function save(name: string, paths: CatalogDirectory[]): Promise<void> {
  await fleet.updateWorkspace(props.workspaceId, name, paths)
  editing.value = false
}
async function remove(): Promise<void> {
  await fleet.deleteWorkspace(props.workspaceId)
  await router.push({ name: "new-session" })
}
</script>

<template>
  <PaneHeader>
    <template v-if="location">
      {{ location.workspace.name }}
      <ResourcePath :segments="[location.machine.name]" />
    </template>
  </PaneHeader>
  <div v-if="!location" class="flex min-h-0 flex-1 items-center justify-center px-6 text-ui-text-muted">
    {{ fleet.catalogLoading ? t("catalog.loading") : t("workspace.notFound") }}
  </div>
  <div v-else class="min-h-0 flex-1 overflow-y-auto">
    <div class="mx-auto flex max-w-3xl flex-col gap-8 px-6 pb-8 pt-4">
      <p v-if="!editable" class="m-0 text-sm text-ui-text-muted">{{ t("catalog.offline") }}</p>
      <section class="flex flex-col gap-3">
        <div class="flex items-center justify-between">
          <h2 class="ui-section-title">{{ t("worktree.directories") }}</h2>
          <button type="button" class="catalog-button" :disabled="!editable || editing" @click="editing = true">{{ t("workspace.edit") }}</button>
        </div>
        <WorkspaceForm v-if="editing" :key="workspaceId" :initial="{ name: location.workspace.name, directories }" :submit-label="t('catalog.save')" :disabled="!editable" :save="save" @cancel="editing = false" />
        <DirectoryList v-else :directories="directories" :disabled="!editable" default-action />
      </section>
      <section>
        <h2 class="ui-section-title">{{ t("workspace.worktrees") }}</h2>
        <ul class="ui-card">
          <li v-for="worktree in location.workspace.worktrees" :key="worktree.id">
            <RouterLink :to="{ name: 'worktree', params: { worktreeId: worktree.id } }" class="ui-card-row hover:bg-ui-hover">
              <span class="min-w-0 flex-1 truncate">{{ worktreeLabel(worktree) }}</span>
              <span class="text-xs text-ui-text-muted">{{ t("workspace.directoryCount", { count: worktree.directories.length }) }}</span>
            </RouterLink>
          </li>
        </ul>
      </section>
      <section class="border-t border-ui-border pt-5">
        <ConfirmDelete :key="workspaceId" :label="t('workspace.delete')" :question="t('workspace.deleteQuestion', { name: location.workspace.name })" :disabled="!editable" :remove="remove" />
      </section>
    </div>
  </div>
</template>

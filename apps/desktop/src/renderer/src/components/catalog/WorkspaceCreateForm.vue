<script setup lang="ts">
import { useI18n } from "vue-i18n"
import type { CatalogDirectory } from "../../../../shared/catalog.ts"
import { useFleetStore } from "../../stores/fleet.ts"
import WorkspaceForm from "./WorkspaceForm.vue"

const emit = defineEmits<{ created: [id: string]; cancel: [] }>()
const { t } = useI18n()
const fleet = useFleetStore()
async function create(name: string, directories: CatalogDirectory[]): Promise<void> {
  emit("created", (await fleet.createWorkspace(name, directories)).id)
}
</script>

<template>
  <WorkspaceForm class="mx-2 my-2" :submit-label="t('catalog.create')" :disabled="!fleet.canManageCatalog" :save="create" @cancel="emit('cancel')" />
</template>

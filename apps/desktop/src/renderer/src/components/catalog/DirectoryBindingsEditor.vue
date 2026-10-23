<script setup lang="ts">
import { ArrowDown, ArrowUp, Plus, X } from "@lucide/vue"
import { useI18n } from "vue-i18n"
import { useId } from "vue"
import type { CatalogDirectory } from "../../../../shared/catalog.ts"

const bindings = defineModel<CatalogDirectory[]>({ required: true })
defineProps<{ disabled?: boolean }>()
const { t } = useI18n()
const idPrefix = useId()
function move(index: number, offset: number): void {
  const next = index + offset
  if (next < 0 || next >= bindings.value.length) return
  const [directory] = bindings.value.splice(index, 1)
  bindings.value.splice(next, 0, directory!)
}
</script>

<template>
  <fieldset class="m-0 min-w-0 p-0" :disabled="disabled">
    <legend class="mb-1 font-medium">{{ t("worktree.directories") }}</legend>
    <p class="mb-3 mt-0 text-xs text-ui-text-muted">{{ t("catalog.defaultDirectoryHint") }}</p>
    <div v-for="(directory, index) in bindings" :key="index" class="mb-3 flex flex-col gap-1.5">
      <div class="flex items-center justify-between gap-2">
        <label :for="`${idPrefix}-directory-path-${index}`" class="text-xs text-ui-text-muted">
          {{ t("catalog.directoryPath", { number: index + 1 }) }}
          <span v-if="index === 0" class="ui-badge ml-1">{{ t("catalog.defaultDirectory") }}</span>
        </label>
        <div class="flex gap-1">
          <button type="button" class="catalog-button px-1" :disabled="index === 0" :aria-label="t('catalog.moveDirectoryUp', { number: index + 1 })" @click="move(index, -1)"><ArrowUp :size="13" aria-hidden="true" /></button>
          <button type="button" class="catalog-button px-1" :disabled="index === bindings.length - 1" :aria-label="t('catalog.moveDirectoryDown', { number: index + 1 })" @click="move(index, 1)"><ArrowDown :size="13" aria-hidden="true" /></button>
          <button type="button" class="catalog-button px-1" :disabled="bindings.length === 1" :aria-label="t('catalog.removeDirectory', { number: index + 1 })" @click="bindings.splice(index, 1)"><X :size="13" aria-hidden="true" /></button>
        </div>
      </div>
      <input :id="`${idPrefix}-directory-path-${index}`" v-model="directory.path" required class="catalog-input font-mono" :name="`directory-path-${index}`" :placeholder="t('catalog.absolutePath')" />
    </div>
    <button type="button" class="catalog-button" @click="bindings.push({ path: '' })"><Plus :size="14" aria-hidden="true" />{{ t("catalog.addDirectory") }}</button>
  </fieldset>
</template>

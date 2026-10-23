<script setup lang="ts">
import { ArrowDown, ArrowUp, Plus, X } from "@lucide/vue"
import { useI18n } from "vue-i18n"
import type { CatalogDirectory } from "../../../../shared/catalog.ts"

const bindings = defineModel<CatalogDirectory[]>({ required: true })
defineProps<{ disabled?: boolean }>()
const { t } = useI18n()
function move(index: number, offset: number): void {
  const next = index + offset
  if (next < 0 || next >= bindings.value.length) return
  const [directory] = bindings.value.splice(index, 1)
  bindings.value.splice(next, 0, directory!)
}
</script>

<template>
  <fieldset class="m-0 min-w-0 p-0" :disabled="disabled">
    <legend class="mb-1.5 p-0 text-sm">{{ t("worktree.directories") }}</legend>
    <div v-for="(directory, index) in bindings" :key="index" class="mb-2 flex items-center gap-1">
      <div class="relative min-w-0 flex-1">
        <input v-model="directory.path" required class="catalog-input font-mono" :class="index === 0 && 'pr-18'" :name="`directory-path-${index}`" :aria-label="t('catalog.directoryPath', { number: index + 1 })" :placeholder="t('catalog.absolutePath')" />
        <span v-if="index === 0" class="ui-badge pointer-events-none absolute right-2 top-1/2 -translate-y-1/2">{{ t("catalog.defaultDirectory") }}</span>
      </div>
      <button type="button" class="catalog-button shrink-0 px-1" :disabled="index === 0" :aria-label="t('catalog.moveDirectoryUp', { number: index + 1 })" @click="move(index, -1)"><ArrowUp :size="13" aria-hidden="true" /></button>
      <button type="button" class="catalog-button shrink-0 px-1" :disabled="index === bindings.length - 1" :aria-label="t('catalog.moveDirectoryDown', { number: index + 1 })" @click="move(index, 1)"><ArrowDown :size="13" aria-hidden="true" /></button>
      <button type="button" class="catalog-button shrink-0 px-1" :disabled="bindings.length === 1" :aria-label="t('catalog.removeDirectory', { number: index + 1 })" @click="bindings.splice(index, 1)"><X :size="13" aria-hidden="true" /></button>
    </div>
    <button type="button" class="catalog-button" @click="bindings.push({ path: '' })"><Plus :size="14" aria-hidden="true" />{{ t("catalog.addDirectory") }}</button>
  </fieldset>
</template>

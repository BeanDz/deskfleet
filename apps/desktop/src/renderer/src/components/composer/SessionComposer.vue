<script setup lang="ts">
import { ArrowUp, Bot, Folder, Monitor } from "@lucide/vue"
import { useTextareaAutosize } from "@vueuse/core"
import { useTemplateRef } from "vue"
import { useI18n } from "vue-i18n"
import type { WorkspaceLocation } from "../../stores/fleet.ts"
const props = defineProps<{ location: WorkspaceLocation | null; showTarget?: boolean; disabled?: boolean; submitting?: boolean; activeTurn?: boolean; waitingForAgent?: boolean; canSteer?: boolean }>()
const draft = defineModel<string>({ default: "" })
const emit = defineEmits<{ submit: [delivery: "backlog" | "steer"] }>()
const { t } = useI18n()
const textarea = useTemplateRef<HTMLTextAreaElement>("textarea")
useTextareaAutosize({ element: textarea, input: draft })
function submit(delivery: "backlog" | "steer"): void {
  if (props.disabled || props.submitting || !props.location || !draft.value.trim()) return
  emit("submit", delivery)
}
function keydown(event: KeyboardEvent): void {
  if (event.key === "Enter" && !event.shiftKey && !event.isComposing) { event.preventDefault(); submit("backlog") }
}
</script>

<template>
  <div class="mx-auto w-full max-w-3xl shrink-0 px-6 pb-5">
    <div v-if="showTarget && location" class="mb-2 flex flex-wrap items-center gap-2">
      <span class="ui-chip"><Monitor :size="15" :stroke-width="1.75" aria-hidden="true" /><span class="font-medium">{{ location.machine.name }}</span><span v-if="location.machine.local" class="ui-badge">{{ t("machine.local") }}</span></span>
      <span class="ui-chip"><Folder :size="15" :stroke-width="1.75" aria-hidden="true" />{{ location.workspace.name }}</span>
      <span class="ui-chip"><Bot :size="15" :stroke-width="1.75" aria-hidden="true" />Codex</span>
    </div>
    <div class="rounded-2xl border border-ui-border bg-ui-surface shadow-ui-card focus-within:border-ui-text-faint">
      <textarea ref="textarea" v-model="draft" rows="2" class="block max-h-60 min-h-12 w-full resize-none bg-transparent px-4 pt-3 text-sm leading-6 outline-none select-text placeholder:text-ui-text-faint" :aria-label="t('composer.label')" :placeholder="t('composer.placeholder')" @keydown="keydown" />
      <div class="flex items-center justify-end gap-2 px-2 pb-2">
        <span v-if="activeTurn || waitingForAgent" class="mr-auto px-2 text-xs text-ui-text-muted">{{ t(waitingForAgent ? 'agent.stoppedHint' : 'agent.backlogHint') }}</span>
        <button v-if="canSteer" type="button" class="catalog-button" :disabled="disabled || submitting || !draft.trim()" @click="submit('steer')">{{ t('agent.steer') }}</button>
        <button type="button" class="inline-flex h-8 w-8 items-center justify-center rounded-full bg-ui-action text-ui-action-text disabled:cursor-default disabled:bg-ui-action-disabled disabled:text-ui-action-text" :title="t(activeTurn || waitingForAgent ? 'agent.addToBacklog' : 'composer.send')" :aria-label="t(activeTurn || waitingForAgent ? 'agent.addToBacklog' : 'composer.send')" :disabled="disabled || submitting || !location || !draft.trim()" @click="submit('backlog')"><ArrowUp :size="17" :stroke-width="2" aria-hidden="true" /></button>
      </div>
    </div>
  </div>
</template>

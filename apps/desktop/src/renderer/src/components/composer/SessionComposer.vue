<script setup lang="ts">
import { ArrowUp, Bot, CornerDownRight, Folder, GitBranch, Monitor, Square } from "@lucide/vue"
import { useTextareaAutosize } from "@vueuse/core"
import { computed, useTemplateRef } from "vue"
import { useI18n } from "vue-i18n"
import { RouterLink } from "vue-router"
import type { WorktreeSummary } from "../../stores/fleet-types.ts"
import type { WorkspaceLocation } from "../../stores/fleet.ts"
const props = defineProps<{
  location: (WorkspaceLocation & { worktree?: WorktreeSummary }) | null
  provider?: string
  showTarget?: boolean
  disabled?: boolean
  submitting?: boolean
  activeTurn?: boolean
  waitingForAgent?: boolean
  canSteer?: boolean
  /** Whether the empty composer offers to cancel the active turn. */
  canCancel?: boolean
}>()
const draft = defineModel<string>({ default: "" })
const emit = defineEmits<{ submit: [delivery: "backlog" | "steer"]; cancel: [] }>()
const { t } = useI18n()
const textarea = useTemplateRef<HTMLTextAreaElement>("textarea")
useTextareaAutosize({ element: textarea, input: draft })
const empty = computed(() => !draft.value.trim())
const queued = computed(() => props.activeTurn || props.waitingForAgent)
const placeholder = computed(() => t(props.waitingForAgent ? "agent.stoppedHint" : props.activeTurn ? "agent.backlogHint" : "composer.placeholder"))
const checkout = computed(() => props.location?.worktree?.directories.find(directory => directory.git)?.git ?? undefined)
const changes = computed(() => (checkout.value?.changes ?? []).reduce((total, change) => ({ additions: total.additions + change.additions, deletions: total.deletions + change.deletions }), { additions: 0, deletions: 0 }))
function submit(delivery: "backlog" | "steer"): void {
  if (props.disabled || props.submitting || !props.location || empty.value) return
  emit("submit", delivery)
}
function keydown(event: KeyboardEvent): void {
  if (event.key === "Enter" && !event.shiftKey && !event.isComposing) { event.preventDefault(); submit("backlog") }
}
</script>

<template>
  <div class="mx-auto flex w-full max-w-3xl shrink-0 flex-col gap-2 px-6 pb-5">
    <div v-if="location" class="flex h-9 min-w-0 items-center gap-3 rounded-xl border border-ui-border bg-ui-surface px-3 text-[13px] text-ui-text-muted" role="group" :aria-label="t('composer.context')">
      <span class="inline-flex min-w-0 items-center gap-1.5" data-composer-context><Monitor :size="15" :stroke-width="1.75" class="shrink-0" aria-hidden="true" /><span class="truncate">{{ location.machine.name }}</span><span v-if="showTarget && location.machine.local" class="ui-badge">{{ t("machine.local") }}</span></span>
      <span class="h-4 w-px shrink-0 bg-ui-border" aria-hidden="true" />
      <span class="inline-flex min-w-0 items-center gap-1.5" data-composer-context><Folder :size="15" :stroke-width="1.75" class="shrink-0" aria-hidden="true" /><span class="truncate">{{ location.workspace.name }}</span></span>
      <template v-if="location.worktree">
        <span class="h-4 w-px shrink-0 bg-ui-border" aria-hidden="true" />
        <RouterLink :to="{ name: 'worktree', params: { worktreeId: location.worktree.id } }" class="inline-flex min-w-0 items-center gap-1.5 rounded-md text-ui-text hover:underline" :title="t('session.worktree')" data-composer-context>
          <GitBranch :size="15" :stroke-width="1.75" class="shrink-0 text-ui-text-muted" aria-hidden="true" /><span class="truncate">{{ checkout?.branch ?? t('session.worktree') }}</span>
        </RouterLink>
      </template>
      <span v-if="changes.additions || changes.deletions" class="ml-auto shrink-0 rounded-md bg-ui-badge px-1.5 font-mono text-xs leading-5"><span class="text-ui-success">+{{ changes.additions }}</span> <span class="text-ui-danger">−{{ changes.deletions }}</span></span>
    </div>
    <div class="rounded-2xl border border-ui-border bg-ui-surface shadow-ui-card focus-within:border-ui-text-faint">
      <textarea ref="textarea" v-model="draft" rows="2" class="block max-h-60 min-h-14 w-full resize-none bg-transparent px-4 pt-3 text-[15px] leading-6 outline-none select-text placeholder:text-ui-text-faint" :aria-label="t('composer.label')" :placeholder="placeholder" @keydown="keydown" />
      <div class="flex items-center gap-2 px-3 pb-2.5">
        <span v-if="location" class="inline-flex h-7 items-center gap-1.5 px-1 text-[13px] text-ui-text-muted" :title="t('composer.provider')" data-composer-context><Bot :size="15" :stroke-width="1.75" aria-hidden="true" />{{ provider ?? "Codex" }}</span>
        <button v-if="canSteer && !empty" type="button" class="ui-text-button ml-auto cursor-pointer hover:bg-ui-hover hover:text-ui-text disabled:cursor-default disabled:opacity-50" :disabled="disabled || submitting" @click="submit('steer')"><CornerDownRight :size="14" :stroke-width="1.75" aria-hidden="true" />{{ t('agent.steer') }}</button>
        <button v-if="canCancel && empty" type="button" class="ml-auto inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-ui-action text-ui-action-text" :title="t('agent.cancelTurn')" :aria-label="t('agent.cancelTurn')" @click="emit('cancel')"><Square :size="12" :stroke-width="0" fill="currentColor" aria-hidden="true" /></button>
        <button v-else type="button" class="inline-flex h-8 w-8 items-center justify-center rounded-full bg-ui-action text-ui-action-text disabled:cursor-default disabled:bg-ui-action-disabled disabled:text-ui-action-text" :class="!(canSteer && !empty) && 'ml-auto'" :title="t(queued ? 'agent.addToBacklog' : 'composer.send')" :aria-label="t(queued ? 'agent.addToBacklog' : 'composer.send')" :disabled="disabled || submitting || !location || empty" @click="submit('backlog')"><ArrowUp :size="17" :stroke-width="2" aria-hidden="true" /></button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue"
import { useI18n } from "vue-i18n"
import type { AgentInput } from "../../../../../../daemon/src/agent-protocol.ts"
import AgentActor from "./AgentActor.vue"
import AgentContent from "./AgentContent.vue"
const props = defineProps<{ inputs: AgentInput[]; canSteer: boolean; disabled: boolean }>()
const emit = defineEmits<{ steer: [id: string]; withdraw: [id: string]; retry: [id: string] }>()
const { t } = useI18n()
const candidates = computed(() => props.inputs.filter(input => ["pending", "failed", "uncertain"].includes(input.state)))
</script>

<template>
  <section v-if="candidates.length" class="rounded-xl border border-ui-border bg-ui-surface p-4" :aria-label="t('agent.backlog')">
    <h2 class="m-0 mb-3 text-sm font-semibold">{{ t('agent.backlog') }} <span class="text-ui-text-muted">{{ candidates.length }}</span></h2>
    <ol class="flex flex-col gap-4">
      <li v-for="input in candidates" :key="input.id" :data-input-id="input.id">
        <div class="mb-1 flex flex-wrap items-center gap-2 text-xs text-ui-text-muted"><AgentActor :actor="input.author" /><span>· {{ t(`agent.inputState.${input.state}`) }}</span></div>
        <AgentContent :content="input.content" />
        <p v-if="input.error" class="m-0 mt-1 break-words text-xs text-ui-danger">{{ input.error }}</p>
        <p v-if="input.state === 'uncertain'" class="m-0 mt-1 text-xs text-ui-text-muted">{{ t('agent.uncertainInput') }}</p>
        <div class="mt-2 flex gap-2">
          <button v-if="input.state === 'pending' && canSteer" class="catalog-button" :disabled="disabled" @click="emit('steer', input.id)">{{ t('agent.steer') }}</button>
          <button v-if="input.state === 'pending'" class="catalog-button" :disabled="disabled" @click="emit('withdraw', input.id)">{{ t('agent.withdraw') }}</button>
          <button v-if="input.state === 'failed'" class="catalog-button" :disabled="disabled" @click="emit('retry', input.id)">{{ t('agent.retryInput') }}</button>
        </div>
      </li>
    </ol>
  </section>
</template>

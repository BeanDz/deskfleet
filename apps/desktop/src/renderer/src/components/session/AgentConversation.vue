<script setup lang="ts">
import { computed } from "vue"
import { useI18n } from "vue-i18n"
import type { AgentEvent, AgentSnapshot } from "../../../../../../daemon/src/agent-protocol.ts"
import { projectConversation } from "../../services/agent-conversation.ts"
import AgentActor from "./AgentActor.vue"
import AgentContent from "./AgentContent.vue"
import AgentToolCall from "./AgentToolCall.vue"
const props = defineProps<{ events: AgentEvent[]; snapshot: AgentSnapshot }>()
const { t } = useI18n()
const entries = computed(() => projectConversation(props.events, props.snapshot))
</script>

<template>
  <ol class="flex flex-col gap-5" :aria-label="t('agent.conversation')">
    <li v-for="entry in entries" :key="entry.id" :data-conversation-entry="entry.id">
      <div v-if="entry.kind === 'input'" class="ml-8 rounded-xl border border-ui-border bg-ui-surface p-3">
        <div class="mb-2 text-xs text-ui-text-muted"><AgentActor :actor="entry.input.author" /></div>
        <AgentContent :content="entry.input.content" />
        <p v-if="entry.input.state !== 'delivered'" class="m-0 mt-2 text-xs text-ui-text-muted">{{ t(entry.input.state === 'dispatching' && entry.input.actualDelivery === 'turn_start' ? 'agent.inputInProgress' : `agent.inputState.${entry.input.state}`) }}</p>
        <div v-if="entry.input.actualDelivery && (entry.input.requestedDelivery === 'steer' || entry.input.actualDelivery === 'steer')" class="mt-2 text-xs text-ui-text-muted">
          {{ t(entry.input.actualDelivery === 'turn_start' ? 'agent.startedNewTurn' : 'agent.steered') }}
          <template v-if="entry.input.dispatcher"> · <AgentActor :actor="entry.input.dispatcher" /></template>
        </div>
      </div>
      <template v-else-if="entry.kind === 'message'">
        <details v-if="entry.role === 'thought'" class="text-sm text-ui-text-muted"><summary class="mb-2 cursor-pointer">{{ t('agent.thinking') }}</summary><AgentContent :content="entry.content" /></details>
        <AgentContent v-else :content="entry.content" />
      </template>
      <AgentToolCall v-else-if="entry.kind === 'tool'" :tool="entry.tool" />
      <div v-else-if="entry.kind === 'turn'" class="text-xs text-ui-text-muted">{{ t(`agent.turnState.${entry.turn.state}`) }}<p v-if="entry.turn.error" class="mt-1 break-words text-ui-danger">{{ entry.turn.error }}</p></div>
      <div v-else class="rounded-lg border border-ui-border p-3">
        <p class="m-0 mb-2 text-xs font-medium text-ui-text-muted">{{ t('agent.plan') }}</p>
        <ol class="flex flex-col gap-1 text-sm"><li v-for="(item, index) in entry.entries" :key="index" :class="item.status === 'completed' ? 'text-ui-text-muted line-through' : ''">{{ item.status === 'completed' ? '✓' : item.status === 'in_progress' ? '→' : '·' }} {{ item.content }}</li></ol>
      </div>
    </li>
  </ol>
</template>

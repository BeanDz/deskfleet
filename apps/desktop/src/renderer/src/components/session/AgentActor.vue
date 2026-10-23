<script setup lang="ts">
import { useI18n } from "vue-i18n"
import type { AgentActor } from "../../../../../../daemon/src/agent-protocol.ts"
defineProps<{ actor: AgentActor }>()
const { t } = useI18n()
</script>

<template>
  <span :title="`${actor.sourceMachine.originId}/${actor.sourceMachine.id}`">{{ actor.userId ?? t(actor.kind === 'system' ? 'agent.system' : 'agent.localUser') }} · {{ t('agent.sourceMachine', { id: actor.sourceMachine.id }) }}</span>
</template>

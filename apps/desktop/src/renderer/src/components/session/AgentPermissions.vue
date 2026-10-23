<script setup lang="ts">
import { useI18n } from "vue-i18n"
import type { AgentPermission } from "../../../../../../daemon/src/agent-protocol.ts"
import AgentActor from "./AgentActor.vue"
import AgentToolCall from "./AgentToolCall.vue"
defineProps<{ permissions: AgentPermission[]; disabled: boolean }>()
const emit = defineEmits<{ respond: [id: string, optionId: string] }>()
const { t } = useI18n()
const selectedLabel = (permission: AgentPermission) => permission.request.options.find(option => option.optionId === permission.optionId)?.name ?? permission.optionId
</script>

<template>
  <section v-if="permissions.length" class="flex flex-col gap-3" :aria-label="t('agent.permissions')">
    <div v-for="permission in permissions" :key="permission.id" class="rounded-xl border border-ui-border bg-ui-surface p-4" :data-permission-id="permission.id">
      <h2 class="m-0 mb-2 text-sm font-semibold">{{ t(permission.state === 'pending' ? 'agent.permissionRequired' : permission.state === 'resolved' ? 'agent.permissionResolved' : 'agent.permissionCancelled') }}</h2>
      <AgentToolCall :tool="permission.request.toolCall" />
      <div v-if="permission.state === 'pending'" class="mt-3 flex flex-wrap gap-2">
        <button v-for="option in permission.request.options" :key="option.optionId" class="catalog-button" :disabled="disabled" @click="emit('respond', permission.id, option.optionId)">{{ option.name }}</button>
      </div>
      <p v-else-if="permission.state === 'resolved'" class="m-0 mt-2 text-xs text-ui-text-muted">{{ selectedLabel(permission) }}<template v-if="permission.actor"> · <AgentActor :actor="permission.actor" /></template></p>
    </div>
  </section>
</template>

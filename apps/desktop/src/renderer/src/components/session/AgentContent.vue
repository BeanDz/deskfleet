<script setup lang="ts">
import { useI18n } from "vue-i18n"
import type { AgentInput } from "../../../../../../daemon/src/agent-protocol.ts"
defineProps<{ content: AgentInput["content"] }>()
const { t } = useI18n()
</script>

<template>
  <div class="flex min-w-0 flex-col gap-2 break-words text-sm leading-6 select-text">
    <template v-for="(block, index) in content" :key="index">
      <div v-if="block.type === 'text'" class="whitespace-pre-wrap">{{ block.text }}</div>
      <img v-else-if="block.type === 'image'" :src="`data:${block.mimeType};base64,${block.data}`" :alt="t('agent.image')" class="max-h-96 max-w-full rounded-lg object-contain" />
      <div v-else-if="block.type === 'resource' && 'text' in block.resource" class="whitespace-pre-wrap font-mono text-xs">{{ block.resource.text }}</div>
      <div v-else-if="block.type === 'resource_link'" class="break-all rounded border border-ui-border px-3 py-2 font-mono text-xs">{{ block.name }}<br />{{ block.uri }}</div>
      <p v-else class="m-0 text-xs text-ui-text-muted">{{ t('agent.contentType', { type: block.type }) }}</p>
    </template>
  </div>
</template>

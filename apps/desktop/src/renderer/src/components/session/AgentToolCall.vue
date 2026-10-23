<script setup lang="ts">
import { useI18n } from "vue-i18n"
import type { ConversationTool } from "../../services/agent-conversation.ts"
import { readableValue } from "../../services/agent-conversation.ts"
import AgentContent from "./AgentContent.vue"
defineProps<{ tool: ConversationTool }>()
const { t } = useI18n()
</script>

<template>
  <details class="rounded-lg border border-ui-border bg-ui-surface text-sm">
    <summary class="cursor-pointer px-3 py-2">
      <span>{{ tool.title || t('agent.tool') }}</span>
      <span v-if="tool.status" class="ml-2 text-xs" :class="tool.status === 'failed' ? 'text-ui-danger' : 'text-ui-text-muted'">{{ t(`agent.toolStatus.${tool.status}`, tool.status) }}</span>
    </summary>
    <div class="flex flex-col gap-3 border-t border-ui-border p-3">
      <div v-if="tool.locations?.length" class="text-xs font-mono text-ui-text-muted select-text"><div v-for="location in tool.locations" :key="location.path">{{ location.path }}{{ location.line ? `:${location.line}` : '' }}</div></div>
      <pre v-if="tool.rawInput != null" class="m-0 max-h-64 overflow-auto whitespace-pre-wrap break-words text-xs select-text">{{ readableValue(tool.rawInput) }}</pre>
      <template v-for="(block, index) in tool.content" :key="index">
        <AgentContent v-if="block.type === 'content'" :content="[block.content]" />
        <div v-else-if="block.type === 'diff'" class="overflow-auto rounded border border-ui-border text-xs font-mono select-text">
          <div class="px-2 py-1 text-ui-text-muted">{{ block.path }}</div>
          <pre v-if="block.oldText" class="m-0 whitespace-pre-wrap bg-ui-danger/5 p-2">{{ block.oldText }}</pre>
          <pre class="m-0 whitespace-pre-wrap bg-ui-success/5 p-2">{{ block.newText }}</pre>
        </div>
        <pre v-else class="m-0 max-h-64 overflow-auto whitespace-pre-wrap break-words text-xs select-text">{{ readableValue(block) }}</pre>
      </template>
      <pre v-if="tool.rawOutput != null && !tool.content?.length" class="m-0 max-h-64 overflow-auto whitespace-pre-wrap break-words text-xs select-text">{{ readableValue(tool.rawOutput) }}</pre>
    </div>
  </details>
</template>

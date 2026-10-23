<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue"
import { useI18n } from "vue-i18n"
import { RouterLink, useRouter } from "vue-router"
import PaneHeader from "../components/chrome/PaneHeader.vue"
import ResourcePath from "../components/chrome/ResourcePath.vue"
import SessionComposer from "../components/composer/SessionComposer.vue"
import AgentBacklog from "../components/session/AgentBacklog.vue"
import AgentConversation from "../components/session/AgentConversation.vue"
import AgentPermissions from "../components/session/AgentPermissions.vue"
import { useFleetStore } from "../stores/fleet.ts"
import { useAgentSessionsStore } from "../stores/agent-sessions.ts"
import { useWorktreeLabel } from "../composables/useWorktreeLabel.ts"
import { useSessionLabel } from "../composables/useSessionLabel.ts"
const props = defineProps<{ sessionId: string }>()
const { t } = useI18n()
const router = useRouter()
const worktreeLabel = useWorktreeLabel()
const sessionLabel = useSessionLabel()
const fleet = useFleetStore()
const agents = useAgentSessionsStore()
const location = computed(() => fleet.findSession(props.sessionId))
const view = computed(() => agents.views[props.sessionId])
const snapshot = computed(() => view.value?.snapshot)
const run = computed(() => snapshot.value?.runs.at(-1))
const activeTurn = computed(() => snapshot.value?.turns.find(turn => ["starting", "running", "cancelling"].includes(turn.state)))
const connected = computed(() => agents.state === "connected")
const canResume = computed(() => !snapshot.value?.session.providerSessionId || !!snapshot.value.session.capabilities?.resume)
const canSteer = computed(() => !!snapshot.value?.session.capabilities?.steering && activeTurn.value?.state === "running")
const draft = computed({ get: () => agents.drafts[props.sessionId] ?? "", set: value => { agents.drafts[props.sessionId] = value } })
const unresolvedSubmission = computed(() => Object.values(agents.operations).some(operation => operation.sessionId === props.sessionId && operation.text === draft.value))
const pending = computed(() => Object.values(agents.operations).filter(operation => operation.sessionId === props.sessionId && operation.error))
const busy = ref(false)
const actionError = ref<string | null>(null)
const confirming = ref<"stop" | "delete" | null>(null)
const scroller = ref<HTMLElement | null>(null)
const followBottom = ref(true)
const scroll = () => { const el = scroller.value; if (el) followBottom.value = el.scrollHeight - el.scrollTop - el.clientHeight < 100 }
watch(() => props.sessionId, id => { busy.value = false; confirming.value = null; actionError.value = null; followBottom.value = true; void agents.open(id) }, { immediate: true })
watch(() => view.value?.events.length, async () => { if (followBottom.value) { await nextTick(); scroller.value?.scrollTo({ top: scroller.value.scrollHeight }) } })
async function action(operation: () => Promise<unknown>): Promise<void> {
  if (busy.value) return
  const sessionId = props.sessionId
  busy.value = true
  actionError.value = null
  try { await operation() } catch (reason) { if (props.sessionId === sessionId) actionError.value = reason instanceof Error ? reason.message : String(reason) }
  finally { if (props.sessionId === sessionId) busy.value = false }
}
function submit(delivery: "backlog" | "steer"): void {
  void action(() => agents.submit(props.sessionId, draft.value, delivery, delivery === "steer" ? activeTurn.value?.id : undefined))
}
async function confirm(): Promise<void> {
  const kind = confirming.value
  const sessionId = props.sessionId
  confirming.value = null
  await action(async () => {
    if (kind === "stop") await agents.stop(sessionId)
    else if (kind === "delete") {
      const workspaceId = location.value?.workspace.id
      await agents.remove(sessionId)
      await fleet.refreshLocalCatalog()
      if (router.currentRoute.value.name === "session" && router.currentRoute.value.params.sessionId === sessionId) await router.push(workspaceId ? { name: "workspace", params: { workspaceId } } : { name: "new-session" })
    }
  })
}
</script>

<template>
  <PaneHeader>
    <template v-if="location">{{ snapshot?.session.title || sessionLabel(location.session) }}<ResourcePath :segments="[location.machine.name, location.workspace.name]" /></template>
  </PaneHeader>
  <div ref="scroller" class="min-h-0 flex-1 overflow-y-auto" @scroll="scroll">
    <div class="mx-auto flex w-full max-w-3xl flex-col gap-4 px-6 py-4">
      <RouterLink v-if="location?.worktree" :to="{ name: 'worktree', params: { worktreeId: location.worktree.id } }" class="ui-card-row rounded-lg border border-ui-border bg-ui-surface hover:bg-ui-hover"><span class="flex-1">{{ worktreeLabel() }}</span><span class="text-xs text-ui-text-muted">{{ t('workspace.directoryCount', { count: location.worktree.directories.length }) }}</span></RouterLink>
      <div v-if="snapshot" class="flex flex-wrap items-center gap-2 text-xs">
        <span class="mr-auto text-ui-text-muted">{{ run ? t(`agent.runState.${run.state}`) : t(`agent.lifecycle.${snapshot.session.lifecycle}`) }}</span>
        <button v-if="activeTurn && activeTurn.state !== 'cancelling'" class="catalog-button" :disabled="!connected || busy" @click="action(() => agents.cancel(sessionId, activeTurn!.id))">{{ t('agent.cancelTurn') }}</button>
        <button v-if="run && ['starting', 'running'].includes(run.state)" class="catalog-button" :disabled="!connected || busy" @click="confirming = 'stop'">{{ t('agent.stop') }}</button>
        <button v-else-if="snapshot.session.lifecycle === 'ready' && canResume" class="catalog-button" :disabled="!connected || busy" @click="action(() => agents.resume(sessionId))">{{ t('agent.resume') }}</button>
        <button class="catalog-button" :disabled="!connected || busy" @click="confirming = 'delete'">{{ t('agent.delete') }}</button>
      </div>
      <div v-if="confirming" role="alert" class="rounded-lg border border-ui-border p-3 text-sm">
        <p class="m-0 mb-3">{{ t(confirming === 'stop' ? 'agent.stopQuestion' : 'agent.deleteQuestion') }}</p>
        <div class="flex gap-2"><button class="catalog-button" @click="confirm">{{ t(confirming === 'stop' ? 'agent.stop' : 'catalog.confirmDelete') }}</button><button class="catalog-button" @click="confirming = null">{{ t('catalog.cancel') }}</button></div>
      </div>
      <p v-if="snapshot?.session.lifecycle === 'ready' && run && ['stopped', 'interrupted', 'failed'].includes(run.state) && !canResume" class="m-0 text-sm text-ui-text-muted">{{ t('agent.resumeUnavailable') }}</p>
      <p v-if="view?.loading" class="m-0 text-sm text-ui-text-muted" role="status">{{ t('agent.loading') }}</p>
      <div v-if="!view?.loading && (!connected || view?.error)" class="text-sm text-ui-text-muted" role="status">
        <p class="m-0 mb-2">{{ t('agent.disconnected') }}</p><p v-if="view?.error || agents.error" class="mb-2 break-words text-xs">{{ view?.error || agents.error }}</p>
        <button class="catalog-button" :disabled="agents.state === 'connecting'" @click="action(() => agents.open(sessionId))">{{ t('agent.reconnect') }}</button>
      </div>
      <p v-if="actionError && !pending.some(operation => operation.error === actionError)" role="alert" class="m-0 break-words text-sm text-ui-danger">{{ actionError }}</p>
      <div v-for="operation in pending" :key="operation.operationId" role="alert" class="rounded-lg border border-ui-border p-3 text-xs">
        <p class="m-0 mb-2">{{ t('agent.operationPending') }} {{ operation.error }}</p><button class="catalog-button" :disabled="busy" @click="action(() => agents.checkOperation(operation.operationId))">{{ t('agent.checkResult') }}</button>
      </div>
      <template v-if="snapshot">
        <p v-if="snapshot.session.error || run?.error" role="alert" class="m-0 break-words text-sm text-ui-danger">{{ snapshot.session.error || run?.error }}</p>
        <AgentConversation :events="view!.events" :snapshot="snapshot" />
        <p v-if="!view?.loading && !view?.events.some(event => event.kind === 'acp' || event.kind === 'input')" class="m-0 py-6 text-center text-sm text-ui-text-muted">{{ t('agent.empty') }}</p>
        <AgentPermissions :permissions="snapshot.permissions" :disabled="!connected || busy" @respond="(id, option) => action(() => agents.respond(sessionId, id, option))" />
        <AgentBacklog :inputs="snapshot.inputs" :can-steer="canSteer" :disabled="!connected || busy" @steer="id => action(() => agents.steer(sessionId, id, activeTurn!.id))" @withdraw="id => action(() => agents.withdraw(sessionId, id))" @retry="id => action(() => agents.retry(sessionId, id))" />
      </template>
    </div>
  </div>
  <SessionComposer v-if="location" v-model="draft" :location="location" :disabled="!connected || snapshot?.session.lifecycle !== 'ready' || unresolvedSubmission || (run?.state !== 'running' && !canResume)" :submitting="busy" :active-turn="!!activeTurn" :waiting-for-agent="run?.state !== 'running'" :can-steer="canSteer" @submit="submit" />
</template>

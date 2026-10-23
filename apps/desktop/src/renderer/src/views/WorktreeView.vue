<script setup lang="ts">
import { SquarePen, SquareTerminal } from "@lucide/vue"
import { computed } from "vue"
import { useI18n } from "vue-i18n"
import { RouterLink, useRouter } from "vue-router"
import PaneHeader from "../components/chrome/PaneHeader.vue"
import ResourcePath from "../components/chrome/ResourcePath.vue"
import { useFleetStore } from "../stores/fleet.ts"

const props = defineProps<{ worktreeId: string }>()
const { t } = useI18n()
const fleet = useFleetStore()
const router = useRouter()
const location = computed(() => fleet.findWorktree(props.worktreeId))

function startSession(): void {
  fleet.targetWorktree(props.worktreeId)
  void router.push({ name: "new-session" })
}
</script>

<template>
  <PaneHeader>
    <template v-if="location">
      {{ location.worktree.name }}
      <ResourcePath :segments="[location.machine.name, location.workspace.name]" />
    </template>
  </PaneHeader>

  <div
    v-if="!location"
    class="flex min-h-0 flex-1 items-center justify-center px-6 text-ui-text-muted"
  >
    {{ t("worktree.notFound") }}
  </div>

  <div v-else class="min-h-0 flex-1 overflow-y-auto">
    <div class="mx-auto flex max-w-3xl flex-col gap-8 px-6 pb-8 pt-4">
      <section>
        <h2 class="ui-section-title">{{ t("worktree.directories") }}</h2>
        <ul class="ui-card">
          <li
            v-for="directory in location.worktree.directories"
            :key="directory.name"
            class="ui-card-row"
          >
            <div class="min-w-0 flex-1">
              <div class="font-medium">{{ directory.name }}</div>
              <div class="truncate font-mono text-xs text-ui-text-muted select-text">
                {{ directory.path }}
              </div>
            </div>
            <span v-if="directory.git" class="shrink-0 font-mono text-xs text-ui-text-muted">
              {{ directory.git.branch }}
            </span>
            <span v-else class="shrink-0 text-xs text-ui-text-faint">{{ t("panel.notGit") }}</span>
          </li>
        </ul>
      </section>

      <section>
        <div class="flex items-center justify-between">
          <h2 class="ui-section-title">{{ t("worktree.sessions") }}</h2>
          <button type="button" class="ui-text-button cursor-pointer hover:bg-ui-hover" @click="startSession">
            <SquarePen :size="15" :stroke-width="1.75" aria-hidden="true" />
            {{ t("worktree.newSession") }}
          </button>
        </div>
        <ul v-if="location.worktree.sessions.length" class="ui-card">
          <li v-for="session in location.worktree.sessions" :key="session.id">
            <RouterLink
              :to="{ name: 'session', params: { sessionId: session.id } }"
              class="ui-card-row hover:bg-ui-hover"
            >
              {{ session.title }}
            </RouterLink>
          </li>
        </ul>
        <p v-else class="m-0 text-ui-text-muted">{{ t("worktree.noSessions") }}</p>
      </section>

      <section>
        <div class="flex items-center justify-between">
          <h2 class="ui-section-title">{{ t("worktree.terminals") }}</h2>
          <button
            type="button"
            class="ui-text-button cursor-default"
            :title="t('common.placeholderControl', { label: t('terminal.new') })"
            aria-disabled="true"
          >
            <SquareTerminal :size="15" :stroke-width="1.75" aria-hidden="true" />
            {{ t("terminal.new") }}
          </button>
        </div>
        <ul v-if="location.worktree.terminals.length" class="ui-card">
          <li v-for="terminal in location.worktree.terminals" :key="terminal.id">
            <RouterLink
              :to="{ name: 'terminal', params: { terminalId: terminal.id } }"
              class="ui-card-row hover:bg-ui-hover"
            >
              <span class="min-w-0 flex-1 truncate">{{ terminal.title }}</span>
              <span class="max-w-1/2 truncate font-mono text-xs text-ui-text-muted">
                {{ terminal.cwd }}
              </span>
            </RouterLink>
          </li>
        </ul>
        <p v-else class="m-0 text-ui-text-muted">{{ t("worktree.noTerminals") }}</p>
      </section>
    </div>
  </div>
</template>

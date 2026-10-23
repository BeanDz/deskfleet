<script setup lang="ts">
import { GitBranch } from "@lucide/vue"
import { computed } from "vue"
import { useI18n } from "vue-i18n"
import type { GitChangeStatus, WorktreeSummary } from "../../stores/fleet-types.ts"

const props = defineProps<{ worktree: WorktreeSummary }>()
const { t } = useI18n()

// Git porcelain letters; untracked files are "?" in `git status --short`.
const statusLetter: Record<GitChangeStatus, string> = {
  modified: "M",
  added: "A",
  deleted: "D",
  renamed: "R",
  untracked: "?",
}
const statusColor: Record<GitChangeStatus, string> = {
  modified: "text-ui-warning",
  added: "text-ui-success",
  deleted: "text-ui-danger",
  renamed: "text-ui-accent",
  untracked: "text-ui-text-faint",
}

const checkouts = computed(() =>
  props.worktree.directories.flatMap(({ name, git }) => (git ? [{ name, git }] : [])),
)
const plainDirectories = computed(() =>
  props.worktree.directories.filter((directory) => directory.git === null),
)

function fileName(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1)
}

function parent(path: string): string {
  const index = path.lastIndexOf("/")
  return index < 0 ? "" : path.slice(0, index)
}
</script>

<template>
  <div class="flex flex-col gap-5">
    <section v-for="directory in checkouts" :key="directory.name">
      <div class="mb-1.5 flex items-center gap-1.5 text-[13px]">
        <span class="font-medium">{{ directory.name }}</span>
        <span class="flex min-w-0 items-center gap-1 text-xs text-ui-text-muted">
          <GitBranch :size="13" :stroke-width="1.75" class="shrink-0" aria-hidden="true" />
          <span class="truncate font-mono">{{ directory.git.branch }}</span>
        </span>
        <span class="ml-auto shrink-0 text-xs text-ui-text-faint">
          {{ directory.git.changes.length || "" }}
        </span>
      </div>
      <p v-if="directory.git.changes.length === 0" class="m-0 text-[13px] text-ui-text-faint">
        {{ t("panel.clean") }}
      </p>
      <ul v-else>
        <li v-for="change in directory.git.changes" :key="change.path">
          <div
            class="flex h-7 items-center gap-2 rounded-md px-1.5 text-[13px] hover:bg-ui-hover"
            :title="t('panel.diffUnavailable')"
          >
            <span class="min-w-0 flex-1 truncate">
              <span :class="change.status === 'deleted' && 'line-through op-70'">
                {{ fileName(change.path) }}
              </span>
              <span class="ml-1.5 text-xs text-ui-text-faint">{{ parent(change.path) }}</span>
            </span>
            <span class="shrink-0 font-mono text-[11px]">
              <span v-if="change.additions" class="text-ui-success">+{{ change.additions }}</span>
              <span v-if="change.deletions" class="ml-1 text-ui-danger">−{{ change.deletions }}</span>
            </span>
            <span
              class="w-3 shrink-0 text-center font-mono text-xs font-semibold"
              :class="statusColor[change.status]"
              :title="t(`panel.changeStatus.${change.status}`)"
            >
              {{ statusLetter[change.status] }}
            </span>
          </div>
        </li>
      </ul>
    </section>

    <section v-for="directory in plainDirectories" :key="directory.name">
      <div class="mb-1 text-[13px] font-medium">{{ directory.name }}</div>
      <p class="m-0 text-[13px] text-ui-text-faint">{{ t("panel.notGit") }}</p>
    </section>
  </div>
</template>

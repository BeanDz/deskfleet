<script setup lang="ts">
import { computed } from "vue"
import { useI18n } from "vue-i18n"
import type { RouteResource } from "../../composables/useRouteResource.ts"
import type { MachineSummary, WorktreeSummary } from "../../stores/fleet-types.ts"
import DetailsList, { type DetailsRow } from "./DetailsList.vue"

const props = defineProps<{ resource: RouteResource }>()
const { t } = useI18n()

function machineStatus(machine: MachineSummary): string {
  return machine.online ? t("panel.online") : t("machine.offline")
}

const rows = computed<DetailsRow[]>(() => {
  const resource = props.resource
  const machine = { label: t("panel.machine"), value: resource.machine.name }
  switch (resource.kind) {
    case "worktree":
      return [
        machine,
        { label: t("panel.workspace"), value: resource.workspace.name },
        { label: t("panel.status"), value: machineStatus(resource.machine) },
      ]
    case "session":
      return [
        { label: t("panel.provider"), value: resource.session.provider },
        machine,
        { label: t("panel.workspace"), value: resource.workspace.name },
        { label: t("panel.worktree"), value: resource.worktree.name },
      ]
    case "terminal": {
      const scope = resource.worktree
        ? t("panel.scopeWorktree")
        : resource.workspace
          ? t("panel.scopeWorkspace")
          : t("panel.scopeMachine")
      return [
        { label: t("panel.scope"), value: scope },
        machine,
        ...(resource.workspace ? [{ label: t("panel.workspace"), value: resource.workspace.name }] : []),
        ...(resource.worktree ? [{ label: t("panel.worktree"), value: resource.worktree.name }] : []),
        { label: t("panel.cwd"), value: resource.terminal.cwd, code: true },
      ]
    }
    case "desktop":
      return [
        machine,
        { label: t("panel.status"), value: machineStatus(resource.machine) },
        {
          label: t("panel.display"),
          value: resource.machine.desktop ? t("panel.displayAvailable") : t("panel.displayNone"),
        },
      ]
  }
})

const title = computed(() => {
  const resource = props.resource
  switch (resource.kind) {
    case "worktree":
      return resource.worktree.name
    case "session":
      return resource.session.title
    case "terminal":
      return resource.terminal.title
    case "desktop":
      return t("machine.remoteDesktop")
  }
})

const worktree = computed<WorktreeSummary | undefined>(() =>
  props.resource.kind === "desktop" ? undefined : props.resource.worktree,
)
</script>

<template>
  <div class="flex flex-col gap-5">
    <h2 class="m-0 break-words text-sm font-semibold">{{ title }}</h2>
    <DetailsList :rows="rows" />

    <section v-if="worktree">
      <h3 class="ui-section-title">{{ t("panel.directories") }}</h3>
      <ul class="flex flex-col gap-3">
        <li v-for="directory in worktree.directories" :key="directory.name" class="text-[13px]">
          <div class="font-medium">{{ directory.name }}</div>
          <div class="break-all font-mono text-xs text-ui-text-muted select-text">
            {{ directory.path }}
          </div>
          <div v-if="directory.git" class="mt-0.5 font-mono text-xs text-ui-text-faint select-text">
            {{ directory.git.branch }} · {{ directory.git.head }}
          </div>
          <div v-else class="mt-0.5 text-xs text-ui-text-faint">{{ t("panel.notGit") }}</div>
        </li>
      </ul>
    </section>
  </div>
</template>

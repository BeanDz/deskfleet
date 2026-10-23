import { useI18n } from "vue-i18n"
import type { WorktreeSummary } from "../stores/fleet-types.ts"

/** Worktrees have lifecycle identities, not user-managed names. */
export function useWorktreeLabel() {
  const { t } = useI18n()
  return (worktree: Pick<WorktreeSummary, "sessionId">): string => worktree.sessionId === undefined
    ? t("worktree.main")
    : t("worktree.sessionLabel", { id: worktree.sessionId })
}

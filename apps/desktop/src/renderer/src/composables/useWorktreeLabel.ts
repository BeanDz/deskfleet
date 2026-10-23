import { useI18n } from "vue-i18n"

/** A worktree is shown within its owning session. */
export function useWorktreeLabel() {
  const { t } = useI18n()
  return (): string => t("session.worktree")
}

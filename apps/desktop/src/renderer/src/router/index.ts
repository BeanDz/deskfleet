import { createRouter, createWebHashHistory } from "vue-router"

declare module "vue-router" {
  interface RouteMeta {
    /** Message key of a placeholder page's title. */
    titleKey?: string
  }
}

// Hash history keeps every route on the single bundled index.html document.
export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: "/",
      name: "new-session",
      component: () => import("../views/NewSessionView.vue"),
    },
    {
      path: "/workspaces/:workspaceId",
      name: "workspace",
      component: () => import("../views/WorkspaceView.vue"),
      props: true,
    },
    {
      path: "/worktrees/:worktreeId",
      name: "worktree",
      component: () => import("../views/WorktreeView.vue"),
      props: true,
    },
    {
      path: "/sessions/:sessionId",
      name: "session",
      component: () => import("../views/SessionView.vue"),
      props: true,
    },
    {
      path: "/machines/:machineId/terminals",
      name: "machine-terminals",
      component: () => import("../views/TerminalView.vue"),
      props: true,
    },
    {
      path: "/terminals/:terminalId",
      name: "terminal",
      component: () => import("../views/TerminalView.vue"),
      props: true,
    },
    {
      path: "/machines/:machineId/desktop",
      name: "machine-desktop",
      component: () => import("../views/DesktopView.vue"),
      props: true,
    },
    {
      path: "/settings",
      name: "settings",
      component: () => import("../views/SettingsView.vue"),
    },
    { path: "/:pathMatch(.*)*", redirect: "/" },
  ],
})

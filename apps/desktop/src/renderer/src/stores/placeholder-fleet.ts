import type { MachineSummary, TeamSummary } from "./fleet-types.ts"

export const placeholderTeam: TeamSummary = { id: "team-example", name: "Example team" }

export const placeholderMachines: MachineSummary[] = [
  {
    id: "machine-development-box",
    name: "development-box",
    local: true,
    online: true,
    desktop: true,
    terminals: [{ id: "terminal-development-box-shell", title: "zsh", cwd: "~" }],
    workspaces: [
      {
        id: "workspace-storefront",
        name: "storefront",
        terminals: [
          { id: "terminal-storefront-services", title: "docker compose logs", cwd: "/code" },
        ],
        worktrees: [
          {
            id: "worktree-storefront-main",
            name: "main",
            directories: [
              {
                name: "frontend",
                path: "/code/storefront-web",
                git: {
                  branch: "main",
                  head: "4f2c1a9",
                  changes: [
                    { path: "src/checkout/CheckoutForm.tsx", status: "modified", additions: 12, deletions: 3 },
                    { path: "src/checkout/useCart.ts", status: "modified", additions: 4, deletions: 1 },
                  ],
                },
              },
              {
                name: "backend",
                path: "/code/storefront-api",
                git: { branch: "main", head: "9b7e3d2", changes: [] },
              },
              { name: "notes", path: "/code/storefront-notes", git: null },
            ],
            sessions: [
              {
                id: "session-checkout-failures",
                title: "Investigate checkout failures",
                provider: "Codex",
              },
            ],
            terminals: [
              { id: "terminal-storefront-web-dev", title: "pnpm dev", cwd: "/code/storefront-web" },
            ],
          },
          {
            id: "worktree-storefront-checkout-fix",
            name: "checkout-fix",
            directories: [
              {
                name: "frontend",
                path: "/worktrees/storefront-web/checkout-fix",
                git: {
                  branch: "checkout-fix",
                  head: "a81d0c4",
                  changes: [
                    { path: "src/checkout/PaymentStep.tsx", status: "modified", additions: 30, deletions: 8 },
                    { path: "src/checkout/PaymentStep.test.tsx", status: "added", additions: 54, deletions: 0 },
                  ],
                },
              },
              {
                name: "backend",
                path: "/worktrees/storefront-api/checkout-fix",
                git: {
                  branch: "checkout-fix",
                  head: "c03f5e1",
                  changes: [
                    { path: "internal/payments/retry.go", status: "modified", additions: 18, deletions: 6 },
                    { path: "internal/payments/legacy.go", status: "deleted", additions: 0, deletions: 72 },
                  ],
                },
              },
            ],
            sessions: [{ id: "session-checkout-fix", title: "Implement the fix", provider: "Codex" }],
            terminals: [],
          },
        ],
      },
    ],
  },
  {
    id: "machine-build-linux",
    name: "build-linux",
    local: false,
    online: false,
    lastSeen: "2026-10-22T18:40:00Z",
    desktop: false,
    terminals: [],
    workspaces: [
      {
        id: "workspace-firmware",
        name: "firmware",
        terminals: [],
        worktrees: [
          {
            id: "worktree-firmware-main",
            name: "main",
            directories: [
              {
                name: "firmware",
                path: "/srv/firmware",
                git: { branch: "release/2.4", head: "77aa012", changes: [] },
              },
            ],
            sessions: [],
            terminals: [],
          },
        ],
      },
    ],
  },
]

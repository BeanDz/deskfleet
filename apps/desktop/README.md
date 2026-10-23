# deskfleet desktop

`@deskfleet/desktop` is the Electron client for the machine daemon. Quitting the
client leaves the daemon and its agent sessions running. The renderer uses Vue
with vue-router, Pinia, VueUse, vue-i18n, UnoCSS, Lucide icons, and xterm.js.

## Development

From the repository root:

```sh
mise run desktop:dev
```

`scripts/dev.ts` serves the renderer from Vite at `http://127.0.0.1:5173/` with
hot reload and rebuilds the main and preload bundles in watch mode. It restarts
Electron when either bundle changes. Quitting from the tray menu or pressing
Ctrl-C stops the watchers.

`mise run desktop:build` writes the production bundles to `out/`. Run them with
`mise exec -- pnpm --filter @deskfleet/desktop exec electron .`. Electron
downloads its platform binary the first time it is resolved.

## Layout

| Path | Process | Bundle |
| --- | --- | --- |
| `src/main` | Electron main process | `out/main/index.js` (ESM) |
| `src/preload` | Sandboxed preload | `out/preload/index.cjs` (CommonJS) |
| `src/renderer` | Vue renderer | `out/renderer` |
| `src/shared` | Code imported by more than one process | Inlined into each bundle |
| `src/locales` | Message catalogs for the main process and renderer | Inlined into each bundle |
| `build` | Packaging input and runtime window and tray images | Selected files in `app.asar` |

Each process has its own Vite configuration (`vite.main.config.ts`,
`vite.preload.config.ts`, and `vite.renderer.config.ts`).

## Interface layout

`useFleetStore` serves sample data from
`src/renderer/src/stores/placeholder-fleet.ts`. The team switcher, settings,
workspace and terminal creation, target and provider pickers, Send, file diffs,
session transcript, terminal I/O, and remote desktop connection are placeholders.
Placeholder controls are labelled, `aria-disabled`, and do nothing. They use
`IconButton`'s `placeholder` state or the `common.placeholderControl` title.

The window is frameless and has three columns. The sidebar holds the window
toolbar (sidebar toggle, back, forward), the New session action, the resource
tree, and a team footer. The main pane shows the routed view under a header row
that takes over the toolbar while the sidebar is hidden. The details panel on the
right describes the current route's resource; its header toggle and its tab
persist per device. The macOS traffic lights sit in the sidebar's toolbar row.
The Windows and Linux controls overlay the window's top-right corner, which the
rightmost header reserves with `.titlebar-overlay-inset`
(`src/main/window-chrome.ts`).

The tree follows the resource model: machines contain workspaces, workspaces
contain worktrees, and each worktree lists its agent sessions. Terminal sessions
appear under whichever machine, workspace, or worktree owns them. Machines with a
graphical session list Remote desktop first; headless machines omit it. Offline
machines start collapsed and report when they were last seen.

| Route | View |
| --- | --- |
| `/` | New session: a composer targeting a machine, workspace, worktree, and provider |
| `/worktrees/:worktreeId` | Directory bindings, agent sessions, and terminals of one worktree |
| `/sessions/:sessionId` | A session's title, location, and composer |
| `/terminals/:terminalId` | A terminal session's owner, cwd, and terminal surface |
| `/machines/:machineId/desktop` | A machine's remote desktop surface, or why it is unavailable |
| `/settings` | `PlaceholderView` |

A worktree page's New session action makes that worktree the new session's
target.

The details panel has two tabs:

- **Details** lists the resource's owner and properties: a session's provider, a
  terminal's scope and cwd, or a machine's display. Resources in a worktree also
  list its directory bindings with each checkout's branch and HEAD.
- **Changes** lists the worktree's uncommitted Git changes, grouped by checkout,
  with status letters as in `git status --short` and line counts. It is empty for
  machine and workspace terminals and for desktops, which belong to no worktree.

`useRouteResource` resolves the route to that resource. The new session page
describes its target worktree.

## Terminal

`TerminalSurface` wraps xterm.js and its fit addon. It fits the terminal to its
container on resize and disposes of it on unmount. The terminal view remounts it
for each terminal session. With no session transport connected, it displays a
dimmed notice with input disabled and the cursor hidden. xterm.js uses an injected
stylesheet, which the renderer CSP's `style-src 'unsafe-inline'` permits. It
loads only with the terminal route's chunk.

## Tray lifecycle

The client stays resident in the system tray: the macOS menu bar, the Windows
notification area, or a Linux StatusNotifier/AppIndicator host. GNOME needs the
AppIndicator extension to show it. Closing the window hides it, as do Cmd+Q, the
Dock menu, and any other ordinary quit request. On macOS the Dock icon is shown
only while the window is.

The process exits only through:

- **Quit deskfleet** in the tray menu;
- OS logout or shutdown (`powerMonitor` `shutdown` on macOS and Linux, window
  `session-end` on Windows);
- SIGINT or SIGTERM.

`src/main/lifecycle.ts` owns this rule. To exit the process, call its `quit()`
rather than `app.quit()`. A second launch shows the existing window instead of
starting another client.

## Localization

`src/locales/<locale>.json` holds one catalog per supported locale. Currently these
are `en-US` and `zh-cmn-Hans-CN`. The main process selects the first supported
locale from the OS language preferences and passes it to the preload through
`additionalArguments`. The renderer reads it from `window.deskfleet.locale`.

The main process translates with `t()` from `src/main/i18n.ts`. Components use
`useI18n()` from vue-i18n, not the global `$t`, which Vapor components do not
receive. `@intlify/unplugin-vue-i18n` selects vue-i18n's runtime-only build,
which compiles messages without `eval` under the renderer's CSP. Tests check that
catalogs share keys and parameters and that literal `t("…")` keys exist.

## Styling

Colors are CSS custom properties in `src/renderer/src/styles.css`, with light and
dark values. UnoCSS exposes them as `*-ui-<name>` utilities. presetMini has no
preflight and omits some Wind utilities such as `list-none`, so `styles.css` also
holds a small base reset.

UnoCSS uses `presetMini` from `uno.config.ts`. The renderer imports the generated
utilities through `virtual:uno.css`, and production builds emit them as a static
stylesheet.

## Renderer security

The renderer runs with context isolation, the Chromium sandbox, and no Node
integration. The preload exposes `window.deskfleet` (`src/shared/desktop-api.ts`)
only to the main renderer document. Keep that interface narrow; agent output and
repository content are untrusted display data.

Bundled builds load from the privileged `deskfleet-app://bundle/` scheme, which
serves only files inside `out/renderer`. Development builds accept only the fixed
loopback Vite URL. Each build injects its Content Security Policy into
`index.html`, and production builds forbid network connections from the renderer.
The window denies new windows, navigation, and Chromium permission requests.
Routing uses hash history so every route stays on the single bundled document.

## Vue rendering

Production renderer builds compile every `<script setup>` component in Vapor mode.
`vaporInteropPlugin` lets Vapor components render inside VDOM library components
such as `RouterView`. Vitest compiles the same components to VDOM because Vue
Test Utils requires VDOM instances, so unit tests do not cover Vapor-specific
behavior.

## Packaging

```sh
mise run desktop:package:dir  # unpacked app in release/
mise run desktop:package      # dmg and zip, NSIS, or AppImage for the host platform
```

`electron-builder.yml` configures packaging. Vite bundles every dependency into
`out/`, so the app has no runtime `node_modules`. Packages enable ASAR integrity
validation and disable the `RunAsNode`, `NODE_OPTIONS`, and `--inspect` fuses.
electron-builder signs macOS builds when it finds a signing identity; set
`CSC_IDENTITY_AUTO_DISCOVERY=false` for unsigned local builds.

`build/icon.png` is the source for the macOS `.icns` and Windows `.ico`. The tray
uses `build/trayTemplate*.png` on macOS and `build/tray*.png` elsewhere. These
images are placeholders that `scripts/generate-icons.ts` draws. Regenerate them
with `mise exec -- pnpm --filter @deskfleet/desktop icons`, or replace them with
real artwork of the same sizes.

## Checks

```sh
mise run check:desktop-types  # vue-tsc over all processes, configs, and scripts
mise run check:desktop        # Vitest: main/shared in Node, renderer in happy-dom
```

vue-tsc uses the TypeScript compiler API, which TypeScript 7 does not provide. The
package therefore installs TypeScript 6 under the `typescript` name. The root
workspace still type-checks the daemon and scripts with TypeScript 7.

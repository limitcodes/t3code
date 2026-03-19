# Desktop

CUT3 desktop wraps the web UI in Electron and starts a desktop-scoped `t3` backend on loopback. The renderer still talks to the same WebSocket and orchestration surface as the browser app, while the Electron main process owns native dialogs, desktop secrets, menus, backend lifecycle, and update UX.

## Key files

- `src/main.ts` wires startup, backend spawn and restart behavior, protocol registration, menu actions, IPC handlers, and update state.
- `src/preload.ts` exposes `window.desktopBridge`, including the WebSocket URL handoff, update actions, native dialogs, and secrets APIs.
- `src/preloadWsUrl.ts` resolves the initial backend WebSocket URL from the environment or command-line arguments.
- `scripts/dev-electron.mjs` launches the desktop shell in development.
- `scripts/start-electron.mjs` launches the built desktop shell locally.
- `scripts/smoke-test.mjs` verifies that a built Electron app launches, reaches backend readiness, and avoids obvious startup crashes.

## Startup sequence

1. `app.whenReady()` runs in `src/main.ts`.
2. Electron registers IPC handlers and generates a desktop backend auth token.
3. Electron spawns the bundled `apps/server/dist` entry with `CUT3_MODE=desktop`, `CUT3_PORT=0`, and `CUT3_AUTH_TOKEN`.
4. The backend emits a readiness line prefixed with `[cut3-desktop-ready]` once it has selected a loopback port.
5. Electron converts that port into a renderer-safe WebSocket URL and broadcasts it through `desktopBridge.onBackendWsUrlUpdated`.
6. The main window loads either the Vite dev server or the packaged `cut3://app/index.html` document.

## Development and local launch

- From the repo root, use `bun run dev:desktop` for the normal desktop development flow.
- From `apps/desktop`, use `bun run dev` if you only want the Electron package-local workflow.
- To launch the built desktop app locally, run `bun run start:desktop` from the repo root or `bun run start` inside `apps/desktop` after building.

## State and logs

- Desktop state defaults to `CUT3_STATE_DIR` when it is set.
- Without an override, desktop state lives under `~/.t3/cut3`.
- Packaged builds capture main-process logs in `<state-dir>/logs/desktop-main.log` and backend child logs in `<state-dir>/logs/server-child.log`.
- Development launches forward main-process bootstrap headers plus backend stdout and stderr to the parent terminal instead of rotating packaged log files.

## Smoke test contract

- Run `bun run test:desktop-smoke` from the repo root or `bun run smoke-test` inside `apps/desktop`.
- The smoke test launches `dist-electron/main.js`, waits for the `[cut3-desktop-ready]{...}` backend readiness marker, and fails on launch-time fatal errors.
- The smoke test does not validate full renderer interaction, menu behavior, or update installation.

## Related docs

- `.docs/scripts.md` covers shared repo commands and desktop packaging notes.
- `docs/release.md` covers release-time packaging and signing workflows.

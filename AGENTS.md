# AGENTS.md

## Task Completion Requirements

- Both `bun lint` and `bun typecheck` must pass before considering tasks completed.
- NEVER run `bun test`. Always use `bun run test` (runs Vitest).

## Project Snapshot

T3 Code is a minimal web GUI for using code agents like Codex and GitHub Copilot, with Claude Code coming soon.

This repository is a VERY EARLY WIP. Proposing sweeping changes that improve long-term maintainability is encouraged.

## Core Priorities

1. Performance first.
2. Reliability first.
3. Keep behavior predictable under load and during failures (session restarts, reconnects, partial streams).

If a tradeoff is required, choose correctness and robustness over short-term convenience.

## GPT-5.4 Prompt Guidance

<task_context>
You are working in the T3 Code monorepo.
Priorities:
1. Performance first.
2. Reliability first.
3. Predictable behavior under load, reconnects, and partial streams.
Architecture:
- apps/server: provider sessions, orchestration, websocket server
- apps/web: React/Vite UI and session UX
- packages/contracts: schemas/contracts only
- packages/shared: shared runtime utilities
Do not make schema-only packages carry runtime logic.
Prefer shared extraction over duplicated local fixes.
</task_context>

<tool_persistence_rules>
- Use tools whenever they materially improve correctness, completeness, or grounding.
- Do not stop early when another inspection, search, or validation step would materially improve the result.
- Keep going until the task is complete and verification passes.
- If a lookup or test result is partial or suspiciously narrow, retry with a different strategy.
</tool_persistence_rules>

<dependency_checks>
- Before editing, inspect the relevant code paths and contracts.
- Do not skip prerequisite discovery just because the final change seems obvious.
- Resolve upstream/downstream dependencies before mutating code.
</dependency_checks>

<completeness_contract>
- Treat the task as incomplete until all requested deliverables are handled or explicitly marked blocked.
- Keep an internal checklist of affected runtime paths, UI paths, contracts, and tests.
- If something is blocked, state exactly what is missing.
</completeness_contract>

<verification_loop>
Before finalizing:
- Check correctness against the user request.
- Check grounding against the codebase and tool outputs.
- Check formatting and repo conventions.
- Check whether tests/typecheck/lint relevant to the change should run.
</verification_loop>

<missing_context_gating>
- If required context is missing, do not guess.
- Prefer repo inspection first.
- Ask only the minimal clarifying question when the answer cannot be derived locally.
</missing_context_gating>

<output_contract>
- For implementation tasks: make the change, verify it, then summarize outcome and risks briefly.
- For review tasks: list findings first with file/line references.
- For no-change/planning tasks: provide the exact files and settings that would need changes.
</output_contract>

## Maintainability

Long term maintainability is a core priority. If you add new functionality, first check if there are shared logic that can be extracted to a separate module. Duplicate logic across mulitple files is a code smell and should be avoided. Don't be afraid to change existing code. Don't take shortcuts by just adding local logic to solve a problem.

## Package Roles

- `apps/server`: Node.js WebSocket server. Wraps Codex and GitHub Copilot provider runtimes, serves the React web app, and manages provider sessions.
- `apps/web`: React/Vite UI. Owns session UX, conversation/event rendering, and client-side state. Connects to the server via WebSocket.
- `packages/contracts`: Shared effect/Schema schemas and TypeScript contracts for provider events, WebSocket protocol, and model/session types. Keep this package schema-only — no runtime logic.
- `packages/shared`: Shared runtime utilities consumed by both server and web. Uses explicit subpath exports (e.g. `@t3tools/shared/git`) — no barrel index.

## Provider runtimes (Important)

T3 Code currently supports Codex and GitHub Copilot. The server starts either `codex app-server` (JSON-RPC over stdio) or `copilot --acp --no-ask-user` per provider session, then streams structured events to the browser through WebSocket push messages.

How we use it in this codebase:

- Session startup/resume and turn lifecycle are brokered in `apps/server/src/codexAppServerManager.ts`.
- Provider dispatch and thread event logging are coordinated in `apps/server/src/providerManager.ts`.
- WebSocket server routes NativeApi methods in `apps/server/src/wsServer.ts`.
- Web app consumes orchestration domain events via WebSocket push on channel `orchestration.domainEvent` (provider runtime activity is projected into orchestration events server-side).

Docs:

- Codex App Server docs: https://developers.openai.com/codex/sdk/#app-server
- GitHub Copilot CLI docs: https://docs.github.com/copilot/how-tos/use-copilot-agents/coding-agent/using-the-github-copilot-coding-agent-in-the-cli

## Reference Repos

- Open-source Codex repo: https://github.com/openai/codex
- Codex-Monitor (Tauri, feature-complete, strong reference implementation): https://github.com/Dimillian/CodexMonitor

Use these as implementation references when designing protocol handling, UX flows, and operational safeguards.

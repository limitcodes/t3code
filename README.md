# T3 Code

T3 Code is a minimal web GUI for coding agents.

Currently enabled providers in this branch:

- Codex
- Droid
- Pi

Provider code that still exists in the repo but is currently disabled in the UI/server wiring:

- GitHub Copilot
- Kimi Code

Claude Code is still planned but not enabled.

## How to use

> [!WARNING]
> Install and authenticate at least one supported provider CLI before starting T3 Code:
>
> - [Codex CLI](https://github.com/openai/codex)
> - Droid CLI
> - Pi CLI

```bash
npx t3
```

You can also just install the desktop app. It's cooler.

Install the [desktop app from the Releases page](https://github.com/pingdotgg/t3code/releases)

Once the app is running, choose Codex, Droid, or Pi from the provider picker before starting a session.

## Provider notes

### Codex

- Uses the Codex CLI / app-server flow.
- Supported and enabled by default.

### Droid

- Supported and enabled by default.
- Configure Droid binary/API key from Settings if needed.

### Pi

- Supported and enabled by default.
- Pi models are loaded dynamically from the Pi runtime and `pi --list-models`.

## Re-enabling disabled providers

GitHub Copilot and Kimi Code are not deleted from the repo. Their runtime code still exists, but they are currently disabled by wiring.

To re-enable them, add them back in these places:

1. Server registration:
   [apps/server/src/serverLayers.ts](./apps/server/src/serverLayers.ts)

2. Server health/status reporting:
   [apps/server/src/provider/Layers/ProviderHealth.ts](./apps/server/src/provider/Layers/ProviderHealth.ts)

3. Provider picker / visible provider list:
   [apps/web/src/session-logic.ts](./apps/web/src/session-logic.ts)

4. Settings UI for provider-specific config:
   [apps/web/src/routes/_chat.settings.tsx](./apps/web/src/routes/_chat.settings.tsx)

If this needs to be reversible often, prefer converting provider enablement into a config/env allowlist instead of editing code each time.

## Some notes

We are very very early in this project. Expect bugs.

We are not accepting contributions yet.

## If you REALLY want to contribute still.... read this first

Read [CONTRIBUTING.md](./CONTRIBUTING.md) before opening an issue or PR.

Need support? Join the [Discord](https://discord.gg/jn4EGJjrvv).

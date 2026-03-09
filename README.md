# T3 Code

T3 Code is a minimal web GUI for coding agents. It currently supports Codex, GitHub Copilot, and Kimi Code, with Claude Code coming soon.

## Supported providers

- Codex
- GitHub Copilot
- Kimi Code

## How to use

> [!WARNING]
> Install and authenticate at least one supported provider CLI before starting T3 Code:
>
> - [Codex CLI](https://github.com/openai/codex)
> - [GitHub Copilot CLI](https://docs.github.com/copilot/how-tos/use-copilot-agents/coding-agent/using-the-github-copilot-coding-agent-in-the-cli)
> - [Kimi Code CLI](https://www.kimi.com/code/docs/en/)

```bash
npx t3
```

You can also just install the desktop app. It's cooler.

Install the [desktop app from the Releases page](https://github.com/pingdotgg/t3code/releases)

Once the app is running, choose Codex, GitHub Copilot, or Kimi Code from the provider picker before starting a session.

## Provider settings and model controls

Open Settings in the app to configure provider-specific behavior on the current device.

- **Provider overrides**: set custom binary paths for Codex, Copilot, or Kimi, plus an optional Codex home path and Kimi API key.
- **Custom model slugs**: save extra model ids for GitHub Copilot and Kimi so they appear in the model picker and `/model` suggestions.
- **Codex service tier**: choose `Automatic`, `Fast`, or `Flex` as the default service tier for new Codex turns.
- **Per-turn controls**: the composer exposes provider-aware reasoning controls, and Codex also supports a per-turn `Fast Mode` toggle.

For the full details, see [.docs/provider-settings.md](.docs/provider-settings.md).

## Runtime and interaction modes

The chat toolbar exposes two additional execution controls:

- **Runtime mode**: choose `Full access` for direct execution or `Supervised` for in-app command/file approvals.
- **Interaction mode**: switch between normal `Chat` turns and `Plan` turns for plan-first collaboration.

When a plan is active, T3 Code can keep it open in a sidebar and export it by copying, downloading markdown, or saving it into the workspace.

For the full details, see [.docs/runtime-modes.md](.docs/runtime-modes.md).

## Additional docs

- [Codex prerequisites](.docs/codex-prerequisites.md)
- [Quick start](.docs/quick-start.md)
- [Runtime modes](.docs/runtime-modes.md)

## Some notes

We are very very early in this project. Expect bugs.

We are not accepting contributions yet.

## If you REALLY want to contribute still.... read this first

Read [CONTRIBUTING.md](./CONTRIBUTING.md) before opening an issue or PR.

Need support? Join the [Discord](https://discord.gg/jn4EGJjrvv).

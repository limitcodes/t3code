# Quick start

```bash
# Development (with hot reload)
bun run dev

# Desktop development
bun run dev:desktop

# Desktop development on an isolated port set
T3CODE_DEV_INSTANCE=feature-xyz bun run dev:desktop

# Production
bun run build
bun run start

# Build a shareable macOS .dmg (arm64 by default)
bun run dist:desktop:dmg

# Or from any project directory after publishing:
npx t3
```

## After startup

- Open **Settings** to configure provider binary overrides, Kimi API key storage, and model preferences.
- Save extra GitHub Copilot or Kimi model ids if you want them in the picker and `/model` suggestions.
- For Codex, choose a default service tier in Settings and adjust reasoning / `Fast Mode` per turn from the composer.
- Pick `Full access` or `Supervised` in the toolbar depending on whether you want direct execution or approval-gated actions.
- Switch between `Chat` and `Plan` when you want plan-first collaboration with the plan sidebar.

See [provider-settings.md](provider-settings.md) for the current settings surface and [runtime-modes.md](runtime-modes.md) for the execution controls.

# Codex prerequisites

- Install Codex CLI so `codex` is on your PATH.
- Use Codex CLI `0.37.0` or newer. Older versions are rejected by T3 Code.
- Authenticate Codex before running T3 Code (for example via API key or ChatGPT auth supported by Codex).
- T3 Code starts the server via `codex app-server` per session.

Optional app settings for Codex:

- Override the Codex binary path if you do not want to use the `codex` executable from `PATH`.
- Override the Codex home path if you keep Codex state in a non-default location.
- Set the default Codex service tier in Settings.
- Use the composer controls to choose Codex reasoning effort and per-turn `Fast Mode`.

## Troubleshooting

- If a Codex session fails immediately, verify the configured binary override and confirm `codex --version` is `0.37.0` or newer.
- If you override the Codex home path, make sure it points at the Codex state directory you want T3 Code to use.

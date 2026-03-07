# Provider prerequisites

- Install Codex CLI so `codex` is on your PATH if you want to use Codex sessions.
- Authenticate Codex before running T3 Code (for example via API key or ChatGPT auth supported by Codex).
- Install GitHub Copilot CLI so `copilot` is on your PATH if you want to use GitHub Copilot sessions.
- Authenticate GitHub Copilot before running T3 Code with `copilot login`, `gh auth login`, or a supported token environment variable.
- T3 Code starts provider sessions by launching `codex app-server` for Codex and `copilot --acp --no-ask-user` for GitHub Copilot.

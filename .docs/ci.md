# CI quality gates

- `.github/workflows/ci.yml` runs `bun run lint`, `bun run typecheck`, and `bun run test` on pull requests and pushes to `main` using standard GitHub-hosted `ubuntu-24.04` runners.
- `.github/workflows/release.yml` builds macOS (`arm64` and `x64`), Linux (`x64`), and Windows (`x64`) desktop artifacts from a single `v*.*.*` tag and publishes one GitHub release.
- The release workflow auto-enables signing only when secrets are present: Apple credentials for macOS and Azure Trusted Signing credentials for Windows. Without secrets, it still releases unsigned artifacts.
- CLI npm publishing is optional and no longer blocks GitHub Releases; enable it with the `publish_cli` workflow-dispatch input or the `T3CODE_PUBLISH_CLI=true` repository variable.
- See `docs/release.md` for full release/signing setup checklist.

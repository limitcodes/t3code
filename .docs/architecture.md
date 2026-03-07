# Architecture

T3 Code runs as a **Node.js WebSocket server** that serves a React web app and brokers provider sessions against either `codex app-server` (JSON-RPC over stdio) or the GitHub Copilot CLI ACP runtime.

```
┌─────────────────────────────────┐
│  Browser (React + Vite)         │
│  Connected via WebSocket        │
└──────────┬──────────────────────┘
           │ ws://localhost:3773
┌──────────▼──────────────────────────┐
│  apps/server (Node.js)              │
│  WebSocket + HTTP static server     │
│  ProviderManager                    │
│  Codex + Copilot provider adapters  │
└──────────┬──────────────────────────┘
           │ JSON-RPC / ACP over stdio
┌──────────▼──────────────────────────┐
│  codex app-server | copilot --acp   │
└─────────────────────────────────────┘
```

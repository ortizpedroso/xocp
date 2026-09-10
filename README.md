# XOCP

**eXtensible Open Code Platform** · by Pedroso

Independent AI coding agent with structural code mapping (Graphify), cluster orchestration, and durable agent handoff.

> Based on [OpenCode](https://github.com/anomalyco/opencode) (MIT License). XOCP is an independent project — not affiliated with OpenCode or X Corp.

## Status

Early development on branch `dev`. Optional upstream sync from OpenCode is manual.

## Quick start

Requires [Bun 1.3.14](https://bun.sh) (see `packageManager` in `package.json`).

### Local development (recommended)

The web UI is a separate Vite app served with hot reload. It needs the API server on port **4096**:

```bash
bun install
bun dev:local
```

Open http://localhost:4444 (API at http://localhost:4096).

Or run the two processes in separate terminals:

```bash
bun dev serve --port 4096          # API
bun run --cwd packages/app dev -- --port 4444   # UI with HMR
```

### Single-process server (`bun dev web`)

Starts the API and serves the web UI from one process on http://localhost:4096 — but only after the UI is **embedded into the server build**:

```bash
bun install
bun run --cwd packages/app build
bun run --cwd packages/opencode build
bun dev web
```

Without that build step, `bun dev web` returns a 503 page with these instructions instead of loading a remote UI.

> **Note:** `bun dev:web` (with a colon) starts only the Vite frontend on its own port. Use `bun dev:local` for the usual dev loop, or `bun dev web` (no colon) after embedding the UI build.

Other entrypoints:

```bash
bun dev              # CLI / TUI (packages/opencode)
bun dev:desktop      # Desktop app
```

## Repository remotes

| Remote | Purpose |
|--------|---------|
| `origin` | This repo — `github.com/ortizpedroso/xocp` |
| `opencode` | Upstream OpenCode — `github.com/anomalyco/opencode` |

Sync with upstream when needed:

```bash
git fetch opencode
git checkout -b sync-opencode-$(date +%Y-%m-%d)
git merge opencode/dev
# resolve conflicts in XOCP-owned files (README, AGENTS.md, specs/xocp/*)
git checkout dev
git merge sync-opencode-$(date +%Y-%m-%d)
```

## Roadmap

- [x] Session telemetry and complexity score
- [x] Graphify local CLI (code map via `uv tool run`, pinned `graphifyy` version)
- [x] Opt-in map UI (background jobs, toast)
- [x] Durable handoff (≤2000 chars per session)
- [ ] Cluster orchestration (frontend / backend / core) — deferred; see `specs/xocp/architecture.md` §5.4
- [ ] Background map prefetch — deferred until telemetry validates value; see `specs/xocp/implementation-checklist.md`

See `AGENTS.md` for implementation rules and phased delivery.

## Development

- Default branch: `dev`
- Typecheck: `bun typecheck` (from repo root) or `bun typecheck` inside a package
- Tests: run from package dirs (e.g. `cd packages/opencode && bun test`), not from repo root
- Agent guidelines: `AGENTS.md`

## License

MIT — see [LICENSE](./LICENSE). Original OpenCode copyright retained; XOCP modifications © Pedroso.

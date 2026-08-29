# XOCP

**eXtensible Open Code Platform** · by Pedroso

Independent AI coding agent with structural code mapping (Graphify), cluster orchestration, and durable agent handoff.

> Based on [OpenCode](https://github.com/anomalyco/opencode) (MIT License). XOCP is an independent project — not affiliated with OpenCode or X Corp.

## Status

Early development on branch `dev`. Optional upstream sync from OpenCode is manual.

## Quick start

Requires [Bun 1.3.14](https://bun.sh) (see `packageManager` in `package.json`).

```bash
bun install
bun dev web
```

Open http://localhost:4096

Other entrypoints:

```bash
bun dev              # CLI / server (packages/opencode)
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

- [ ] Session telemetry and complexity score
- [ ] Graphify sidecar (code map, zero-token queries)
- [ ] Opt-in map UI (background jobs, toast)
- [ ] Durable handoff (≤2000 chars per cluster)
- [ ] Cluster orchestration (frontend / backend / core)

See `AGENTS.md` for implementation rules and phased delivery.

## Development

- Default branch: `dev`
- Typecheck: `bun typecheck` (from repo root) or `bun typecheck` inside a package
- Tests: run from package dirs (e.g. `cd packages/opencode && bun test`), not from repo root
- Agent guidelines: `AGENTS.md`

## License

MIT — see [LICENSE](./LICENSE). Original OpenCode copyright retained; XOCP modifications © Pedroso.

# XOCP development workflow

How to split work between your Windows machine and Cloud Agents without stepping on each other.

## Branches

| Branch | Purpose |
|--------|---------|
| `dev` | Integration branch — always deployable for local dev |
| `cursor/<name>-<id>` | Cloud Agent feature branches |
| `session-telemetry`, etc. | Local feature branches (max 3 words, hyphens) |

Never commit directly to `dev` once branch protection is enabled. Use PRs.

## Where to work

### Local (Windows) — `C:\projetos\xocp`

Best for:

- Manual UI testing in the browser
- Quick fixes and experiments
- Verifying `bun dev:local` / `bun dev web` on your machine

```powershell
git pull origin dev
bun install
bun dev:local          # UI http://localhost:4444 + API :4096
# or
bun dev web            # all-in-one http://localhost:4096
```

Push via a short-lived branch + PR, or merge locally and push `dev` if protection is not enabled yet.

### Cloud Agent (Cursor)

Best for:

- Multi-file features (telemetry, Graphify sidecar, UI flows)
- Running full test suites and typecheck
- Opening draft PRs with CI

Cloud Agents use branches `cursor/<short-name>-<suffix>` and open PRs targeting `dev`.

## Sync rhythm

1. **Before starting** (local or cloud): `git pull origin dev`
2. **During work**: commit often on your feature branch
3. **When done**: open or update a PR → `dev`
4. **After merge** (other side): `git pull origin dev` again

Avoid long-lived divergent branches. Rebase or merge `dev` into your feature branch at least once per day of active work.

## What lives where

| Artifact | Location |
|----------|----------|
| Code | GitHub `ortizpedroso/xocp` |
| Roadmap order | `AGENTS.md` |
| Feature specs | `specs/xocp/` (create as needed) |
| GitHub rules (docs) | `specs/xocp/github-governance.md` |
| Environment bootstrap | `.cursor/environment.json` |

## Next roadmap item

Implement in order (`AGENTS.md`):

1. **Telemetry** — session score, event log, `experimental.graphify` flag
2. Graphify sidecar
3. Map UI (opt-in)
4. Durable handoff
5. Clusters
6. Prefetch

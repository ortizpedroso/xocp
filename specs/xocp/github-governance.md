# XOCP GitHub governance

Repository: [github.com/ortizpedroso/xocp](https://github.com/ortizpedroso/xocp)  
Default branch: `dev`

Upstream OpenCode workflows (`.github/workflows/*`) still reference OpenCode org runners (`blacksmith-*`) and maintainer bots. Until those are trimmed, **XOCP CI** is provided by `.github/workflows/xocp-ci.yml` on standard `ubuntu-latest` runners.

## 1. Repository files (in git)

| File | Purpose |
|------|---------|
| `.github/CODEOWNERS` | Default reviewer for PRs (`@ortizpedroso`) |
| `.github/TEAM_MEMBERS` | Maintainers exempt from upstream contributor bots |
| `.github/workflows/xocp-ci.yml` | Required checks: typecheck + unit tests |

## 2. Ruleset (configure in GitHub UI)

GitHub → **Settings** → **Rules** → **Rulesets** → **New ruleset**

Suggested ruleset: **Protect dev**

| Setting | Value |
|---------|-------|
| Enforcement | Active |
| Target branches | `dev` |
| Restrict deletions | On |
| Require linear history | Off (merge commits OK for now) |
| Require pull request | On |
| Required approvals | 0 (solo maintainer) or 1 if you add collaborators |
| Dismiss stale reviews | On |
| Require status checks | On |
| Required checks | `typecheck`, `test` (from **xocp-ci** workflow) |
| Require branches up to date | On |
| Block force pushes | On |

Direct link (after login):  
https://github.com/ortizpedroso/xocp/settings/rules

## 3. Optional: disable upstream-only workflows

These workflows assume OpenCode infrastructure and may queue forever on XOCP:

- `publish.yml`, `publish-vscode.yml`, `publish-github-action.yml`
- `notify-discord.yml`, `stats.yml`
- `opencode.yml` (comment bot — needs `anomalyco/opencode` action + org secrets)
- `pr-management.yml` (installs opencode.ai for external PR triage)

Disable via **Actions** → select workflow → **⋯** → **Disable workflow**, or delete/replace in a later cleanup PR.

Keep enabled for now:

- `xocp-ci.yml` (XOCP)
- `typecheck.yml` / `test.yml` — only if you migrate runners to `ubuntu-latest`; otherwise rely on `xocp-ci.yml`

## 4. Labels (optional)

Create labels used by upstream PR bots (or ignore if workflows are disabled):

- `needs:title`, `needs:issue`, `needs:compliance`

## 5. Secrets

XOCP does not need OpenCode publish secrets until you ship releases. For future Graphify sidecar or cloud deploy, add secrets under **Settings → Secrets and variables → Actions**.

## 6. Checklist

- [ ] Merge governance PR to `dev`
- [ ] Create ruleset **Protect dev** with required checks `typecheck` + `test` from `xocp-ci`
- [ ] Confirm Actions run green on a test PR
- [ ] Disable or ignore upstream workflows that use `blacksmith-*` runners
- [ ] Add collaborators to `TEAM_MEMBERS` when they join

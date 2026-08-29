# XOCP development workflow

Como dividir o trabalho entre **Cloud Agent (Cursor online)** e **máquina local (Windows)**.

## Princípio

| Onde | Papel |
|------|--------|
| **Cloud Agent** | Desenvolvimento principal — features, PRs, CI |
| **Local (`C:\projetos\xocp`)** | Só testar — `git pull` + `bun dev web` |

Não desenvolva features grandes no local e no cloud ao mesmo tempo. O cloud abre o PR; o local valida quando você quiser.

## Branches

| Branch | Uso |
|--------|-----|
| `dev` | Integração — sempre utilizável com `bun dev web` |
| `cursor/<nome>-40fd` | Branches do Cloud Agent |
| `session-telemetry`, etc. | Branches locais (máx. 3 palavras, hífens) |

Nunca commite direto em `dev` depois que a proteção de branch estiver ativa. Use PR.

## Cloud Agent (desenvolvimento)

1. Agente cria branch `cursor/<nome>-40fd` a partir de `dev`
2. Implementa, commita, abre PR draft → `dev`
3. CI (`xocp-ci`) roda typecheck, test e verificação de docs
4. Quando aprovado, merge em `dev`

## Local (só testar)

Quando quiser validar na sua máquina:

```powershell
cd C:\projetos\xocp
git fetch origin
git checkout dev
git pull origin dev
bun install
bun dev web
```

Para testar uma branch de PR antes do merge:

```powershell
git fetch origin
git checkout cursor/nome-da-branch-40fd
bun install
bun dev web
```

URLs:

- App: `http://localhost:4096`
- Documentação: `http://localhost:4096/documentacao`

**Não precisa clonar de novo** se `C:\projetos\xocp` já existe.

## Ritmo de sync

1. **Antes de testar local:** `git pull origin dev` (ou checkout da branch do PR)
2. **Durante o trabalho no cloud:** commits na branch do agente
3. **Quando o PR mergear:** `git pull origin dev` no Windows
4. **Evite** branches divergentes por dias — rebase/merge `dev` na feature pelo menos 1× por dia de trabalho ativo

## O que fica onde

| Artefato | Local |
|----------|-------|
| Código | GitHub `ortizpedroso/xocp` |
| Roadmap | `AGENTS.md` |
| Specs de feature | `specs/xocp/` |
| Regras GitHub | `specs/xocp/github-governance.md` |
| Documentação da IA (UI) | `specs/xocp/documentacao.md` → gerada para a app |
| Bootstrap do Cloud Agent | `.cursor/environment.json` |

## Próximo item do roadmap

Ordem em `AGENTS.md`:

1. **Telemetria** — session score, event log, `experimental.graphify`
2. Graphify sidecar
3. UI de mapa (opt-in)
4. Handoff durável
5. Clusters
6. Prefetch

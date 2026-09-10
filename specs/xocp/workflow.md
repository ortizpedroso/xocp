# XOCP development workflow

Como dividir o trabalho entre **Cloud Agent (Cursor online)** e **máquina local (Windows)**.

## Princípio

| Onde | Papel |
|------|--------|
| **Cloud Agent** | Desenvolvimento principal — features, PRs, CI |
| **Local (`C:\projetos\xocp`)** | Só testar — `git pull` + `bun dev:local` |

Não desenvolva features grandes no local e no cloud ao mesmo tempo. O cloud abre o PR; o local valida quando você quiser.

## Branches

| Branch | Uso |
|--------|-----|
| `dev` | Integração — utilizável com `bun dev:local` (ou `bun dev web` após build embutido da UI) |
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
bun dev:local
```

Abra http://localhost:4444 (API em http://localhost:4096).

Para um único processo em :4096, primeiro faça o build embutido da UI (`bun run --cwd packages/app build` e `bun run --cwd packages/opencode build`), depois `bun dev web`. Sem esse build, o servidor retorna 503 com instruções — não carrega UI remota.

Para testar uma branch de PR antes do merge:

```powershell
git fetch origin
git checkout cursor/nome-da-branch-40fd
bun install
bun dev:local
```

URLs (com `bun dev:local`):

- App: `http://localhost:4444`
- Documentação: `http://localhost:4444/documentacao`
- API: `http://localhost:4096`

Com `bun dev web` após build embutido, app e documentação ficam em `http://localhost:4096`.

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

1. **Telemetria** — session score, event log, `experimental.graphify` — **feito** (em `dev`)
2. **Graphify** — CLI local via `uv tool run --from graphifyy` — **feito** (em `dev`)
3. **UI de mapa** — sugestão opt-in, toast — **feito** (em `dev`)
4. **Handoff durável** — ≤2000 chars + tools do agente — **feito** (em `dev`)
5. **Clusters** — adiado
6. **Prefetch** — adiado

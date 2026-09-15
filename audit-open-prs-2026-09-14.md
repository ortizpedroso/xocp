# Auditoria — PRs abertos em ortizpedroso/xocp

Data: 2026-09-14 · Branch de referência: `dev` (`dc29c55ff`) · Escopo: somente investigação (nada foi mergeado/fechado/aprovado).

## Resumo executivo

- **17 PRs abertos**; **10 são duplicados/supersedidos** (o conteúdo já existe em `dev` ou foi incorporado por outro merge).
- **1 dupla rival** (mesmo recurso, implementações concorrentes): #77 × #80.
- **2 candidatos reais a merge** verificados localmente com sucesso: **#38** e **#39** (+ **#41**, empilhado sobre #39).
- **2 bloqueados por CI/teste vermelho**: #47 e #49.
- **Achado global:** o próprio `dev` está com o teste de paridade i18n **vermelho** (3 falhas), causado pelo commit `13d87af54` (feat(sources)), que adicionou chaves `settings.providers.headroom/omniroute`, `session.elicitador.ambiguity.*`, `settings.general.row.enableGraphify.*` e plurais `.*.many` ao `en.ts` **sem sincronizar as 70 locales**. Isso afeta o painel `parity.test.ts` e deve ser corrigido antes de qualquer merge.

## Tabela por PR

L = linhas. "Já no dev?" = diff `dev..branch` sobre os arquivos reais do PR (diffs vs base antiga são ruído e foram ignorados).

| PR | Título | Head | Base | Mergeable | CI (typecheck/test) | Diff (L) | Já no dev? | Conflita | Veredito |
|----|--------|------|------|-----------|----------------------|----------|------------|----------|----------|
| 15 | docs: atualiza página de documentação in-app | `cursor/documentacao-page-25ad` | dev | CONFLICTING/DIRTY | ok / ok | 2 (+42/−15) | **SIM** (≠ apenas 2 linhas) | dev | fechar |
| 23 | fix: bloqueia proxy UI remoto sem bundle | `cursor/ui-fallback-fix-93bb` | dev | CONFLICTING/DIRTY | ok / ok | 4 (+104/−27) | **SIM** (arquivos idênticos) | dev | fechar |
| 29 | feat: detecta saída degenerada + fallback | `cursor/degenerate-fallback-889b` | dev | CONFLICTING/DIRTY | ok / ok | 12 (+1017/−71) | **SIM** (`degenerate.ts`/`processor.ts` já em dev; merges #33/#48) | dev | fechar |
| 30 | fix: para de repetir erros de quota da Gemini | `cursor/fix-local-quota-retry-1e5e` | dev | MERGEABLE/CLEAN | ok / ok | 6 (+73/−2) | **SIM** (`provider.ts`/`retry.ts` idênticos) | — | fechar |
| 38 | feat(app): home aninha sessões em projetos + pin | `cursor/home-sidebar-tree-e640` | dev | MERGEABLE/CLEAN | ok / ok | 74 (+1423/−66) | **NÃO** (keys `home.pin.*`, `home.sections.*` novas) | dev (i18n `en.ts`) | **mergeável** ✔ |
| 39 | fix: prompts base se identificam como XOCP | `cursor/xocp-identity-prompts-e640` | dev | MERGEABLE/CLEAN | ok / ok | 6 (+30/−5) | **NÃO** (dev ainda diz "You are OpenCode") | — | **mergeável** ✔ |
| 40 | fix(core): seção 2.4 elicitador sempre-entrega-spec | `cursor/elicitador-scope-e640` | dev | CONFLICTING/DIRTY | ok / ok | 4 (+93/−0) | **SIM** (seção 2.4 já presente em dev) | dev | fechar |
| 41 | fix: respostas sobre docs como XOCP | `cursor/xocp-docs-brand-e640` | **#39** (`cursor/xocp-identity-prompts-e640`) | MERGEABLE/CLEAN | **só 2 checks** (sem typecheck/test) | 7 (+107/−7) | **NÃO** | stack sobre #39 | mergear após #39 |
| 46 | chore: vendor skill ui-ux-pro-max | `cursor/ui-ux-pro-max-skill-e640` | dev | MERGEABLE/CLEAN | ok / ok | 2 (+77/−0) | **NÃO** | — | mergeável (opcional, DRAFT) |
| 47 | feat: `bun run doctor` (diagnóstico) | `cursor/xocp-doctor-4e48` | dev | CONFLICTING/DIRTY | ok / **test FAILURE** | 4 (+1027/−0) | **NÃO** (feature única) | dev | ajustar |
| 48 | fix: bloqueia fallback pago sem consentimento | `cursor/fallback-cost-consent-4e48` | dev | MERGEABLE/UNSTABLE | ok / **test FAILURE** | 3 (+228/−24) | **SIM** (3/3 idênticos) | — | fechar |
| 49 | docs: bootstrap de agentes do AGENTS.md | `cursor/agents-bootstrap-4e48` | dev | MERGEABLE/UNSTABLE | ok / **test FAILURE** | 1 (+9/−0) | **NÃO** (único, mas verificar por que test falha) | — | ajustar |
| 73 | docs(spec): baseline-auditor seção 4.9 | `claude/baseline-auditor-spec-section` | dev | MERGEABLE/CLEAN | ok / ok | 1 (+63/−0) | **SIM** (seção 4.9 já no dev, merge #76) | — | fechar |
| 74 | docs(spec): baseline-global.md | `claude/baseline-global-spec` | dev | CONFLICTING/DIRTY | ok / ok | 2 (+70/−15) | **SIM** (`baseline-global.md` já no dev) | dev | fechar |
| 77 | feat(app): sidebar persistente + docs no shell | `claude/layout-docs-in-shell` | dev | MERGEABLE/CLEAN | ok / ok | 4 (+240/−7) | **NÃO** | **#80** (`layout-new.tsx`) | decisão humana |
| 79 | feat: todos os agentes respondem perguntas | `feat/agent-user-question-handling` | dev | CONFLICTING/DIRTY | ok / ok | 14 (+110/−0) | **SIM** (mergeado como #78/`757662214`; única ≠ = import `@/agent/agent` em teste) | dev | fechar |
| 80 | feat(app): menu esquerdo persistente | `claude/adoring-keller-q2659x` | dev | CONFLICTING/DIRTY | ok / ok | 3 (+336/−20) | **NÃO** | **#77** (`layout-new.tsx`) | decisão humana |

## Verificação real executada (além do CI)

| PR | Ação | Resultado |
|----|------|-----------|
| 39 | worktree + `bun install`, merge de `dev` na branch, `bun run typecheck` (packages/opencode) | merge limpo · **typecheck PASS** · teste `prompt-identity.test.ts` PASS (10 expect) |
| 38 | idem (packages/app), `bun run typecheck` (`tsgo -b` + contract-check) e `parity.test.ts` | merge limpo · **typecheck PASS** · parity 3 fail = **mesmas 3 falhas do `dev` puro** (sem regressão) |
| 41 | leitura do diff + topologia (base = branch de #39, 5 prompts + 2 testes) | conteúdo único; sem typecheck/test no CI |

Observação: o teste `prompt-identity.test.ts` apresentou um timeout espúrio na primeira execução (quirk do bun 1.4.0); na re-execução passou em 3s.

## Ações recomendadas

### A. Seguros para mergear (Já verificado)
1. **#39** — merge direto em `dev` (base antiga, mas merge+typecheck+teste verificados localmente). Após merge, rodar CI completo.
2. **#41** — merge **após o #39** (está empilhado sobre a branch dele; toca os mesmos 5 prompts). Retarget para `dev` e conferir typecheck/test (hoje só rodou `check-standards`/`check-compliance`).
3. **#38** — merge em `dev` após o fix de i18n do Bloco C (tipo `tsgo -b` verde; parity só repete a falha pré-existente do dev). É o PR maior e mexe em 70 locales + home tree; idealmente revisar o diff das views antes.
4. **#46** — opcional/baixo risco (vendor de skill, DRAFT, 2 arquivos novos, CI verde).

### B. Decisão humana (excluem-se mutuamente)
5. **#77 × #80** — mesmo recurso ("sidebar/menu esquerdo persistente no layout novo"), ambos DRAFT, ambos tocam `layout-new.tsx`. **#77** está MERGEABLE/CLEAN com CI completo verde; **#80** está CONFLICTING/DIRTY. Recomendação: avaliar a abordagem de #77 e fechar #80 (ou o inverso). Não mergear os dois.

### C. Ajustar antes de mergear (ou descartar)
6. **Fix de i18n no `dev` (pré-requisito)** — o commit `13d87af54` quebrou `parity.test.ts`. Rodar `script/sync-all-i18n.ts` e commitar as 70 locales; conferir com `bun --cwd packages/app test src/i18n/parity.test.ts`.
7. **#47** (doctor, único) — precisa de rebase (CONFLICTING) + corrigir o `test` vermelho antes de considerar.
8. **#49** (bootstrap AGENTS.md, único) — `test` vermelho; verificar a causa (1 arquivo só) antes de considerar.
9. **Duplicados/supersedidos — fechar sem mergear:** #15, #23, #29, #30, #40, #48, #73, #74, #79 (conteúdo já presente em `dev`).

### D. Regra de bolso para o pipeline
Todos os PRs analisados (exceto #38/#39/#46) estavam baseados em `dev` antigo (merge-base `0056dafef`, `d16dec119`, `f81dc356d`, etc.). A maioria dos DRAFTs `cursor/*` e `claude/*` foram **parcialmente incorporados a `dev` por outros merges** e ficaram abertos sem rebase — daí os estados CONFLICTING/DIRTY. Sugestão: fechar/atualizar esses PRs e reabrir apenas quando houver trabalho novo.
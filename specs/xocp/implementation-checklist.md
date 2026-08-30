# XOCP — Checklist de Implementação

Marcar `[x]` só depois de auditoria real do diff/CI, não do relatório do
Cursor sozinho. Atualizar este arquivo a cada rodada.

**Última auditoria:** 2026-08-30 — branch `cursor/graphify-cli-rewrite-9521` (PR [#9](https://github.com/ortizpedroso/xocp/pull/9)); `origin/dev` ainda em `c7c80ec8a` (sem merge do #9).

## Fase de Fundação — código pronto, fechamento em andamento

- [x] Item 1 — Telemetria de sessão (score, eventos, threshold) — no branch do #9; CI `test` passa `packages/core/test/telemetry/`
- [x] Item 2/3 — Graphify: CLI local via `uv tool run --from graphifyy==0.9.52`, sem HTTP, com UI opt-in — no branch do #9; spec em `specs/xocp/graphify.md`
- [x] Item 4 — Handoff durável, núcleo (`write`/`latest`, limite 2000 chars) — no branch do #9; `Handoff.node` em `location-services.ts`
- [x] Correção — precedência de config (`Config.latest`) no `Graphify.graphifyEnabled()` — commit `19ca87108`
- [x] Correção — paridade i18n (`de`, `zh`, `zht`, `no`, `tr`) das chaves `session.graphify.*` — commit `cb1d6c549`; `parity.test.ts` verde no CI (run `33323631700` / `33324534234`)
- [x] CI verde nos 4 checks do PR #9 (`typecheck`, `test`, `xocp-docs`, `pr-standards`) — último run verde: https://github.com/ortizpedroso/xocp/actions/runs/33324534234
- [ ] Merge do PR #9 → `dev` — **pendente**; PR aberto; `gh pr merge` e `git push origin dev` bloqueados por ruleset (exige aprovação na UI)
- [ ] Fechamento de #5, #6, #7, #8 sem merge, cada um com comentário explicando por quê — **parcial**: #5–#8 estão `CLOSED` sem merge, mas **sem** os comentários padronizados do prompt de housekeeping (ex.: #5 só tem "ok")
- [ ] Checklist de status em `AGENTS.md`/`README.md` atualizada (itens 1–4 concluídos, 5–6 marcados como adiados) — **parcial**: `README.md` atualizado no branch do #9 (`4fc2d2dee`); `AGENTS.md` não tem checklist `[ ]`/`[x]`; nada disso está em `dev` até o merge
- [ ] Verificação local pós-merge: `bun typecheck` + testes de `telemetry`/`graphify`/`handoff` rodando contra `dev` — **bloqueado** até merge do #9 em `dev`

## Validação de hipótese — antes de decidir sobre clusters (item 5)

Isso **não é código** — é teste manual, feito por você/equipe, usando o que já existe (`task` tool com `background: true`).

- [ ] Escolher 4–6 tarefas reais que se dividem em frentes independentes (ex.: schema de banco + formulário de UI)
- [ ] Rodar cada uma em baseline (agente único, sequencial) e em teste (2+ subagentes via `task` em paralelo)
- [ ] Coletar da telemetria: tempo de relógio, turnos, arquivos tocados, por `session_id`
- [ ] Avaliar: os pedaços ficaram realmente sem conflito? o resumo que o `task` devolve foi suficiente pro agente principal continuar sem re-ler tudo?
- [ ] Decisão registrada: vale construir roteamento automático por comunidade, ou os dados não sustentam isso?

## Adiado por decisão — não construir sem evidência

- [ ] Item 5 — Roteamento automático por comunidade / `work-map.json`
- [ ] Item 6 — Prefetch de mapa em background
- [ ] Ferramenta `handoff` exposta ao agente (`Handoff.write`/`latest` como tool) — só se a validação de hipótese acima mostrar necessidade real de continuidade **entre sessões diferentes**, não dentro da mesma sessão (que o `task` já resolve de graça)

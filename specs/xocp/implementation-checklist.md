# XOCP — Checklist de Implementação

Marcar `[x]` só depois de auditoria real do diff/CI, não do relatório
do agente sozinho. Atualizar este arquivo a cada rodada.

**Última auditoria:** 2026-09-08 — verificado item a item contra `dev`.

## Fundação (concluído)
- [x] Telemetria de sessão (V1 + V2)
- [x] Graphify — CLI local via `uv tool run`, subagente `graphify-explorer`
      + ferramenta `graphify_query`
- [x] Handoff durável (núcleo + ferramentas)
- [x] Proteção contra loop degenerado (detecção + fallback de modelo,
      nunca escolhe modelo pago sem consentimento explícito)
- [x] Rebranding de superfície completo (identidade "You are XOCP" nos
      5 prompts base, sem vazamento residual de marca)
- [x] Layout novo: projetos/seções na lateral, pino, expandir/recolher

## Sistema Elicitador/Spec (concluído)
- [x] Elicitador como agente nativo (permissão restrita a
      `.opencode/specs/*.md`)
- [x] Seção 2.3 — regra de ouro contra confabulação
- [x] Seção 2.4 — nunca abandona o propósito, sempre entrega Spec
- [x] Seção 2.5 — Spec sempre salva em arquivo, nunca só em conversa
- [x] Filosofia "proponha, não interrogue" na entrevista (seção 2.1) —
      PR [#61](https://github.com/ortizpedroso/xocp/pull/61) mergeado em
      `dev` (squash `d1fd1ad`), 08/09/2026
- [x] 6 regras técnicas travadas, também no prompt base do `build`
      (não só no Elicitador)
- [x] Banner de sugestão + pergunta de triagem ambígua
- [x] Correção do seletor de agente (`hasCustomAgent`/`pipeline: true`)
      — PR [#60](https://github.com/ortizpedroso/xocp/pull/60) mergeado em
      `dev` (merge commit `5d74684`), 08/09/2026. `graphify-explorer`
      confirmado intacto (`mode: "subagent"`, sem `pipeline: true`) no
      merge com `dev`. CI (`typecheck`, `xocp-docs`, `check-compliance`,
      `check-standards`, e o job `test` incluindo `local-agent.test.ts`,
      `packages/opencode/test/agent/agent.test.ts` e `test/workflow/`)
      verde — única falha no job `test` é o gap de i18n pré-existente em
      `dev` (locale `ar`), não relacionado a este PR. **Não confirmado
      por execução real:** o E2E Playwright
      `agent-selector-pipeline.spec.ts` não está plugado em nenhum
      workflow de CI deste repo e não pôde ser rodado nesta auditoria —
      o ambiente de auditoria bloqueia a instalação de dependências do
      monorepo (`@solidjs/start` fixado em build de preview no host
      `pkg.pr.new`, bloqueado pela política de rede do sandbox). Revisão
      de código confirma que o spec cobre exatamente o cenário pedido
      (seletor visível com `showCustomAgents: false` e os 7 agentes
      primários); falta rodar de fato em ambiente com rede completa.

## Workflow-Pipeline v2 (concluído)
- [x] Fase 0 — documentação (`workflow-pipeline-v2.md`)
- [x] Fase 1a — 6 ferramentas (task_approval_check, cycle_tracker,
      execution_summary_write/read, review_checklist_write/read)
- [x] Fase 1b — `spec_status_write` com confirmação real via `ask`
- [x] Fase 2 — 4 agentes nativos (workflow-triador, analista,
      workflow-executor, avaliador)
- [ ] Fase 3 — piloto real, com humano, do ciclo completo (Executor →
      Avaliador → correção → aprovação) — **ainda não feito**

## Automação de provedores externos (concluído)
- [x] OmniRoute — botão de ativação automatizada + doctor
- [x] Headroom — botão de ativação automatizada
- [x] `bun run doctor` + `bun run doctor --fix` (só `uv`, nunca
      Python/Node/Bun automaticamente)
- [x] Skill `ui-ux-pro-max` vendorizado, versão travada

## Dívida técnica conhecida (baixa prioridade, não bloqueante)
- [ ] `session.started` duplica no pai via `TaskTool` — não afeta
      score, só polui log
- [ ] Roteamento automático por comunidade (item 5) — adiado, sem
      evidência de ganho
- [ ] Prefetch de mapa em background (item 6) — adiado

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
- [ ] Teste `i18n parity` (`packages/app/src/i18n/parity.test.ts`) falha
      no locale `ar` — chaves faltando em `session.elicitador.ambiguity.*`,
      `settings.providers.omniroute.*`, `settings.providers.headroom.*`.
      Pré-existente, mascarado até 08/09/2026 (ver item de CI abaixo) —
      agora visível de propósito, ainda não corrigido. Corrigir = traduzir
      as chaves faltantes (ou os locales faltantes) nesses namespaces.

## CI — decisões pendentes
- [x] Bug: job `test` do `xocp-ci.yml` rodava `packages/app` e
      `packages/core` como duas linhas de um `run: |` só — `bash -e`
      abortava no primeiro erro, então `packages/core` nunca rodava de
      verdade em PR nenhum (só compilava via `typecheck`). Corrigido no
      PR [#66](https://github.com/ortizpedroso/xocp/pull/66): dois
      `steps` separados, com `if: always()` no de `packages/core` (só
      separar em steps não bastaria — mesmo comportamento de "pular o
      próximo se o anterior falhar" existe também no nível de step).
      **Confirmado via CI real** (run do próprio PR #66, e mesclado no
      branch do PR #65 pra validar junto com as mudanças da Parte 3):
      os dois steps aparecem separados, `packages/app` continua falhando
      (i18n, esperado) e `packages/core` agora roda a suíte inteira de
      verdade — 1151 testes / 151 arquivos (bate com
      `find packages/core -iname "*.test.ts" | wc -l` = 151), incluindo
      os 2 testes novos de `workflow-review.test.ts` da Parte 3
      (contagem de pass foi de 1141→1143 exatamente ao mesclar o fix
      no branch do PR #65, sem mudar o número de fails).
- [ ] **Achado novo, revelado pelo fix acima:** `packages/core/test/util/which.test.ts`
      tem 2 falhas reais e pré-existentes (`finds a command from PATH
      override`, `uses first PATH match` — esperam um path e recebem
      `null`), nunca antes visíveis porque `packages/core` nunca rodava.
      Não é regressão desta rodada nem relacionado a nenhuma das Partes
      1-3; não investiguei a causa raiz. Registrando como dívida técnica
      a investigar — provavelmente algo específico do ambiente de CI
      (runner) que quebra a resolução de PATH que o teste espera.
- [ ] **Decisão pendente:** os testes de `packages/opencode` que usam
      `TestLLMServer` (ex.: `elicitador-prompt.test.ts`,
      `workflow-pipeline-prompt.test.ts`, `analista-prompt.test.ts`) só
      rodam no workflow `test.yml`, que é `workflow_dispatch`-only —
      nunca dispara automaticamente em PR. Não é regressão desta rodada,
      já era assim antes. Duas opções, precisa de decisão humana:
      (a) automatizar `test.yml` pra rodar em todo PR (provavelmente
      esses testes são mais lentos/caros — pode ter sido deixado manual
      de propósito, verificar antes de mudar); ou (b) manter manual e
      criar um lembrete explícito no processo de review ("rodar
      `test.yml` via workflow_dispatch antes de mergear PRs que tocam
      prompts/agentes de `packages/opencode`").

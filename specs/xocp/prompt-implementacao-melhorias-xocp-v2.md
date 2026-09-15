# Prompt de implementação — melhorias XOCP v2

Registro histórico dos prompts de implementação desta leva de melhorias no
pipeline agêntico do XOCP, na ordem em que foram pedidos. Para cada tarefa:
o que foi pedido, o que foi de fato entregue, e onde as duas coisas
divergiram (e por quê — sempre porque a premissa assumida no prompt não
batia com o código real, nunca por decisão arbitrária).

Ver também `specs/xocp/agent-architecture.md` para a arquitetura completa
dos agentes e `AGENTS.md` §0 (nota lá) sobre onde a documentação aspiracional
diverge do que roda de verdade.

---

## Tarefa 1 — Reminder de escopo em ciclos ≥ 2

**Pedido:** em `packages/opencode/src/tool/cycle-tracker.ts`, quando
`cycle >= 2`, anexar ao `output` do `cycle_tracker` um bloco lembrando o
executor dos limites de `files_scope.allow_modify`/`strictly_forbidden` do
Brief (schema `TechnicalBriefV2`).

**Entregue:** o mesmo comportamento (reminder injetado a partir do ciclo 2),
mas contra o schema real do Brief (`files_expected_touched`/`constraints`,
`specs/xocp/workflow-pipeline.md` §4) — `TechnicalBriefV2.files_scope` é um
subsistema paralelo sem consumidor em produção (ver achado 5.1 de
`agent-architecture.md`). Reaproveita o loader já existente
`WorkflowReview.readContractStatus` em vez de duplicar parsing de YAML.

---

## Tarefa 2 — Protocol First no Executor

**Pedido:** adicionar regra compulsória no topo de `workflow-executor.txt`
exigindo leitura do Brief + `specs/xocp/baseline-global.md` antes de
qualquer ferramenta de edição.

**Entregue:** exatamente como pedido, sem divergência.

---

## Tarefa 3 — Cláusula Anti-Racionalização de Escopo

**Pedido:** adicionar seção em `workflow-executor.txt` instruindo o
Executor a parar e reverter se se pegar justificando uma edição fora do
escopo declarado.

**Entregue:** como pedido, com a terminologia ajustada para os campos reais
do Brief (`files_expected_touched`/`constraints`, não `files_scope`).

---

## Tarefa 4 — Auditoria de Diff Cumulativo (Anti-Salami)

**Pedido:** no call-site que popula `diffFiles` para o Avaliador, trocar o
comando de diff do commit ativo para `git diff <base>...HEAD`.

**Entregue:** `evaluateDualLens` (`packages/core/src/workflow-review/avaliador.ts`)
não tem nenhum call-site em produção — só é exercitada pelo teste unitário
próprio. A correção foi aplicada dentro da própria função: quando
`diffFiles` não é passado explicitamente, ela agora computa via
`computeCumulativeDiffFiles` (`git diff <base>...HEAD --name-only`) por
padrão, em vez de exigir que o chamador já tenha montado a lista. Testes
novos provam que isso pega uma mudança de um ciclo anterior que um diff
por-commit perderia.

---

## Tarefa 5 — Acting vs Clarifying no Elicitador

**Pedido:** seção em `elicitador.txt` priorizando busca via `sources_query`
(FTS5) e leitura de código/AST sobre perguntar ao usuário; limite de 1
pergunta por turno, formato múltipla escolha.

**Entregue:** o mesmo princípio (ação antes de pergunta, no máximo 1
pergunta nova por rodada), mas contra as ferramentas reais do Elicitador —
`sources_query` não é uma tool exposta a nenhum agente neste código; as
reais são `read`/`grep`/`glob`, delegação ao subagente `explore`, e
`websearch`/`webfetch`. Não forçou formato de múltipla escolha, que
contradiria o padrão de pergunta aberta já estabelecido no resto do prompt
(e testado em `elicitador-prompt.test.ts`). Aplicado nas duas cópias
sincronizadas (`packages/opencode/src/agent/prompt/elicitador.txt` e
`packages/core/src/plugin/elicitador.txt` — sincronia garantida por
`elicitador-scope.test.ts`).

---

## Tarefa 6 — Sanitização do Handoff Durável

**Pedido:** `packages/opencode/src/tool/handoff-sanitize.ts` novo,
aplicado em `execution-summary-write.ts` e `review-checklist-write.ts`
antes de persistir — remove ênfase/emoji/palavras de reforço, trunca em
2000 caracteres.

**Entregue:** exatamente como pedido, sem divergência.

---

## Tarefa 7 — REMOVIDA (catálogo de modelos)

Não incluída nesta leva. `dialog-select-model.tsx` não define modelos —
renderiza dinamicamente o catálogo de `packages/core/src/models-dev.ts`,
que busca em tempo real de `models.dev`. Não há enum local pra atualizar;
isso não é uma tarefa de código neste repositório.

---

## Tarefa 8 — Loop de autoteste do Executor (isolado do Avaliador)

### Texto do pedido, na íntegra

> Princípio inegociável: o Avaliador não pode saber que o autoteste
> existe. Isso já está escrito na docstring de `self-test.ts` (Reviewer
> Blindness) — a Tarefa 8 é só conectar isso, não inventar o princípio.
> Nenhuma tool nova criada aqui pode ter permissão de leitura no perfil
> `avaliador` em `agent.ts`.
>
> Dois contadores de ciclo, nunca um só: o `cycle_tracker` existente conta
> o ciclo Avaliador ↔ Executor. O autoteste é um ciclo interno ao
> Executor que não deve consumir esse contador. Crie um segundo contador,
> mesmo padrão de `cycle-tracker.ts` (SQLite, `MAX_CYCLES = 3`), em
> tabela/tool separada — `self_test_tracker`.
>
> Fluxo: dentro de uma tentativa de execução, antes de
> `execution_summary_write`: implementar, gerar/atualizar teste unitário,
> chamar `self_test_tracker.increment(task_id)` (se > 3, escalar sem
> chamar `execution_summary_write` nem delegar ao avaliador), rodar
> `runExecutorSelfTest` (exitCode != 0 → corrigir e repetir; exitCode 0 →
> autorizado a prosseguir, sem menção ao número de tentativas).
>
> Escalação de autoteste: registro durável mínimo
> `{ task_id, self_test_cycles_exhausted: true, last_exit_code, test_file_path }`
> — não reutilizar `ExecutionSummaryStatus`. Texto detalhado
> (onde/por que/o que tentei/o que fazer, com stderr/stdout real, não
> resumido) vai só na mensagem de chat via `ask`, nunca no campo
> persistido de 2000 caracteres do handoff Executor↔Avaliador.

### O que foi entregue

- **`packages/core/src/workflow-executor/self-test-tracker.ts`** (novo):
  contador SQLite isolado (`self-test-cycles.db`, tabela
  `self_test_cycles`), `MAX_SELF_TEST_CYCLES = 3`,
  `incrementSelfTestCycle`/`readSelfTestCycle` espelhando
  `workflow-review/cycle-tracker.ts` 1:1, mas em arquivo, DB e tabela
  totalmente separados — sem nenhuma dependência do contador do Avaliador.
  Também `recordSelfTestAttempt`/`readLastSelfTestAttempt` (persistem o
  último exit code/caminho de teste na mesma linha, pra que a escalação
  no 4º incremento tenha dado real em vez de depender do modelo lembrar
  corretamente entre chamadas) e `writeSelfTestEscalation` (grava
  exatamente o registro mínimo pedido, nada além disso).
- **`packages/opencode/src/tool/self-test-tracker.ts` + `.txt`** (novo):
  tool `self_test_tracker` que conecta `runExecutorSelfTest`
  (`packages/core/src/workflow-executor/self-test.ts`, já existia, só
  faltava um wrapper) ao incremento do contador — uma chamada por
  tentativa faz as duas coisas (incrementa e roda o teste), retornando
  pass/fail/limite-atingido pro executor decidir o próximo passo.
  Registrado em `packages/opencode/src/tool/registry.ts` no mesmo padrão
  de `cycle_tracker`.
- **`agent.ts` — não tocado na seção `avaliador.permission`**: como o
  perfil do avaliador já usa `"*": "deny"` como primeira regra
  (`agent.ts:306`), qualquer tool não explicitamente listada — incluindo
  a nova `self_test_tracker` — já sai invisível pra ele por construção
  (mesmo mecanismo de `Permission.disabled`/`resolveTools` usado em
  `session/llm/request.ts:207-213` pra filtrar a lista de tools antes de
  ir pro modelo). Teste novo em
  `packages/opencode/test/agent/agent.test.ts` ("Reviewer Blindness:
  self_test_tracker is never visible to avaliador...") prova isso
  diretamente com `Permission.disabled`, não só por inspeção de código.
- **`workflow-executor.txt`**: novo passo 6 (obrigatório, diferente do
  passo 7 opcional do `baseline-auditor`) descrevendo o loop de autoteste
  e a escalação separada; passos seguintes renumerados (6→7, 7→8, 8→9).
  Os 3 marcadores exatos que `EXECUTOR_GATE_MARKERS`/testes de prompt
  verificam (`"Você é o workflow-executor"`,
  `"antes do passo 2 (task_approval_check)"`,
  `"PRIMEIRO: chame cycle_tracker"`) permanecem intactos.
- **Testes novos:**
  `packages/core/test/workflow-executor/self-test-tracker.test.ts` (7
  casos, incluindo isolamento explícito contra `cycle_tracker` — exaurir
  o contador de autoteste não move o contador do avaliador e vice-versa)
  e o teste de visibilidade de permissão citado acima.

Nenhuma divergência do pedido original nesta tarefa — o texto já era
preciso o bastante contra o código real (`self-test.ts` já existia com a
docstring de Reviewer Blindness citada, `cycle-tracker.ts` já era o
padrão certo a espelhar).

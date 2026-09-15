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

---

## Tarefa 9 — Diário de bordo do Executor

### Texto do pedido, na íntegra

> O workflow-executor precisa do próprio diário entre ciclos do que
> tentou e por quê — hoje ele só lê o veredito do Avaliador via
> `review_checklist_read`, nunca o próprio raciocínio anterior. Arquivo
> novo por tarefa, `.opencode/execution-log/<task_id>.md`, texto técnico
> livre (não JSON), append-only, uma seção por ciclo: "## Ciclo N / O
> que fiz / Por que escolhi essa abordagem / O que ficou em dúvida /
> pode estar errado". Nenhuma tool nova necessária — `edit`/`write_file`
> bastam. Verificar (não assumir) se `.opencode/execution-log/` precisa
> do mesmo tratamento de `.gitignore` que `.opencode/briefs/` — checar o
> `.gitignore` real antes de decidir. A instrução em
> `workflow-executor.txt` de ler o diário existente, se houver, precisa
> vir ANTES do passo já existente de `review_checklist_read` (ordem
> importa: raciocínio próprio antes de reagir ao veredito externo), e a
> escrita da nova entrada acontece no fim do ciclo, no mesmo turno de
> `execution_summary_write`. Não é lido por Avaliador/humano por padrão;
> sem necessidade de shielding de permissão (diferente da Tarefa 8) —
> aqui não há requisito de sigilo, só de não poluir os outros fluxos.

### O que foi entregue

- **`.opencode/execution-log/.gitignore`** (novo): verificado
  primeiro que `.opencode/briefs/.gitignore` usa o padrão `*` +
  `!.gitignore` (não uma entrada no `.gitignore` raiz) antes de
  replicar — exatamente esse padrão, sem inventar variação.
- **`workflow-executor.txt`**: novo passo 3 (leitura do diário, se
  existir) inserido ANTES do passo de `review_checklist_read`
  (renumerado pra passo 4), com a justificativa explícita de ordem no
  próprio texto do prompt ("Tenha seu próprio raciocínio em mãos ANTES
  de reagir ao veredito externo"). Todos os passos seguintes
  renumerados (4→10), incluindo a correção da referência cruzada interna
  "passo 7" → "passo 8" que teria ficado desalinhada. Escrita da entrada
  do ciclo movida pro final do passo de `execution_summary_write`
  (renumerado pra passo 9), mesmo turno, append-only, formato de seções
  exatamente como pedido.
- Nenhuma tool nova criada — confirmado que `edit`/`write` já cobrem o
  caso, como o pedido antecipava.

Nenhuma divergência do pedido original — a única decisão não trivial
(checar o `.gitignore` real antes de replicar o padrão) já estava
explicitamente pedida, não foi uma suposição minha.

---

## Tarefa 10 — Registro de recorrência / auto-evolução

### Texto do pedido, na íntegra

> Alerta a partir de 3 ocorrências do mesmo critério/regra numa janela
> de 20 tarefas concluídas OU 30 dias, o que vier primeiro. Relatório
> gerado automaticamente a cada 10 tarefas concluídas, por um subagente
> novo, dedicado, somente-leitura, mesmo perfil de permissão do
> `baseline-auditor`. Fontes de evento: só as 3 já existentes —
> `review_checklist_write` (critério reprovado por ID), violação do
> `baseline-auditor` (uma das 11 regras fixas por ID), escalação de
> autoteste da Tarefa 8 (`writeSelfTestEscalation`) — não inventar uma
> quarta fonte. Armazenamento: seguir o padrão já estabelecido de SQLite
> via `bun:sqlite`, como `cycle-tracker.ts`/`self-test-tracker.ts` — não
> introduzir formato diferente. Forma de tabela sugerida:
> `pattern_events(task_id, category_id, source, cycle, created_at)`.
> Agente nativo novo registrado em `agent.ts`, mesmo padrão do
> `baseline-auditor` (`mode: "subagent"`, `"*": "deny"` + read/grep/glob
> + a tool nova de leitura); nome sugerido `pattern-auditor`, pode
> renomear se ficar mais claro mas precisa documentar a escolha em
> `agent-architecture.md`. O relatório final SEMPRE separa duas
> categorias, nunca misturadas: "erro recorrente" (candidato a regra
> nova no baseline ou ajuste de prompt) vs. "rotina recorrente"
> (candidato a tool/skill nova); se não houver dado suficiente pra
> popular "rotina recorrente" na v1, documentar como limitação conhecida
> em vez de forçar heurística fraca. O gatilho "a cada 10 tarefas" precisa
> de um contador cumulativo de tarefas concluídas — verificar se já
> existe antes de criar tabela nova; se não existir, criar uma é
> aceitável, mas documentar por quê. Esse subagente NUNCA implementa a
> melhoria sozinho, só relata — mesma disciplina de
> `workflow-pipeline-v2.md` §8 ("o sistema aprende via spec mais
> afiada, não via modelo mudando sozinho"); isso não é entulho de
> escopo, é consistência com um princípio já adotado no projeto.

### O que foi entregue

- **Investigação prévia (antes de codar):** confirmado por grep que não
  existe nenhum contador cumulativo de tarefas concluídas persistido em
  lugar nenhum do projeto — o único candidato era o contador em memória,
  por-execução, do `ClusterDispatcher` (`cluster/dispatcher.ts:67`),
  inútil entre sessões porque nunca é persistido. Criar uma tabela nova
  (`task_completions`) era a única opção real, documentado no próprio
  código (`pattern-events.ts:62-67`).
- **`packages/core/src/evolution/pattern-events.ts`** (novo): banco
  SQLite próprio (`pattern-events.db`, nunca reaproveita as tabelas de
  `cycle-tracker.ts`/`self-test-tracker.ts`), tabela `pattern_events`
  exatamente na forma sugerida + tabela `task_completions` pro contador
  cumulativo. `RECURRENCE_THRESHOLD = 3`, `WINDOW_TASKS = 20`,
  `WINDOW_DAYS = 30`, `REPORT_EVERY_N_COMPLETIONS = 10` — todos os
  parâmetros fixos exatamente como pedido. `queryRecurringCategories`
  conta **tarefas distintas**, não ciclos de retentativa dentro da mesma
  tarefa — decisão de interpretação documentada no próprio código
  (`pattern-events.ts:109-117`): contar retentativas já é o que
  `cycle_tracker` cobre, e contar isso aqui faria uma correção comum de
  2 ciclos parecer um padrão de projeto inteiro. `buildRecurrenceReport`
  sempre retorna as duas categorias separadas, com "rotina recorrente"
  deliberadamente vazia + limitação documentada em texto
  (`pattern-events.ts:156-177`) — nenhuma heurística de similaridade foi
  forçada pra preencher essa categoria.
- **7 testes unitários novos**
  (`packages/core/test/evolution/pattern-events.test.ts`), todos
  passando.
- **Wiring nos 3 pontos de evento, exatamente os 3 pedidos, nenhum
  quarto inventado:**
  - `packages/opencode/src/tool/review-checklist-write.ts`: grava um
    evento por critério reprovado; grava `recordTaskCompletion` e
    injeta `<recurrence_report_trigger>` no output quando o veredito é
    `approved` e o contador bate múltiplo de 10.
  - `packages/opencode/src/tool/baseline-audit-write.ts`: grava um
    evento por item reprovado.
  - `packages/opencode/src/tool/self-test-tracker.ts`: grava um evento
    (`category_id: "self_test_exhausted"`) no branch de escalação por
    esgotamento de autoteste.
- **`pattern-recurrence-read` (tool nova, opencode):** `.ts` + `.txt`,
  zero parâmetros (relatório é sempre do projeto inteiro), formata as
  duas categorias separadas, registrada em `registry.ts`.
- **`pattern-auditor` (agente nativo novo):** mantido o nome sugerido —
  documentado em `agent-architecture.md` que não houve motivo pra
  renomear. Registrado em `agent.ts` com o mesmo padrão de
  `baseline-auditor` (`mode: "subagent"`, `"*": "deny"` + `grep`/`glob`/
  `read`/`pattern_recurrence_read`/`external_directory`). `avaliador.txt`
  ganhou o passo 9: delegar via `task` pro `pattern-auditor` quando o
  output do passo 5 vier com `<recurrence_report_trigger>` — e
  `"pattern-auditor": "allow"` foi somado ao `task` allow-list do
  `avaliador`. O prompt do `pattern-auditor` cita explicitamente o
  princípio de `workflow-pipeline-v2.md` §8 e reforça: nunca chama
  `edit`/`write`/`apply_patch`/`task` pra delegar implementação, só
  relata.
- **Testes de integração e permissão novos:**
  `packages/opencode/test/workflow/pattern-events-wiring.test.ts` (4
  testes, cadeia completa de wiring) + 2 testes novos em
  `packages/opencode/test/agent/agent.test.ts` (`pattern-auditor`
  registrado read-only no mesmo formato de `baseline-auditor`; `avaliador`
  pode delegar pra `pattern-auditor` via `task`).

Nenhuma divergência do pedido original — a única decisão de
interpretação não trivial (contar tarefas distintas, não ciclos de
retentativa) está documentada no código e aqui, como o pedido exigia
("cite arquivo e linha pra toda afirmação").

---

## Tarefa 11 — Paralelismo real entre Briefs independentes

### Texto do pedido, na íntegra

> Confirmado por leitura de código que
> `packages/core/src/cluster/dispatcher.ts` (`ClusterDispatcher`, DAG
> via `depends_on`, `Promise.all` em Briefs prontos, 204 linhas) já
> existe, com teste próprio e zero callers em produção. Não recriar a
> classe — conectá-la, ou decidir explicitamente não usá-la se a
> investigação mostrar que o encaixe real é mais simples sem ela. Regra
> de divisão a somar em `analista.txt` (ao lado da instrução já existente
> de `depends_on`): um Brief é candidato a N sub-Briefs quando ≥2
> conjuntos de `files_expected_touched` não se sobrepõem E não há razão
> pra um esperar o outro (teste prático: "consigo mockar a ponta que
> falta pra este pedaço existir sozinho?" — exemplo model de login e
> tela de login em paralelo, integração depois). Teto de 4 sub-Briefs
> por tarefa original. Não dividir se o pedaço resultante tocaria menos
> de 1 arquivo relevante ou um único critério trivial. Decisão de
> arquitetura explicitamente em aberto pra quem implementar resolver
> (não supor): `ClusterDispatcher.executeAll()` recebe um parâmetro
> `executor: (brief, workerCtx) => Promise<boolean>`, desenhado pra ser
> chamado por código — mas o resto do XOCP não tem orquestrador
> determinístico (`workflow-pipeline-v2.md` §6.1). Duas rotas possíveis:
> (1) tool nova que o `analista` chama, usando internamente o `executor`
> do `ClusterDispatcher` pra disparar `task workflow-executor` — precisa
> CONFIRMAR primeiro se uma tool comum consegue disparar `task`, "esse é
> o tipo de suposição que já custou caro em tarefas anteriores"; (2) o
> próprio `analista` chama `task workflow-executor` várias vezes na
> mesma resposta pra Briefs prontos e independentes, mesmo padrão do
> bash paralelo já documentado em `tool/shell/prompt.ts`, com
> `ClusterDispatcher` ficando só como referência testada/validação de
> design. Se a rota 1 esbarrar numa limitação arquitetural real, ir pra
> rota 2 e documentar por que a classe ficou fora do caminho de
> execução — "isso é uma informação tão importante quanto a
> implementação em si."

### O que foi entregue

- **Investigação da decisão de arquitetura (antes de codar):**
  confirmado que `ctx.extra.promptOps` — o mecanismo que uma tool usa
  pra disparar `task` — é populado genericamente pra qualquer tool em
  `packages/opencode/src/session/tools.ts:64`, não é exclusivo de
  `task.ts` (`packages/opencode/src/tool/task.ts:197-198`). Ou seja: a
  suposição de que "só `task.ts` consegue disparar `task`" estava
  **errada** — uma tool nova poderia, tecnicamente, ter usado o
  `executor` do `ClusterDispatcher` internamente (rota 1). Confirmado
  isso por leitura de código real, não assumido — exatamente a checagem
  que o pedido pediu explicitamente antes de escolher rota.
- **Decisão: rota 2, apesar da rota 1 ser tecnicamente viável.** Motivo
  registrado em `agent-architecture.md` e no próprio `analista.txt`: (a)
  `ClusterDispatcher` exige `TechnicalBriefV2` (`files_scope`/
  `contracts`/`verification_gates`), schema diferente do Brief real que
  o Analista escreve (`files_expected_touched`/`constraints`/
  `acceptance_criteria`) — forçar o Brief real nesse formato só pra usar
  a classe seria duplicação de schema, contra a própria regra de
  `analista.txt:25-28` ("checar se já existe padrão similar... evita
  duplicação de lógica"); (b) o padrão de bash paralelo já documentado em
  `packages/opencode/src/tool/shell/prompt.ts:108,159,208` é exatamente
  o mesmo formato de solução (múltiplas chamadas independentes na mesma
  resposta), sem precisar de peça nova. `ClusterDispatcher` foi deixado
  intocado — sua própria suíte de teste
  (`packages/core/test/cluster/dispatcher.test.ts`) segue 2/2 passando
  sem nenhuma mudança, confirmando que ele continua como referência de
  design/teste de unidade, não peça viva do fluxo.
- **`packages/opencode/src/agent/prompt/analista.txt`**: novo passo 6
  ("REGRA DE DIVISÃO PARA PARALELISMO REAL") logo após o passo 5
  (`depends_on`) — teste do não-sobreposição + teste do mock, exemplo do
  login (model + tela em paralelo, integração depois com `depends_on`
  nos dois), teto de 4 sub-Briefs, exclusão de pedaço mínimo, instrução
  de delegar via `task` (uma chamada por sub-Brief pronto, mesma
  resposta) citando o precedente de `tool/shell/prompt.ts`, e a nota de
  arquitetura explicando por que `ClusterDispatcher` fica fora do fluxo
  de execução.
- **`packages/opencode/src/agent/agent.ts`**: `"workflow-executor":
  "allow"` somado ao `task` allow-list do `analista` — permissão nova
  necessária pra rota 2 funcionar (antes, `analista` só podia chamar
  `explore` via `task`).
- **Teste novo** em `packages/opencode/test/agent/agent.test.ts`
  ("Tarefa 11: analista can delegate to workflow-executor via task
  (parallel sub-Brief dispatch)").
- **`agent-architecture.md`** atualizado (seção 1.2 nova) com a decisão
  de arquitetura completa, incluindo por que a rota 1 — apesar de
  tecnicamente viável — não foi escolhida; e a observação 2 da seção 2 +
  achado 5.4 atualizados pra registrar que o gap de auto-delegação
  Analista→Executor foi fechado só para o caso de sub-Briefs paralelos,
  não pro Brief único sequencial (que continua manual).

Uma divergência real do pedido, documentada como o próprio pedido
exigia: o pedido enquadrava a escolha de rota como possivelmente forçada
por uma "limitação arquitetural real" na rota 1. Não foi isso que
aconteceu — a rota 1 se mostrou tecnicamente possível (`ctx.extra.promptOps`
não é exclusivo de `task.ts`). A rota 2 foi escolhida mesmo assim, por
constraint de schema (`TechnicalBriefV2` vs. Brief real) e por
consistência com um padrão já existente no projeto — motivo diferente do
antecipado no pedido, mas dentro do espírito da instrução original ("se
a rota 1 esbarrar numa limitação real, documentar por que a classe ficou
fora do caminho de execução" — aqui a "limitação" é de schema/duplicação,
não de mecanismo de disparo de `task`, e isso está registrado
explicitamente em vez de deixado implícito).

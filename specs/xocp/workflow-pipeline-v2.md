# XOCP — Workflow-Pipeline v2: agentes nativos + trilha de auditoria verificável

**Status: Fase 0 — design formalizado, aguardando implementação (Fases 1a–3).**

Substitui a confiança em prosa do v1 (`specs/xocp/workflow-pipeline.md`) por
mecanismo de código, na mesma migração que o Elicitador já recebeu (papel via
skill → agente nativo com permissão real).

**Documentos relacionados:**

| Documento | Papel |
|-----------|--------|
| `specs/xocp/workflow-pipeline.md` | v1 (piloto) — prosa, prompts, thresholds de triagem |
| `specs/xocp/elicitador-spec-system.md` | Fluxo Elicitador → Spec → Build → Review |
| `specs/xocp/workflow-pipeline-v2.md` | **Este documento** — mecanismos v2 |

---

## 0. Decisões fechadas (revisão Fase 0)

Estas decisões são normativas para Fases 1a–3. Não reabrir sem revisão explícita.

### 0.1 Brief e Spec — os dois fluxos, ferramentas unificadas

As ferramentas novas servem **explicitamente** aos dois fluxos:

| Fluxo | Contrato de trabalho | Onde vive |
|-------|----------------------|-----------|
| **Brief** (pipeline in-repo) | YAML versionado | `.opencode/briefs/<brief_id>.yaml` |
| **Spec** (pipeline Elicitador) | Markdown com frontmatter | `specs/<slug>.md` |

**Ferramentas compartilhadas** (ambos os fluxos):

- `task_approval_check` — gate antes do `workflow-executor` editar código
- `cycle_tracker`
- `execution_summary_write` / `execution_summary_read`
- `review_checklist_write` / `review_checklist_read`
- `spec_status_write` — transição de `status` no contrato (Spec ou Brief)

### 0.2 `task_id` — regra única

Todo artefato em `.opencode/reviews/<task_id>/` usa **um** identificador por tarefa:

```
Trabalho em Brief:  task_id = <brief_id>
                    (ex.: brief-rebrand-ui-01)

Trabalho em Spec:   task_id = spec:<slug>:G<N>
                    (ex.: spec:clinica-agenda:G1)
```

- `<brief_id>` — o campo `brief_id` do YAML do brief (v1, seção 4).
- `<slug>` — o slug do arquivo `specs/<slug>.md`.
- `G<N>` — número do item na tabela **Backlog (pós-v1)** da Spec
  (`elicitador-spec-system.md` §4). Quem adiciona um item novo usa o próximo
  número disponível **naquela tabela** — não existe contador separado. Uma única
  fonte de verdade: o `G<N>` do `task_id` é o mesmo `G<N>` da linha do Backlog.

**Nunca** misturar formatos numa mesma pasta de reviews.

### 0.3 `status` — Spec e Brief

Tanto Spec quanto Brief usam os **mesmos quatro valores** de `status`:

| Valor | Significado |
|-------|-------------|
| `rascunho` | Em elaboração; não pode ser implementado |
| `aguardando_aprovacao` | Pronto para revisão humana |
| `aprovada` | Humano aprovou; `workflow-executor` pode implementar após `task_approval_check` |
| `em_revisao` | Ciclo de implementação/revisão em andamento |

**Spec** — campo `status` no YAML frontmatter (`elicitador-spec-system.md` §4).

**Brief** — campo `status` no YAML do brief (`.opencode/briefs/<brief_id>.yaml`),
mesmos valores. O template do brief no v1 ganha este campo na migração Fase 2.

#### Ferramenta `spec_status_write` (Fase 1b)

Transiciona o `status` no disco — frontmatter YAML da Spec **ou** campo `status`
do YAML do Brief, conforme o `task_id`.

**Qualquer agente** pode chamar a ferramenta, mas a transição para `aprovada`
**não confia no agente alegar que o usuário confirmou**. Ao tentar
`new_status: aprovada`, a tool dispara uma confirmação real via mecanismo `ask`
do XOCP (prompt na interface — não é `allow`/`deny` estático de permissão de
arquivo). A pessoa precisa confirmar **na interface, na hora**, para a transição
se completar. Sem essa confirmação, o status no disco **não muda**.

Outras transições (ex.: `rascunho` → `aguardando_aprovacao`) prosseguem sem
`ask` — são rotina, não críticas.

O Elicitador **nunca** auto-aprova o próprio trabalho: mesmo podendo chamar a
tool, `aprovada` só se completa com confirmação UI real.

### 0.4 Nome do agente — `workflow-executor`

| ID interno | Nome de exibição |
|------------|------------------|
| `workflow-executor` | Executor |

Não usar `executor` como ID — colide com termos em Effect, LLM route e testes.

### 0.5 `.opencode/reviews/` — versionado no Git de cada projeto

- **Não** gitignored — o valor é auditoria no histórico do repositório.
- Vale para **qualquer projeto** construído com o XOCP através deste pipeline —
  não só o repositório do monorepo XOCP. Os artefatos versionam no Git **daquele
  projeto específico** do usuário.
- Diretório criado na **primeira escrita** de qualquer ferramenta de review.
- Layout: `.opencode/reviews/<task_id>/`

**Invariante do número de ciclo:** `cycle_tracker` é a **única fonte da verdade**
do ciclo atual. Tanto `execution-<N>.json` quanto `cycle-<N>.json` usam o valor
**atual** do contador após `cycle_tracker.increment` — as tools de escrita **não**
aceitam `N` passado manualmente no prompt; leem o contador no disco.

Artefatos por `task_id`:

| Arquivo | Quem escreve | Conteúdo |
|---------|--------------|----------|
| `cycle-count.txt` | `cycle_tracker` | Contador inteiro (fonte da verdade) |
| `execution-<N>.json` | `workflow-executor` | Resumo cumulativo da tentativa |
| `cycle-<N>.json` | `avaliador` | Checklist estruturado da revisão |

### 0.6 Ferramentas de leitura dedicadas

Espelham o padrão do Handoff (`handoff-read` / `latest`), mais determinístico que
`read` genérico no arquivo:

- `execution_summary_read(task_id)` — último (ou por ciclo) `execution-*.json`
- `review_checklist_read(task_id)` — último (ou por ciclo) `cycle-*.json`

### 0.7 Permissões dos quatro agentes nativos (Fase 2)

| Agente | Permissão |
|--------|-----------|
| `workflow-triador` | = `explore` (read-only) |
| `analista` | leitura + `edit` restrito a `.opencode/briefs/*.yaml` (mesmo molde do Elicitador em `.opencode/specs/*.md`) |
| `elicitador` | (permissão já existente) + `task: { workflow-executor: allow }` — **novo**, seção 6.1 |
| `workflow-executor` | = `build` restrito + ferramentas de pipeline (`task_approval_check`, `execution_summary_write`, `cycle_tracker`, `execution_summary_read`, `review_checklist_read`) + `task: { avaliador: allow }` — **novo**, seção 6.1; instrução de prompt: chamar `task_approval_check` antes de editar código — **limite honesto:** convenção reforçada por ferramenta, não bloqueio de permissão de arquivo no OS |
| `avaliador` | = `explore` + `review_checklist_write` + `execution_summary_read` + `review_checklist_read` + `task: { workflow-executor: allow }` |

O `build` genérico permanece para trabalho **fora** do pipeline formal.

**Nota sobre profundidade de delegação:** a cadeia completa é
`elicitador → workflow-executor → avaliador → workflow-executor (se
rejeitado) → ...` — sempre delegação de **um nível**, nunca um agente
delegado delega mais fundo por conta própria (mesmo princípio de
segurança usado por sistemas de agente hospedados profissionalmente:
depth 1 apenas).

### 0.8 Handoff (SQLite) vs review tools (JSON)

| | Handoff | Review tools |
|---|---------|--------------|
| Persistência | SQLite (`Handoff.write`) | JSON em `.opencode/reviews/` |
| Propósito | Continuidade efêmera entre sessões (≤2000 chars) | Trilha de auditoria legível por humano |
| Versionamento Git | Não é o objetivo | **Sim** — commits mostram o que foi checado |
| Leitura posterior | Agente na mesma instância/projeto | Humano, futuras sessões, CI de transcript |

Handoff responde "o que rolou na última sessão". Review tools respondem "o que foi
implementado, o que foi verificado, e com qual evidência".

---

## 1. Os dois buracos que o v2 fecha

1. **Nada impede pular direto pro `build`** sem Elicitador/Spec/aprovação ou sem
   pipeline Brief — hoje é convenção, não trava. O agente `workflow-executor`
   separado + `task_approval_check` reduzem esse risco nos fluxos Brief e Spec.
2. **O veredito do Avaliador não deixa rastro verificável** — hoje é só prosa.
   `review_checklist_write` + arquivos JSON versionados substituem "confiamos que
   ele fez" por "existe arquivo que prova".

---

## 2. Agentes nativos (promoção do v1)

| Agente | v1 | v2 |
|--------|----|----|
| `workflow-triador` | Papel via skill sobre `explore` | Agente nativo, permissão = `explore` |
| `analista` | Papel via skill sobre `explore` | Agente nativo, read + `edit` só em `.opencode/briefs/*.yaml` |
| `workflow-executor` | Literalmente `build` + prompt extra | Agente nativo **separado** do `build` |
| `avaliador` | Papel via skill sobre `explore` | Agente nativo, read + `review_checklist_write` + delegação ao `workflow-executor` |

**Por que `workflow-executor` separado do `build`:** permite recusar trabalho não
aprovado e obrigar trilha de auditoria **sem** afetar uso livre do produto via
`build`.

### 2.1 Build Sheet — formato rígido do que o Analista entrega

O Brief do Analista não é prosa livre — campos fixos, cada um objetivo,
sem espaço pra "encher" com texto. Mesmo princípio da Spec (DoD rígido,
`elicitador-spec-system.md`): estrutura em vez de narrativa.

```yaml
task_id: <brief_id>
status: rascunho | aguardando_aprovacao | aprovada | em_revisao
objetivo: <uma frase, direto>
dod_refs: [D1, D3, D7]   # IDs do DoD da Spec associada que este Brief
                         # endereça — vazio/omitido se for trabalho
                         # sem Spec formal por trás
arquivos:
  - <caminho exato a criar/modificar>
passos:
  1. <passo numerado, objetivo>
comando_verificacao:
  - <comando exato que prova que funcionou — não "rodar os testes",
    o comando literal>
adiado_para_depois:
  - <item explicitamente fora de escopo deste ciclo, não esquecido,
    só adiado>
```

**Regra cardeal:** se o Analista não souber preencher um campo com
precisão (ex.: não confirmou o caminho exato de um arquivo), o campo
fica `"NÃO LOCALIZADO — confirmar antes de prosseguir"` — nunca um
chute disfarçado de resposta.

---

## 3. Trava de aprovação — `task_approval_check`

### `task_approval_check(task_id: string)`

Exclusiva do `workflow-executor`. **Brief e Spec** usam a mesma tool.

1. Resolve o arquivo pelo formato do `task_id`:
   - `spec:<slug>:G<N>` → `specs/<slug>.md` (ou `.opencode/specs/<slug>.md` se existir)
   - `<brief_id>` → `.opencode/briefs/<brief_id>.yaml`
2. Lê o arquivo real no disco (parse do frontmatter YAML da Spec ou do YAML do Brief).
3. Se `status !== "aprovada"`: erro claro, recusa prosseguir.
4. Se `status === "aprovada"`: retorna conteúdo parseado para o executor trabalhar.

**Limite honesto:** depende do `workflow-executor` **chamar** a tool antes de
editar — não é bloqueio de permissão por conteúdo de arquivo. Redução de risco
significativa, não garantia absoluta (igual qualquer instrução de agente).

---

## 4. Trilha de auditoria (ambos os fluxos)

### 4.1 `execution_summary_write` (`workflow-executor`)

Chamada ao **final** de cada tentativa do executor, antes do Avaliador.

```typescript
execution_summary_write({
  task_id: string,
  completed: Array<{
    item: string,
    evidence: string,
    dod_id?: string,           // referencia o ID do DoD da Spec (D1, D2...)
                                // que este item satisfaz — omitido se for
                                // trabalho sem Spec formal (Brief puro)
    external_source?: string,  // URL, só se a conclusão veio de fonte externa
                                // (web, documentação de terceiro) — não confunda
                                // com evidência verificada no próprio código/teste
  }>,
  // CUMULATIVO — estado completo atual do projeto, não só o delta desta rodada
  incomplete: Array<{
    item: string,
    reason: string,
    category: "duvida_humana" | "correcao_manual_necessaria",
  }>,
  status: "complete" | "incomplete",
})
```

- Grava `.opencode/reviews/<task_id>/execution-<N>.json` com `N` do `cycle_tracker`.
- Se `incomplete.length > 0`, a tool **rejeita** `status: "complete"` (validação
  na tool, não confia no agente).
- Quando `external_source` está presente num item de `completed`, o Avaliador
  (§4.3) **não** trata como verificado internamente só por estar ali — precisa
  confirmar de forma independente (rodar teste, ler o código real) antes de
  considerar o item coberto. Evita que informação não confiável de uma busca
  externa contamine o registro como se fosse fato confirmado internamente.

### 4.2 `execution_summary_read(task_id)`

Retorna o resumo de execução mais recente (ou de ciclo específico, se a API da
tool expuser parâmetro opcional). Usada pelo `avaliador` e pelo `workflow-executor`
(no passo 2 do fluxo §6).

### 4.3 Papel do Avaliador ao ler o resumo

- Se `status: "incomplete"` → **não aprova**, mesmo que o código pareça ok.
- Se `status: "complete"` → **não basta** para aprovar — é só ponto de partida.
  O Avaliador **sempre** audita código, diff, testes e critérios do Brief/Spec.

Aprovar só repetindo o Executor, sem checagem independente, é **falha do Avaliador**.

**Ordem de consulta, quando há Spec associada (DoD rígido disponível):**

1. Para cada item de `completed` com `dod_id` preenchido, compare **direto**
   contra a linha correspondente (`D<N>`) do DoD da Spec — comparação
   tabela-contra-tabela, não reinterpretação de prosa.
2. Só releia a **Spec inteira** quando o DoD sozinho não resolver a dúvida
   (ex.: `dod_id` ausente, ou o critério da linha do DoD for ambíguo demais
   pra decidir sozinho) — não é passo de rotina, é exceção.
3. Independente do que o DoD/Spec disserem, a verificação real (rodar teste,
   ler código) continua obrigatória — o DoD acelera **onde procurar**, nunca
   substitui **checar de verdade**.

### 4.4 `review_checklist_write` (`avaliador`)

Único jeito "oficial" de fechar uma revisão:

```typescript
review_checklist_write({
  task_id: string,
  gates: {
    spec_updated?: "pass" | "fail",           // só quando há Spec associada
    norm_sources_verified?: "pass" | "fail",  // só quando há Spec associada
    execution_summary_complete: "pass" | "fail",
  },
  criteria: Array<{
    id: string,       // AC do brief ou DoD da spec
    status: "pass" | "fail",
    evidence: string,
  }>,
  verdict: "approved" | "rejected" | "failed",
  timestamp: string,  // ISO 8601, preenchido pela tool se omitido
})
```

Grava `.opencode/reviews/<task_id>/cycle-<N>.json`.

**`verdict: "failed"`** é distinto de `"rejected"`: `"rejected"` significa que o
código não atende a um critério correto — volta pro Executor corrigir (§4.7).
`"failed"` significa que o **critério do Brief/Spec em si** está incoerente,
contraditório, ou impossível de verificar como está escrito — o problema não é
a implementação, é a própria especificação. Tentar de novo não resolve
critério ruim: `"failed"` nunca delega de volta ao Executor, escala direto pro
humano (§4.8) mesmo que `cycle_tracker` ainda não tenha passado de 3.

**Gates opcionais:** em tarefa **Brief sem Spec associada**, `spec_updated` e
`norm_sources_verified` ficam **ausentes** do JSON — não `"pass"` forçado com
evidence vazia. Aprovação vazia disfarçada de gate cumprido é proibida. A tool
valida na escrita: Brief puro não pode incluir esses campos; fluxo Spec deve
incluí-los.

### 4.5 `review_checklist_read(task_id)`

Usada pelo `workflow-executor` no início do ciclo para carregar reprovações
anteriores (`verdict: "rejected"`) sem relato manual do humano.

### 4.6 Por que ferramenta dedicada (não checklist na resposta)

Schema fixo → testes de transcript determinísticos (mesmo padrão do bug "Spec
nunca salva" / `handoff_write`).

### 4.7 Quem dispara o próximo ciclo

Avaliador com `verdict: "rejected"` e ciclo ≤ 3 delega ao `workflow-executor` via
`task` (`task: { workflow-executor: allow }`). Seguro porque `cycle_tracker`
impede a 4ª tentativa autônoma. `verdict: "failed"` **nunca** delega, em
nenhum ciclo — vai direto pra §4.8.

### 4.8 Escalação pro humano

Quando `cycle_tracker` > 3, **ou** `execution_summary_write` reporta
`correcao_manual_necessaria` (mesmo no ciclo 1), **ou** `verdict: "failed"`
(mesmo no ciclo 1 — critério ruim não se resolve tentando de novo):

1. **ONDE parou:** ciclo exato, ID do critério (Brief/Spec) que falha
2. **POR QUE parou:** `reason` completo, sem resumir — para `"failed"`, o
   motivo específico pelo qual o critério, como escrito, é incoerente,
   contraditório ou impossível de verificar
3. **O QUE fazer:** categorizado (`duvida_humana` | `correcao_manual_necessaria`)
   — para `"failed"`, o humano decide entre reescrever o critério (Analista
   atualiza o Brief/Spec) ou confirmar que a leitura do Avaliador estava certa

---

## 5. Contagem de ciclo — `cycle_tracker`

```
cycle_tracker.increment(task_id: string):
  1. Lê .opencode/reviews/<task_id>/cycle-count.txt (cria com 0 se ausente)
  2. Incrementa, grava
  3. Se novo valor > 3: erro "limite de ciclos atingido, escale pra humano"
  4. Retorna o novo N (usado pelas tools de escrita deste ciclo)
```

Chamado pelo `workflow-executor` no **início** de cada tentativa. Sobrevive a
compressão de contexto e sessões novas.

---

## 6. Fluxo completo, ciclo a ciclo

Válido para **Brief** e **Spec** (mesmo fluxo; `task_approval_check` resolve o
contrato pelo `task_id`).

```
INÍCIO DO CICLO N (N = 1, 2 ou 3):

0. workflow-executor chama task_approval_check(task_id)
   → se status !== aprovada: PARA antes de editar código

1. workflow-executor chama cycle_tracker.increment(task_id)
   → se > 3: PARA, escala (§4.8)

2. workflow-executor chama review_checklist_read(task_id)
   → se último cycle-<M>.json tem verdict: "rejected":
        itens criteria com status "fail" viram lista de trabalho deste ciclo
   → se 1º ciclo: trabalha a partir do Brief/Spec normal

3. workflow-executor implementa, chama execution_summary_write

4. avaliador:
   a. execution_summary_read — se incomplete, tendência a reprovar, mas audita o que existe
   b. Audita código, testes, diff — nunca só o resumo do executor
   c. Gates (spec/norma quando há Spec associada; ausentes em Brief puro)
   d. review_checklist_write

5. Resultado:
   - approved → resumo legível pro humano; FIM da tarefa
   - rejected → avaliador delega task workflow-executor → volta ao passo 1 (N+1)
```

---

### 6.1 Automação de ponta a ponta — sem seleção manual de agente

**Motivação, achada em uso real:** pedir pro usuário escolher entre
`elicitador`/`workflow-executor`/`avaliador` num seletor é fricção sem
valor de segurança — a pessoa não tem por que saber esses nomes
existem. A troca de "quem trabalha agora" deve ser **automática**, por
delegação (`task`) — o julgamento humano só entra nos pontos que
genuinamente precisam dele.

**Os únicos três momentos que envolvem o humano, no fluxo inteiro:**

```
1. Aprovar a Spec/Brief — já existe, confirmação real via `ask`
   (spec_status_write, seção 3)
2. Ler o resumo final quando o Avaliador aprova — não exige ação,
   só leitura
3. Responder a uma escalação — limite de ciclo atingido (§4.8), ou
   verdict "failed" (critério incoerente, não é erro de código)
```

**Tudo o mais é automático:**

```
1. spec_status_write confirma "aprovada" (passo 1 já existente)
   → elicitador, na mesma resposta, delega via `task` pro
     workflow-executor, passando o task_id (spec:<slug> pra entrega
     inicial, ou spec:<slug>:G<N> pra item específico do backlog)

2. workflow-executor completa o ciclo normal (seção 6, passos 0-3)
   → ao terminar execution_summary_write, delega via `task` pro
     avaliador automaticamente — não espera humano selecionar

3. avaliador revisa (seção 6, passo 4)
   → approved: resumo legível pro humano, FIM — sem exigir ação
   → rejected (dentro do limite): já delegava de volta pro
     workflow-executor (comportamento já existente, seção 4.7) —
     agora simétrico com os passos 1-2 acima
   → failed ou limite de ciclo: escala pro humano (único ponto de
     parada além da aprovação inicial)
```

**O seletor de agente continua existindo, não é removido** — fica
disponível pra quem quiser intervir manualmente (depuração, ou domínio
técnico avançado que prefere controlar cada passo). A diferença é que,
no fluxo **normal**, ninguém precisa tocar nele nunca.

**Limite honesto, mesmo princípio da seção 3:** isso ainda depende de
cada agente **chamar** a delegação corretamente, conforme instruído no
próprio prompt — não é um orquestrador externo, determinístico, forçando
a sequência. Reduz drasticamente a fricção; não é impossível de um
agente pular a delegação se ignorar a própria instrução (mesma
limitação já documentada em todo o resto deste sistema).

## 7. O que o v2 NÃO resolve

- Agentes podem ignorar instruções e pular tools — redução de risco, não garantia.
- Humanos podem editar código fora do pipeline — fora de escopo.
- Melhoria: prova durável no Git vs. só prosa de conversa.

---

## 8. Aprendizado contínuo

Falhas reais em uso viram linha "Calibração real" neste documento (mesmo padrão S2
do v1). O sistema "aprende" via spec mais afiada, não via modelo mudando sozinho.

---

## 9. Faseamento (orientação para prompts futuros)

| Fase | Entregável | Escopo |
|------|------------|--------|
| **0** | Este documento + `status` no frontmatter do `elicitador-spec-system.md` | Só documentação |
| **1a** | `task_approval_check`, `execution_summary_write`, `execution_summary_read`, `review_checklist_write`, `review_checklist_read`, `cycle_tracker` | Validação na tool, **sem** agentes nativos, **sem** `ask` |
| **1b** | `spec_status_write` | Integração com `ask` para `aprovada`; PR separado da 1a (perfil de risco diferente) |
| **2** | 4 agentes nativos + prompts migrados do v1 | **Não** misturar com Fase 1 no mesmo PR |
| **3** | Testes de transcript determinísticos + piloto real com humano | Mesmo padrão do `workflow-pipeline-phase0-report.md` |

**Fase 1a — inventário:**

| Tool | Tipo |
|------|------|
| `task_approval_check` | leitura/validação |
| `cycle_tracker` | escrita |
| `execution_summary_write` | escrita |
| `review_checklist_write` | escrita |
| `execution_summary_read` | leitura |
| `review_checklist_read` | leitura |

**Fase 1b — inventário:**

| Tool | Tipo |
|------|------|
| `spec_status_write` | escrita (`ask` obrigatório para `aprovada`) |

---

## 10. Relação com o v1

- Thresholds de triagem (S1–S4), templates de prompt do Triador/Analista e
  template YAML do Brief **permanecem** no v1 até migração explícita na Fase 2.
- O v1 continua válido como piloto histórico; novos trabalhos formais devem
  seguir o v2 após Fase 2 estar implementada.
- O template YAML do Brief no v1 ganha campo `status` na migração Fase 2 (valores
  em §0.3).

---

## 11. Ambiguidades abertas

Nenhuma pendente das seis decisões fechadas na revisão pós-Fase 0 (G\<N\>,
gate Brief, gates opcionais, `ask` em `spec_status_write`, escopo de
`.opencode/reviews/`, faseamento 1a/1b). Novas ambiguidades devem ser
registradas aqui antes da implementação — não inventar comportamento silencioso.

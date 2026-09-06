# XOCP — Workflow-Pipeline v2: agentes nativos + trilha de auditoria verificável

**Status: Fase 0 — design formalizado, aguardando implementação (Fases 1–3).**

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

Estas decisões são normativas para Fases 1–3. Não reabrir sem revisão explícita.

### 0.1 Brief e Spec — os dois fluxos, ferramentas unificadas

As ferramentas novas servem **explicitamente** aos dois fluxos:

| Fluxo | Contrato de trabalho | Onde vive |
|-------|----------------------|-----------|
| **Brief** (pipeline in-repo) | YAML versionado | `.opencode/briefs/<brief_id>.yaml` |
| **Spec** (pipeline Elicitador) | Markdown com frontmatter | `specs/<slug>.md` |

**Ferramentas compartilhadas** (ambos os fluxos):

- `cycle_tracker`
- `execution_summary_write` / `execution_summary_read`
- `review_checklist_write` / `review_checklist_read`

**Ferramentas específicas do fluxo Spec:**

- `spec_approval_check` — gate antes do `workflow-executor` editar código contra uma Spec
- `spec_status_write` — transição de `status` no frontmatter YAML da Spec (só após confirmação humana)

O fluxo Brief **não** usa `spec_approval_check` nem `spec_status_write`. O gate de
partida do Brief é a existência de um brief válido em `.opencode/briefs/` (ver
ambiguidade §11 sobre gate formal de aprovação do Brief).

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
- `G<N>` — número de geração da Spec (incremento quando o Elicitador publica uma
  revisão major do contrato; ver ambiguidade §11).

**Nunca** misturar formatos numa mesma pasta de reviews.

### 0.3 `status` da Spec — YAML frontmatter

Toda Spec gerada pelo Elicitador usa **YAML frontmatter** (não campo solto no corpo).
Valores permitidos de `status`:

| Valor | Significado |
|-------|-------------|
| `rascunho` | Em elaboração; não pode ser implementada |
| `aguardando_aprovacao` | Pronta para revisão humana |
| `aprovada` | Humano aprovou; `workflow-executor` pode implementar após `spec_approval_check` |
| `em_revisao` | Ciclo de implementação/revisão em andamento |

Esqueleto atualizado em `elicitador-spec-system.md` §4.

#### Ferramenta `spec_status_write` (Fase 1)

Transiciona o `status` no frontmatter YAML da Spec no disco.

**Regra de ouro:** nenhum agente chama esta ferramenta por iniciativa própria.
Só em reação a **confirmação humana explícita e inequívoca** na conversa (ex.:
"aprovado", "pode seguir", "está aprovada"). O Elicitador **nunca** auto-aprova o
próprio trabalho.

Implementação futura deve validar na tool que a transição é permitida (ex.:
`rascunho` → `aguardando_aprovacao` pelo Elicitador; `aguardando_aprovacao` →
`aprovada` só após sinal humano registrado no turno).

### 0.4 Nome do agente — `workflow-executor`

| ID interno | Nome de exibição |
|------------|------------------|
| `workflow-executor` | Executor |

Não usar `executor` como ID — colide com termos em Effect, LLM route e testes.

### 0.5 `.opencode/reviews/` — versionado no Git

- **Não** gitignored — o valor é auditoria no histórico do repositório.
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
| `workflow-executor` | = `build` restrito + ferramentas de pipeline (`spec_approval_check`, `execution_summary_write`, `cycle_tracker`, `execution_summary_read`, `review_checklist_read`); instrução de prompt: chamar `spec_approval_check` antes de editar código em trabalho Spec — **limite honesto:** convenção reforçada por ferramenta, não bloqueio de permissão de arquivo no OS |
| `avaliador` | = `explore` + `review_checklist_write` + `execution_summary_read` + `review_checklist_read` + `task: { workflow-executor: allow }` |

O `build` genérico permanece para trabalho **fora** do pipeline formal.

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
   separado + `spec_approval_check` reduzem esse risco no fluxo Spec.
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

**Por que `workflow-executor` separado do `build`:** permite recusar trabalho Spec
não aprovada e obrigar trilha de auditoria **sem** afetar uso livre do produto via
`build`.

---

## 3. Trava de aprovação (fluxo Spec)

### `spec_approval_check(spec_path: string)`

Exclusiva do `workflow-executor`. Fluxo Brief **não** usa esta tool.

1. Lê o arquivo real `specs/<slug>.md` no disco (parse do frontmatter YAML).
2. Se `status !== "aprovada"`: erro claro, recusa prosseguir.
3. Se `status === "aprovada"`: retorna conteúdo parseado para o executor trabalhar.

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
  completed: Array<{ item: string, evidence: string }>,
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

### 4.2 `execution_summary_read(task_id)`

Retorna o resumo de execução mais recente (ou de ciclo específico, se a API da
tool expuser parâmetro opcional). Usada pelo `avaliador` e pelo `workflow-executor`
(no passo 2 do fluxo §6).

### 4.3 Papel do Avaliador ao ler o resumo

- Se `status: "incomplete"` → **não aprova**, mesmo que o código pareça ok.
- Se `status: "complete"` → **não basta** para aprovar — é só ponto de partida.
  O Avaliador **sempre** audita código, diff, testes e critérios do Brief/Spec.

Aprovar só repetindo o Executor, sem checagem independente, é **falha do Avaliador**.

### 4.4 `review_checklist_write` (`avaliador`)

Único jeito "oficial" de fechar uma revisão:

```typescript
review_checklist_write({
  task_id: string,
  gates: {
    spec_updated: "pass" | "fail",           // relevante no fluxo Spec
    norm_sources_verified: "pass" | "fail",  // fluxo Spec (elicitador-spec §3.5)
    execution_summary_complete: "pass" | "fail",
  },
  criteria: Array<{
    id: string,       // AC do brief ou DoD da spec
    status: "pass" | "fail",
    evidence: string,
  }>,
  verdict: "approved" | "rejected",
  timestamp: string,  // ISO 8601, preenchido pela tool se omitido
})
```

Grava `.opencode/reviews/<task_id>/cycle-<N>.json`.

No fluxo **Brief**, `spec_updated` e `norm_sources_verified` podem ser `pass` por
N/A documentado na `evidence`, ou omitidos do schema na implementação — ver
ambiguidade §11.

### 4.5 `review_checklist_read(task_id)`

Usada pelo `workflow-executor` no início do ciclo para carregar reprovações
anteriores (`verdict: "rejected"`) sem relato manual do humano.

### 4.6 Por que ferramenta dedicada (não checklist na resposta)

Schema fixo → testes de transcript determinísticos (mesmo padrão do bug "Spec
nunca salva" / `handoff_write`).

### 4.7 Quem dispara o próximo ciclo

Avaliador com `verdict: "rejected"` e ciclo ≤ 3 delega ao `workflow-executor` via
`task` (`task: { workflow-executor: allow }`). Seguro porque `cycle_tracker`
impede a 4ª tentativa autônoma.

### 4.8 Escalação pro humano

Quando `cycle_tracker` > 3 **ou** `execution_summary_write` reporta
`correcao_manual_necessaria` (mesmo no ciclo 1):

1. **ONDE parou:** ciclo exato, ID do critério (Brief/Spec) que falha
2. **POR QUE parou:** `reason` completo, sem resumir
3. **O QUE fazer:** categorizado (`duvida_humana` | `correcao_manual_necessaria`)

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

Válido para **Brief** e **Spec** (diferem só no contrato de entrada e em
`spec_approval_check` no fluxo Spec).

```
INÍCIO DO CICLO N (N = 1, 2 ou 3):

0. [Somente fluxo Spec] workflow-executor chama spec_approval_check(spec_path)
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
   c. Gates (spec/norma quando aplicável)
   d. review_checklist_write

5. Resultado:
   - approved → resumo legível pro humano; FIM da tarefa
   - rejected → avaliador delega task workflow-executor → volta ao passo 1 (N+1)
```

---

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
| **1** | 4 tools de escrita + 2 de leitura (validação na tool), **sem** agentes nativos | Ver inventário abaixo; `spec_status_write` documentada aqui — ver §11.5 sobre contagem |
| **2** | 4 agentes nativos + prompts migrados do v1 | **Não** misturar com Fase 1 no mesmo PR |
| **3** | Testes de transcript determinísticos + piloto real com humano | Mesmo padrão do `workflow-pipeline-phase0-report.md` |

**Fase 1 — núcleo 4+2 (roadmap):**

| Tool | Tipo |
|------|------|
| `cycle_tracker` | escrita |
| `execution_summary_write` | escrita |
| `review_checklist_write` | escrita |
| `spec_approval_check` | escrita/leitura |
| `execution_summary_read` | leitura |
| `review_checklist_read` | leitura |

**Também Fase 1 (documentada, contagem separada):** `spec_status_write` — transição de
`status` no frontmatter da Spec.

---

## 10. Relação com o v1

- Thresholds de triagem (S1–S4), templates de prompt do Triador/Analista e
  template YAML do Brief **permanecem** no v1 até migração explícita na Fase 2.
- O v1 continua válido como piloto histórico; novos trabalhos formais devem
  seguir o v2 após Fase 2 estar implementada.

---

## 11. Ambiguidades abertas (não resolvidas nesta Fase 0)

Registradas para decisão antes ou durante Fase 1 — **não inventar implementação
silenciosa:**

1. **`G<N>` em `spec:<slug>:G<N>`** — quem incrementa `N`? Elicitador a cada
   changelog major? Automático em `spec_status_write`?
2. **Gate de aprovação do Brief** — o fluxo Brief não tem `brief_approval_check`
   nem `status` no YAML do brief definido aqui. Basta existir o arquivo? Precisa
   campo `status` paralelo ao da Spec?
3. **Gates `spec_updated` / `norm_sources_verified` no fluxo Brief** — sempre
   `pass` com evidence `N/A`, ou campos opcionais no schema?
4. **`spec_status_write` — quem pode chamar** — só Elicitador, ou qualquer agente
   após detectar frase humana de aprovação? Como a tool valida "confirmação
   explícita" vs. alucinação?
5. **Commitar `.opencode/reviews/`** — em todos os repos de usuário ou só em
   monorepos XOCP? Política de `.gitignore` global do produto pode conflitar com
   §0.5.
6. **Contagem Fase 1 (4+2 vs 7 tools)** — `spec_status_write` entra no mesmo PR
   da Fase 1 ou PR separado? O roadmap diz 4 escritas + 2 leituras; este documento
   lista 6 do núcleo + `spec_status_write` adicional.

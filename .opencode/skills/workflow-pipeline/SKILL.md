# Workflow Pipeline (XOCP v1 piloto)

Orquestra tarefas complexas com triagem conservadora, brief estruturado,
execução restrita e avaliação objetiva. **Default: maioria das tarefas NÃO
usa este pipeline.**

Fonte completa: `specs/xocp/workflow-pipeline.md`

## Quando usar

1. Rode **workflow-triador** (`task` + `explore` + prompt seção 2 da spec).
2. Se `FLUXO_NORMAL` → `task` + `build` direto. Pare aqui.
3. Se `DIVIDIR` → siga o pipeline abaixo.

## Papéis (nunca misturar)

| Papel | Agente | Pode escrever código? |
|-------|--------|------------------------|
| Triador | `explore` | Não |
| Analista | `explore` | Não — só emite YAML na resposta |
| Executor | `build` | Sim — só dentro do brief |
| Avaliador | `explore` | Não |

**Analista não grava arquivos.** Orquestrador grava brief em
`.opencode/briefs/<brief_id>.yaml`.

## Triagem (≥2 de 4 sinais → DIVIDIR)

- S1: ≥3 superfícies (frontend, API, DB, infra, docs)
- S2: ≥3 critérios de aceite independentes **de natureza distinta** (N repetições mecânicas do mesmo tipo = 1 critério composto)
- S3: ≥8 arquivos em ≥2 diretórios não-adjacentes
- S4: ≥2 fases sequenciais genuínas

Na dúvida: sinal inativo → não divide.

## Fluxo por ramo

```
Analista → brief YAML → Executor → Avaliador
                ↑ clarification (máx 2 rodadas)
Executor ←── REPROVADO (máx 3 tentativas, detectar estagnação)
```

## Gates de aprovação (todos binários, 100%)

**Quando há Spec no projeto** (sistema `elicitador-spec`), o Avaliador
checa **antes** de qualquer critério de brief/aceite:

1. **GATE Spec atualizada** — Changelog + DoD refletem o que foi implementado
2. **GATE Norma com fonte** — toda lei/norma tem URL oficial ou `⚠️ NÃO VERIFICADO`

Depois, os gates normais do brief:

- `cd packages/<pacote> && bun typecheck` (nunca da raiz)
- Testes do brief passando
- Escopo respeitado (`scope.excluded` intocado)
- Zero `constraints` violadas
- Todos os `acceptance_criteria` atendidos

Sem "aprovado com ressalva".

## Paralelismo

`task` com `background: true` exige
`OPENCODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS=true`. Sem flag: ramos
sequenciais.

## Integração

Pipeline valida cada ramo isolado. Após todos APROVADOS: smoke test
manual ou brief de integração separado.

## Limitação v1

Não automatizado em código — uso manual via `task`. Validar com tarefas
reais do XOCP antes de implementar orquestrador.

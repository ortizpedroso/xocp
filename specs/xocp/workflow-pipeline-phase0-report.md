# Fase 0 — Relatório do piloto Workflow Pipeline

**Tarefa:** Rebrand superfície OpenCode → XOCP (4 locais, PR #23)  
**Data:** 2026-09-01  
**Pipeline:** `specs/xocp/workflow-pipeline.md` v1 (branch `cursor/workflow-pipeline-889b`, PR #26)

## 1. Decisão do workflow-triador

```yaml
triagem:
  decisao: DIVIDIR
  sinais:
    S1: { ativo: true, justificativa: "3 superfícies — web PWA, TUI, CLI splash" }
    S2: { ativo: true, justificativa: "4 critérios independentes (grep por local)" }
    S3: { ativo: false, justificativa: "4 arquivos, abaixo de 8" }
    S4: { ativo: false, justificativa: "sem dependência sequencial" }
  sinais_ativos: 2
  estimativa_de_ramos: 1
```

**Interpretação:** Triador aplicou regras literalmente — S1+S2 atingiram ≥2. Para tarefa mecânica de 4 strings, isso é provável **falso positivo de triagem** (overhead de 3 papéis vs. fluxo direto). Calibrar: S2 com 4 AC triviais do mesmo tipo talvez não deveria contar como “independentes” no sentido de divisão.

## 2. Brief suficiente?

**Sim.** Um brief (`brief-rebrand-surface-01`), 4 AC, zero `clarification_request`.  
Executor não precisou perguntar ao analista.

**Aprendizado:** Analista deveria documentar que `packages/app/public/site.webmanifest` é symlink para `packages/ui/src/assets/favicon/site.webmanifest` — o diff git surpreende quem só lê o path do brief.

## 3. Avaliador pegou algo que o executor “achava” certo?

**Não houve divergência de veredito** (1 tentativa, APROVADO).  
Avaliador registrou nota sobre o symlink — dado útil para briefs futuros, não bloqueio.

Sem etapa avaliadora separada, o executor provavelmente também teria acertado (tarefa trivial). **Valor do avaliador neste piloto: baixo** — esperado para rebrand mecânico.

## 4. Tempo

| Etapa | Duração estimada |
|-------|------------------|
| Triagem (read-only) | ~5 min |
| Analista (brief YAML) | ~10 min |
| Executor (4 edits) | ~5 min |
| Avaliador (grep + typecheck) | ~5 min |
| **Total pipeline** | **~25 min** |
| Estimativa sem pipeline | **~10 min** (build direto + grep) |

**Conclusão tempo:** Pipeline custou ~2,5× para esta tarefa — confirma que triagem deveria ter devolvido `FLUXO_NORMAL`.

## Recomendações pós-piloto

1. Refinar S2: critérios do mesmo tipo (N substituições de string) contam como **1 critério composto**, não N independentes.
2. Manter S1 estrito: web + TUI + CLI podem ser 3 superfícies, mas tarefa homogênea ainda pode ser 1 ramo (ok).
3. Próximo piloto: tarefa **média** (ex.: skill nova + testes) onde avaliador tenha chance real de pegar erro.

# 🚀 XOCP — Guia Rápido (QUICKSTART)

> O XOCP é um sistema de orquestração cognitiva multi-agente baseado na
> **Arquitetura de Contratos Aninhados**: cada nível valida o anterior.

---

## 1. Instalação

```bash
git clone https://github.com/ortizpedroso/xocp.git
cd xocp
bun install
```

Requisitos: [Bun](https://bun.sh) ≥ 1.1, Git.

## 2. Primeiros passos

```bash
# Iniciar a interface web (com menu lateral persistente)
bun run dev web

# Rodar os testes da arquitetura
bun test ./test/prompts-mirror.test.ts        # espelhamento V1/V2
bun test ./test/governance/skip-audit.test.ts # skip auditável
bun test ./test/e2e/pipeline-integration.test.ts # ciclo completo E2E

# Verificação de governança manual
bun run governance:check

# Limpeza de artefatos de runtime (não versionados)
bun run governance:cleanup
```

## 3. O fluxo de trabalho (contratos aninhados)

```
Analista ──Brief──▶ Executor ──Resumo──▶ Avaliador (Dual-Lens)
   ▲                                          │
   └──────────── escalação L1/L2/L3 ◀─────────┘
```

1. **Analista** cria um Brief a partir do template do cluster em
   `specs/xocp/templates/brief-<cluster>-template.md`
   (clusters: `backend`, `frontend`, `core`, `integration`).
   Todo critério recebe um `id` único (C1, C2, …).
2. **Executor** implementa e preenche o resumo em
   `specs/xocp/templates/executor-<cluster>-template.md`.
   ⚠️ **Regra crítica:** `criteria.id` do Brief DEVE aparecer como
   `criteria_met.id` no resumo — sem exceções.
3. **Avaliador** segue as **3 Travas**:
   - **TRAVA 1** — valida o Brief (frontmatter, template, IDs);
   - **TRAVA 2** — Dual-Lens independente: Lente 1 (Evidência: brief →
     código → testes) e Lente 2 (Impacto: regressões, segurança, contratos).
     *O resumo do Executor NÃO pode ser lido antes disso*;
   - **TRAVA 3** — confronto final: o que o Executor *diz* × o que o
     Avaliador *encontrou*.
4. **State Snapshot** (`packages/core/src/state/snapshot.ts`) persiste o
   estado a cada ciclo em `.opencode/state/current.json`, permitindo retomar
   após crash ou escalação humana.
5. **Escalação** (`packages/core/src/escalation/classification.ts`):
   | Nível | Gatilho objetivo | Quem age |
   |-------|------------------|----------|
   | L1_LOCAL_ADJUST | ≤2 critérios falhando, 0 contratos quebrados | Executor retoma com contexto |
   | L2_REPLANNING | 3–5 critérios OU 1 contrato quebrado OU >1 cluster | Analista ajusta Briefs afetados |
   | L3_REDIRECTION | >5 critérios OU >1 contrato OU hipótese fundamental refutada | Analista re-mapeia tudo |

## 4. Governança (o XOCP segue suas próprias regras)

- Todo commit que toca arquivos internos do XOCP
  (`packages/core/`, `packages/opencode/`, `AGENTS.md`, `specs/xocp/`)
  exige um **Brief de Governança** versionado em `.opencode/briefs/`.
- O hook `.husky/pre-commit` roda `scripts/pre-commit-governance.ts` e
  **bloqueia** commits sem governança em mudanças críticas.
- Emergências: `XOCP_SKIP_GOVERNANCE=1` só funciona em arquivos não-críticos
  e deixa rastro auditável em `.opencode/governance-skips.log`.

### Auditabilidade seletiva
| Artefato | Versionado? |
|----------|-------------|
| `.opencode/briefs/`, `.opencode/reviews/`, `.opencode/evolution/` | ✅ sim |
| `.opencode/state/`, `.opencode/execution-log/`, `dag.db` | ❌ não (runtime regenerável) |

## 5. Prompts de agentes (V1 ↔ V2)

Os prompts vivem em `packages/opencode/src/agent/prompt/*.txt` (V1) e são
espelhados byte-a-byte em `packages/core/src/plugin/*.txt` (V2).
O teste `test/prompts-mirror.test.ts` falha no CI se qualquer hash divergir.

## 6. Onde encontrar mais detalhes

- Documentação completa: [`specs/xocp/documentacao.md`](specs/xocp/documentacao.md)
- Templates por cluster: [`specs/xocp/templates/`](specs/xocp/templates/)
- Skill do pipeline: [`.opencode/skills/workflow-pipeline/SKILL.md`](.opencode/skills/workflow-pipeline/SKILL.md)
- Regras dos agentes: [`AGENTS.md`](AGENTS.md)

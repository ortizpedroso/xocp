---
id: BR-GOV-2026-09-24-HARDENING
tipo: governanca
cluster: core
titulo: "Hardening de governança — CI server-side, skip com justificativa obrigatória e testes unitários"
autor: meta-governanca-xocp
data: 2026-09-24
severidade: high
---

# Brief de Governança: Hardening Pós-Auditoria (2026-09-24)

## Contexto
A auditoria geral de segurança/qualidade identificou vulnerabilidades que esta mudança corrige.

## Arquivos Afetados
- packages/core/src/governance/governance-reporter.ts
- scripts/pre-commit-governance.ts
- scripts/ci-governance-check.ts
- ops/xocp-governance-ci.yml (promover para .github/workflows/ após habilitar workflow scope no token)
- test/governance/snapshot.test.ts
- test/governance/classification.test.ts
- test/governance/skip-audit.test.ts
- scripts/cleanup-runtime-artifacts.sh

## Mudanças Realizadas

### P1 — Governança server-side (bloqueio não-bypassável)
- Novo workflow `xocp-governance-ci.yml` roda em push/PR na `main`: testes de governança, mirror V1≡V2, E2E, integridade do skips-log e checagem de brief via `scripts/ci-governance-check.ts`.
- Hooks locais (`--no-verify`) deixam de ser a única linha de defesa.

### P2 — Skip auditável endurecido
- `XOCP_SKIP_REASON` passa a ser OBRIGATÓRIO (mínimo 10 caracteres); sem ele o skip é bloqueado.
- Fallback `'NÃO INFORMADO'` removido da política do hook.
- `validateSkipsLog()` adicionado ao reporter (JSONL íntegro ou CI falha).
- Bugfix: `require('fs')` em módulo ESM substituído por import estático.

### M1 — Testes unitários dos módulos novos
- `snapshot.test.ts`: round-trip save/load, limites de histórico (50 erros/100 entries), imutabilidade, recuperação.
- `classification.test.ts`: thresholds L1/L2/L3, precedência de hipótese refutada, breves afetados, serialize/parse.

### B3 — Execução do script de limpeza
- `chmod +x scripts/cleanup-runtime-artifacts.sh`.

## Critérios de Aceitação
- [x] CI governance check bloqueia mudança crítica sem brief (validado localmente: exit 1)
- [x] Skip sem reason ≥10 chars é rejeitado
- [x] Suite completa verde (49 testes)
- [x] Nenhum comportamento existente quebrado (contrato de API preservado)

## Riscos
- Branch protection precisa ser habilitada no GitHub para tornar o check obrigatório (ação manual do maintainer).

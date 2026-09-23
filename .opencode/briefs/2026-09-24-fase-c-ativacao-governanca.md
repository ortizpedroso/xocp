---
id: gov-phase-c-activation
tipo: brief-governanca
cluster: core
severidade: high
data: 2026-09-24
autor: xocp-maintainer
status: aprovado
---

# Brief de Governança — Ativação da Meta-Governança (Fase C)

## Objetivo
Tornar o XOCP auto-compliant: ativar o hook de pre-commit de governança,
corrigir bugs nos módulos de governança e expor scripts npm para operação.

## Arquivos Afetados
- .husky/pre-commit
- package.json
- packages/core/src/governance/governance-validator.ts
- specs/xocp/documentacao.md

## Mudanças
1. **Hook ativado**: criado `.husky/pre-commit` que executa
   `bun scripts/pre-commit-governance.ts` (com fallback seguro se bun ausente).
2. **Bug fix (validator)**: substituído `require('fs')` em módulo ESM por
   import estático `statSync`; removido stub `coversFiles: []` — agora o
   validator faz parse real do brief (seção "Arquivos Afetados") via
   `extractCoveredFiles()`.
3. **Scripts npm**: adicionados `governance:check` e `governance:cleanup`.
4. **Documentação**: seção de governança marcada como ATIVADA.

## Critérios de Aceite
- [x] Hook presente e executável (`chmod +x`)
- [x] Validator sem `require()` em ESM
- [x] Cobertura de briefs realmente lida dos artefatos
- [x] Skip auditável bloqueia arquivos críticos (testes existentes)

## Riscos
- Hooks não rodam com `--no-verify` — mitigado pelo log de skips e pela
  convenção de code review.

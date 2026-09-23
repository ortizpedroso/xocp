---
id: gov-phase-c-review
tipo: review-governanca
brief: gov-phase-c-activation
data: 2026-09-24
revisor: xocp-maintainer
veredito: aprovado_com_ressalvas
---

# Review de Governança — Ativação da Meta-Governança (Fase C)

## Escopo revisado
- Hook `.husky/pre-commit` ativado e executável.
- `governance-validator.ts`: remoção de `require()` em ESM; parse real de
  `coversFiles` via `extractCoveredFiles()`.
- `internal-change-detector.ts`: export público de `isCriticalFile` (bug
  runtime que quebrava o pre-commit).
- `test/prompts-mirror.test.ts`: correção de API (`toExist` inexistente no
  bun:test) — 2/2 testes passando.
- Scripts npm `governance:check` / `governance:cleanup`.
- Auditabilidade: `.opencode/briefs/.gitignore` local não ignorava mais os
  artefatos (conflito com a regra de versionamento na raiz).

## Validação executada
- `bun test ./test/governance/skip-audit.test.ts` → 16 pass / 0 fail
- `bun test ./test/prompts-mirror.test.ts` → 2 pass / 0 fail
- `bun run governance:check` → WARNING (permitido), depois deste review passa sem ressalva

## Ressalvas
- Fallback do hook quando bun ausente do PATH apenas avisa (não bloqueia);
  documentado em specs/xocp/documentacao.md.

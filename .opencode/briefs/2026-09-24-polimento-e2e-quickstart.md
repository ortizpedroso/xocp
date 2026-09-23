---
id: gov-polish-e2e-quickstart
tipo: brief-governanca
cluster: core
severidade: high
data: 2026-09-24
autor: xocp-maintainer
status: aprovado
---

# Brief de Governança — Polimento Final (E2E + QUICKSTART)

## Objetivo
Fechar as pendências opcionais apontadas na auditoria da Arquitetura de
Contratos Aninhados: criar o teste de integração E2E do ciclo completo e o
guia rápido de uso, dogfooding o próprio processo de governança do XOCP.

## Arquivos Afetados
- test/e2e/pipeline-integration.test.ts
- QUICKSTART.md
- .opencode/briefs/2026-09-24-polimento-e2e-quickstart.md

## Critérios de Aceitação
- [x] **C001**: Teste E2E cobre snapshot→retomada, classificação L1/L2/L3,
      detector/validator de governança e espelhamento de critérios.
- [x] **C002**: Todos os testes da suíte de governança+espelhamento+E2E
      passam (`bun test ./test/...` → 26 pass / 0 fail).
- [x] **C003**: QUICKSTART.md documenta instalação, fluxo de contratos
      aninhados, 3 Travas, escalação, governança/skip e auditabilidade.
- [x] **C004**: Este brief versionado atende ao requisito de auto-compliance
      para mudanças em arquivos internos.

## Riscos e Mitigação
- Risco: acoplamento do E2E a artefatos reais → mitigado com tmpdir isolado.
- Risco: templates em PT-BR divergirem do vocabulário "criteria" →
  asserções aceitam ambas grafias.

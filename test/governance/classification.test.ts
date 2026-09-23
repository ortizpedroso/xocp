/**
 * Unit tests — Escalation Classification (packages/core/src/escalation/classification.ts)
 * Cobre pendência M-1 da auditoria 2026-09-24.
 */

import { describe, it, expect } from 'bun:test';
import {
  EscalationLevel,
  CLASSIFICATION_THRESHOLDS,
  classifyEscalation,
  createEscalationContext,
  getAffectedBriefs,
  serializeEscalationContext,
  parseEscalationContext,
} from '../../packages/core/src/escalation/classification';

const base = {
  brokenContractsCount: 0,
  fundamentalHypothesisRefuted: false,
  affectedClusters: ['backend'],
  description: 'teste',
};

describe('classifyEscalation', () => {
  it('L1: poucos critérios falhando, sem contrato quebrado', () => {
    expect(
      classifyEscalation({ ...base, failedCriteriaCount: 2 })
    ).toBe(EscalationLevel.L1_LOCAL_ADJUST);
  });

  it('L2: 3 critérios falhando ultrapassa limite do L1', () => {
    expect(
      classifyEscalation({ ...base, failedCriteriaCount: 3 })
    ).toBe(EscalationLevel.L2_REPLANNING);
  });

  it('L2: exatamente 1 contrato quebrado', () => {
    expect(
      classifyEscalation({ ...base, failedCriteriaCount: 1, brokenContractsCount: 1 })
    ).toBe(EscalationLevel.L2_REPLANNING);
  });

  it('L2: múltiplos clusters afetados', () => {
    expect(
      classifyEscalation({
        ...base,
        failedCriteriaCount: 1,
        affectedClusters: ['backend', 'frontend'],
      })
    ).toBe(EscalationLevel.L2_REPLANNING);
  });

  it('L3: >=6 critérios falhando', () => {
    expect(
      classifyEscalation({ ...base, failedCriteriaCount: CLASSIFICATION_THRESHOLDS.L3_MIN_FAILED_CRITERIA })
    ).toBe(EscalationLevel.L3_REDIRECTION);
  });

  it('L3: mais de 1 contrato quebrado', () => {
    expect(
      classifyEscalation({ ...base, failedCriteriaCount: 0, brokenContractsCount: 2 })
    ).toBe(EscalationLevel.L3_REDIRECTION);
  });

  it('L3: hipótese fundamental refutada tem precedência máxima', () => {
    expect(
      classifyEscalation({ ...base, failedCriteriaCount: 1, fundamentalHypothesisRefuted: true })
    ).toBe(EscalationLevel.L3_REDIRECTION);
  });
});

describe('getAffectedBriefs', () => {
  const briefs = [
    { id: 'B1', cluster: 'backend' },
    { id: 'B2', cluster: 'frontend' },
    { id: 'B3', cluster: 'backend' },
  ];

  it('L1 não afeta nenhum brief', () => {
    expect(getAffectedBriefs(EscalationLevel.L1_LOCAL_ADJUST, ['backend'], briefs)).toEqual([]);
  });

  it('L2 afeta apenas briefs dos clusters atingidos', () => {
    expect(getAffectedBriefs(EscalationLevel.L2_REPLANNING, ['backend'], briefs)).toEqual(['B1', 'B3']);
  });

  it('L3 afeta todos os briefs', () => {
    expect(getAffectedBriefs(EscalationLevel.L3_REDIRECTION, [], briefs)).toEqual(['B1', 'B2', 'B3']);
  });
});

describe('contexto de escalação', () => {
  it('createEscalationContext preenche ação recomendada e timestamp', () => {
    const ctx = createEscalationContext(EscalationLevel.L2_REPLANNING, 'contrato quebrado', 'avaliador', {
      affectedClusters: ['core'],
    });
    expect(ctx.level).toBe(EscalationLevel.L2_REPLANNING);
    expect(ctx.recommendedAction.length).toBeGreaterThan(0);
    expect(ctx.escalatedBy).toBe('avaliador');
    expect(Date.parse(ctx.timestamp)).not.toBeNaN();
  });

  it('serialize + parse round-tripam o contexto', () => {
    const ctx = createEscalationContext(EscalationLevel.L3_REDIRECTION, 'hipótese refutada', 'executor');
    const restored = parseEscalationContext(serializeEscalationContext(ctx));
    expect(restored).not.toBeNull();
    expect(restored!.level).toBe(EscalationLevel.L3_REDIRECTION);
    expect(restored!.reason).toBe('hipótese refutada');
  });

  it('parse rejeita JSON inválido e nível desconhecido', () => {
    expect(parseEscalationContext('{nao é json')).toBeNull();
    expect(parseEscalationContext(JSON.stringify({ level: 'L9_FAKE' }))).toBeNull();
  });
});

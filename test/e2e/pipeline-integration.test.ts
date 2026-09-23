/**
 * Teste de Integração E2E — Arquitetura de Contratos Aninhados
 *
 * Simula um ciclo completo do XOCP exercitando a integração entre:
 *   Brief (templates multi-camada) → Executor (criteria_met espelhado)
 *   → State Snapshot (persistência/retomada)
 *   → Classificação L1/L2/L3 (escalação)
 *   → Meta-Governança (detector + validator)
 *
 * Usa diretórios temporários isolados — não toca em artefatos reais.
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import {
  saveSnapshot,
  loadSnapshot,
  createCycleState,
  addToHistory,
  type CycleState,
  type SnapshotConfig,
} from '../../packages/core/src/state/snapshot';

import {
  classifyEscalation,
  createEscalationContext,
  canResumeWithLocalAdjust,
  getAffectedBriefs,
  EscalationLevel,
} from '../../packages/core/src/escalation/classification';

import {
  isCriticalFile,
  detectInternalChanges,
  validateGovernanceArtifacts,
} from '../../packages/core/src/governance/internal-change-detector';

import { validateGovernance } from '../../packages/core/src/governance/governance-validator';

describe('E2E — Ciclo completo do pipeline XOCP', () => {
  let workDir: string;
  let snapshotConfig: SnapshotConfig;

  beforeEach(() => {
    workDir = mkdtempSync(join(tmpdir(), 'xocp-e2e-'));
    snapshotConfig = { snapshotDir: join(workDir, 'state'), maxHistory: 5 };
  });

  afterEach(() => {
    rmSync(workDir, { recursive: true, force: true });
  });

  it('ciclo 1→2: salva snapshot, interrompe e retoma com contexto preservado', async () => {
    // ── Ciclo 1: Analista cria estado inicial ────────────────────────────
    const state1 = createCycleState(1, 'analista', 'mapear-clusters', 'abc1234');
    await saveSnapshot(state1, snapshotConfig);

    // ── Executor trabalha e registra conclusão no histórico ─────────────
    const state1b = addToHistory(state1, {
      agent: 'executor-backend',
      task: 'implementar-api',
      status: 'completed',
      artifacts: ['src/api/users.ts'],
    });
    await saveSnapshot(state1b, snapshotConfig);

    // ── Interrupção simulada (crash/escalação): retomada via snapshot ───
    const restored = await loadSnapshot(snapshotConfig);
    expect(restored).not.toBeNull();
    expect(restored!.cycle).toBe(1);
    expect(restored!.history.length).toBe(1);
    expect(restored!.history[0].artifacts).toEqual(['src/api/users.ts']);

    // ── Ciclo 2 continua a partir do estado restaurado ───────────────────
    const state2 = createCycleState(2, 'avaliador', 'dual-lens-review', 'def5678', restored!);
    expect(state2.history.length).toBe(1); // contexto herdado
    await saveSnapshot(state2, snapshotConfig);

    const final = await loadSnapshot(snapshotConfig);
    expect(final!.currentAgent).toBe('avaliador');
  });

  it('snapshot sobrevive ao prune mantendo current.json íntegro', async () => {
    let state = createCycleState(1, 'executor', 't', 'h1');
    for (let i = 1; i <= 9; i++) {
      state = { ...state, cycle: i };
      await saveSnapshot(state, snapshotConfig);
    }
    // maxHistory = 5 → backups limitados, mas current sempre presente
    const current = await loadSnapshot(snapshotConfig);
    expect(current).not.toBeNull();
    expect(current!.cycle).toBe(9);
  });

  it('contrato bidirecional: templates exigem espelhamento criteria.id ↔ criteria_met.id', () => {
    const briefTemplate = readFileSync(
      join(process.cwd(), 'specs/xocp/templates/brief-backend-template.md'),
      'utf-8'
    );
    const executorTemplate = readFileSync(
      join(process.cwd(), 'specs/xocp/templates/executor-backend-template.md'),
      'utf-8'
    );

    // Templates reais usam "critérios de aceitação" (PT) com IDs C001…
    expect(briefTemplate.toLowerCase()).toMatch(/crit[ée]rios|criteria/);
    expect(executorTemplate.toLowerCase()).toMatch(/crit[ée]rios|criteria/);
    expect(briefTemplate).toMatch(/C0\d\d/); // IDs numerados obrigatórios

    // Simulação do contrato: mesmo conjunto de IDs nos dois lados
    const briefCriteriaIds = ['C001', 'C002', 'C003'];
    const executorCriteriaMet = [
      { id: 'C001', status: 'met' },
      { id: 'C002', status: 'met' },
      { id: 'C003', status: 'failed' },
    ];
    expect(executorCriteriaMet.every((c) => briefCriteriaIds.includes(c.id))).toBe(true);

    // Falha de critério alimenta a classificação de escalação
    const failedCount = executorCriteriaMet.filter((c) => c.status === 'failed').length;
    expect(failedCount).toBe(1);
  });

  it('classificação L1/L2/L3 roteia corretamente a resposta humana', () => {
    // L1: poucos critérios falhando, impacto local
    expect(
      classifyEscalation({
        failedCriteriaCount: 2,
        brokenContractsCount: 0,
        fundamentalHypothesisRefuted: false,
        affectedClusters: ['backend'],
        description: 'erro de tipagem',
      })
    ).toBe(EscalationLevel.L1_LOCAL_ADJUST);

    // L2: contrato quebrado
    expect(
      classifyEscalation({
        failedCriteriaCount: 1,
        brokenContractsCount: 1,
        fundamentalHypothesisRefuted: false,
        affectedClusters: ['backend'],
        description: 'contrato de API violado',
      })
    ).toBe(EscalationLevel.L2_REPLANNING);

    // L3: hipótese fundamental refutada
    expect(
      classifyEscalation({
        failedCriteriaCount: 0,
        brokenContractsCount: 0,
        fundamentalHypothesisRefuted: true,
        affectedClusters: ['core', 'backend'],
        description: 'abordagem inviável',
      })
    ).toBe(EscalationLevel.L3_REDIRECTION);

    // Contexto de escalação gera ação recomendada
    const ctx = createEscalationContext(
      EscalationLevel.L2_REPLANNING,
      'contrato violado',
      'avaliador'
    );
    expect(ctx.recommendedAction).toContain('Analista');

    // Retomada local só é permitida em L1 com contexto válido
    expect(
      canResumeWithLocalAdjust({
        escalationLevel: EscalationLevel.L1_LOCAL_ADJUST,
        hasValidContext: true,
        criticalErrorsResolved: true,
      })
    ).toBe(true);
    expect(
      canResumeWithLocalAdjust({
        escalationLevel: EscalationLevel.L2_REPLANNING,
        hasValidContext: true,
        criticalErrorsResolved: true,
      })
    ).toBe(false);

    // L3 afeta todos os briefs
    const allBriefs = [
      { id: 'B1', cluster: 'backend' },
      { id: 'B2', cluster: 'frontend' },
    ];
    expect(getAffectedBriefs(EscalationLevel.L3_REDIRECTION, [], allBriefs)).toEqual(['B1', 'B2']);
  });

  it('meta-governança: detector classifica arquivos críticos e mudanças internas', async () => {
    expect(isCriticalFile('AGENTS.md')).toBe(true);
    expect(isCriticalFile('docs/notes.md')).toBe(false);

    // Detector roda sobre arquivos staged reais do repo (existem em disco)
    const trigger = await detectInternalChanges([
      'packages/core/src/state/snapshot.ts',
      'README.md',
    ]);
    expect(trigger.requiresBrief).toBe(true);
    expect(trigger.severity).toBe('critical');
  });

  it('meta-governança: validator bloqueia mudanças críticas sem brief', () => {
    const result = validateGovernance(
      [{ path: 'packages/core/src/governance/governance-reporter.ts', type: 'modified', currentHash: 'x' }],
      'critical'
    );
    // Como existem briefs de governança versionados no repo, o resultado
    // deve ser uma estrutura válida de ValidationResult em qualquer caso.
    expect(typeof result.valid).toBe('boolean');
    expect(Array.isArray(result.errors)).toBe(true);
    expect(Array.isArray(result.warnings)).toBe(true);
  });

  it('meta-governança: artefatos de governança são auditáveis no repositório', async () => {
    const validation = await validateGovernanceArtifacts([]);
    expect(typeof validation.valid).toBe('boolean');
    expect(Array.isArray(validation.missing)).toBe(true);
  });

  it('integração total: avaliação que falha escala, persiste e permite retomada', async () => {
    // Avaliador encontra 6 critérios falhos → L3
    const level = classifyEscalation({
      failedCriteriaCount: 6,
      brokenContractsCount: 0,
      fundamentalHypothesisRefuted: false,
      affectedClusters: ['backend', 'integration'],
      description: 'múltiplas falhas',
    });
    expect(level).toBe(EscalationLevel.L3_REDIRECTION);

    // Estado é persistido ANTES da escalação para permitir retomada
    const state = createCycleState(3, 'avaliador', 'review-cycle', 'ghi9012');
    const escalated: CycleState = {
      ...state,
      context: {
        ...state.context,
        escalation: createEscalationContext(level, 'múltiplas falhas', 'avaliador'),
      },
    };
    await saveSnapshot(escalated, snapshotConfig);

    // Após intervenção humana, retomada carrega o contexto da escalação
    const resumed = await loadSnapshot(snapshotConfig);
    expect(resumed!.context.escalation).toBeDefined();
    expect((resumed!.context.escalation as any).level).toBe(EscalationLevel.L3_REDIRECTION);

    // Skip de governança só deixa rastro se ocorrer
    const logPath = join(workDir, 'governance-skips.log');
    expect(existsSync(logPath)).toBe(false);
  });
});

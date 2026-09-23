/**
 * Unit tests — State Snapshot (packages/core/src/state/snapshot.ts)
 * Cobre pendência M-1 da auditoria 2026-09-24.
 */

import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  createCycleState,
  saveSnapshot,
  loadSnapshot,
  addToHistory,
  recordError,
  markErrorRecovered,
  updateHypothesis,
  addContext,
  hasRecoverableState,
  clearSnapshot,
} from '../../packages/core/src/state/snapshot';

let dir: string;
let config: { snapshotDir: string; maxHistory: number };

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'xocp-snapshot-'));
  config = { snapshotDir: dir, maxHistory: 50 };
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('State Snapshot', () => {
  it('createCycleState produz estado válido com campos vazios', () => {
    const s = createCycleState(1, 'executor', 'tarefa-x', 'abc123');
    expect(s.cycle).toBe(1);
    expect(s.currentAgent).toBe('executor');
    expect(s.gitHash).toBe('abc123');
    expect(s.history).toEqual([]);
    expect(s.errors).toEqual([]);
    expect(s.hypotheses).toEqual([]);
  });

  it('saveSnapshot + loadSnapshot round-tripam o estado', async () => {
    let s = createCycleState(2, 'avaliador', 'review-y', 'def456');
    s = addToHistory(s, { agent: 'executor', task: 'implementar', status: 'completed', artifacts: ['a.ts'] });
    await saveSnapshot(s, config);
    const loaded = await loadSnapshot(config);
    expect(loaded).not.toBeNull();
    expect(loaded!.cycle).toBe(2);
    expect(loaded!.history.length).toBe(1);
    expect(loaded!.history[0].status).toBe('completed');
  });

  it('hasRecoverableState detecta snapshot existente', async () => {
    expect(hasRecoverableState(config)).toBe(true);
  });

  it('recordError adiciona erro não recuperado', () => {
    let s = createCycleState(3, 'executor', 't', 'h');
    s = recordError(s, new Error('boom'));
    expect(s.errors.length).toBe(1);
    expect(s.errors[0].message).toBe('boom');
    expect(s.errors[0].recovered).toBe(false);
  });

  it('markErrorRecovered marca pelo índice e ignora índice inválido', () => {
    let s = createCycleState(3, 'executor', 't', 'h');
    s = recordError(s, 'falha de teste');
    s = markErrorRecovered(s, 0);
    expect(s.errors[0].recovered).toBe(true);
    // índice fora do intervalo retorna estado inalterado
    const unchanged = markErrorRecovered(s, 99);
    expect(unchanged).toEqual(s);
  });

  it('recordError limita histórico a 50 entradas', () => {
    let s = createCycleState(4, 'executor', 't', 'h');
    for (let i = 0; i < 60; i++) s = recordError(s, `erro-${i}`);
    expect(s.errors.length).toBe(50);
    expect(s.errors[49].message).toBe('erro-59');
  });

  it('updateHypothesis cria e atualiza pela mesma id', () => {
    let s = createCycleState(5, 'analista', 't', 'h');
    s = updateHypothesis(s, 'H1', 'premissa A', 'active');
    expect(s.hypotheses.length).toBe(1);
    s = updateHypothesis(s, 'H1', 'premissa A', 'refuted', 'evidencia E2E');
    expect(s.hypotheses.length).toBe(1);
    expect(s.hypotheses[0].status).toBe('refuted');
    expect(s.hypotheses[0].evidence).toBe('evidencia E2E');
  });

  it('addToHistory limita a 100 entradas', () => {
    let s = createCycleState(6, 'executor', 't', 'h');
    for (let i = 0; i < 110; i++) {
      s = addToHistory(s, { agent: 'executor', task: `t${i}`, status: 'completed', artifacts: [] });
    }
    expect(s.history.length).toBe(100);
  });

  it('addContext é imutável e acumulativo', () => {
    let s = createCycleState(7, 'executor', 't', 'h');
    const s2 = addContext(s, 'chave', { valor: 42 });
    expect(Object.keys(s.context).length).toBe(0); // original intacto
    expect((s2.context.chave as { valor: number }).valor).toBe(42);
  });

  it('clearSnapshot remove estado recuperável', async () => {
    await saveSnapshot(createCycleState(8, 'executor', 't', 'h'), config);
    expect(hasRecoverableState(config)).toBe(true);
    await clearSnapshot(config);
    expect(hasRecoverableState(config)).toBe(false);
    expect(await loadSnapshot(config)).toBeNull();
  });
});

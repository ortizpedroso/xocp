/**
 * State Snapshot Module
 * 
 * Persiste o estado do XOCP a cada ciclo para permitir continuidade
 * após interrupções ou escalações humanas.
 */

import { writeFile, readFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';

export interface CycleState {
  cycle: number;
  timestamp: string;
  gitHash: string;
  currentAgent: string;
  currentTask: string;
  history: CycleHistoryEntry[];
  errors: ErrorEntry[];
  hypotheses: HypothesisEntry[];
  context: Record<string, unknown>;
}

export interface CycleHistoryEntry {
  cycle: number;
  agent: string;
  task: string;
  status: 'completed' | 'failed' | 'interrupted';
  artifacts: string[];
}

export interface ErrorEntry {
  cycle: number;
  timestamp: string;
  message: string;
  stack?: string;
  recovered: boolean;
}

export interface HypothesisEntry {
  id: string;
  description: string;
  status: 'active' | 'confirmed' | 'refuted';
  evidence?: string;
}

export interface SnapshotConfig {
  snapshotDir: string;
  maxHistory: number;
}

const DEFAULT_CONFIG: SnapshotConfig = {
  snapshotDir: '.opencode/state',
  maxHistory: 50,
};

/**
 * Salva o estado atual do ciclo em disco de forma atômica
 */
export async function saveSnapshot(state: CycleState, config: SnapshotConfig = DEFAULT_CONFIG): Promise<void> {
  const snapshotPath = join(config.snapshotDir, 'current.json');
  const backupPath = join(config.snapshotDir, `backup-${state.cycle}.json`);
  
  // Garantir que o diretório existe
  if (!existsSync(config.snapshotDir)) {
    await mkdir(config.snapshotDir, { recursive: true });
  }
  
  // Serializar estado
  const serialized = JSON.stringify(state, null, 2);
  
  // Escrita atômica: escrever em backup primeiro, depois renomear
  await writeFile(backupPath, serialized, 'utf-8');
  await writeFile(snapshotPath, serialized, 'utf-8');
  
  // Manter apenas histórico limitado
  await pruneOldSnapshots(config);
}

/**
 * Recupera o último estado salvo
 */
export async function loadSnapshot(config: SnapshotConfig = DEFAULT_CONFIG): Promise<CycleState | null> {
  const snapshotPath = join(config.snapshotDir, 'current.json');
  
  if (!existsSync(snapshotPath)) {
    return null;
  }
  
  try {
    const data = await readFile(snapshotPath, 'utf-8');
    return JSON.parse(data) as CycleState;
  } catch (error) {
    console.warn('Failed to load snapshot:', error);
    return null;
  }
}

/**
 * Remove snapshots antigos mantendo apenas os mais recentes
 */
async function pruneOldSnapshots(config: SnapshotConfig): Promise<void> {
  const { readdir, unlink } = await import('fs/promises');
  
  try {
    const files = await readdir(config.snapshotDir);
    const backupFiles = files
      .filter(f => f.startsWith('backup-') && f.endsWith('.json'))
      .sort()
      .reverse();
    
    // Manter apenas os últimos N backups
    if (backupFiles.length > config.maxHistory) {
      for (const file of backupFiles.slice(config.maxHistory)) {
        await unlink(join(config.snapshotDir, file));
      }
    }
  } catch (error) {
    console.warn('Failed to prune old snapshots:', error);
  }
}

/**
 * Cria um novo estado de ciclo
 */
export function createCycleState(
  cycle: number,
  agent: string,
  task: string,
  gitHash: string,
  previousState?: CycleState
): CycleState {
  return {
    cycle,
    timestamp: new Date().toISOString(),
    gitHash,
    currentAgent: agent,
    currentTask: task,
    history: previousState?.history || [],
    errors: previousState?.errors || [],
    hypotheses: previousState?.hypotheses || [],
    context: previousState?.context || {},
  };
}

/**
 * Adiciona uma entrada ao histórico
 */
export function addToHistory(
  state: CycleState,
  entry: Omit<CycleHistoryEntry, 'cycle'>
): CycleState {
  return {
    ...state,
    history: [
      ...state.history,
      { ...entry, cycle: state.cycle },
    ].slice(-100), // Manter últimos 100 entries
  };
}

/**
 * Registra um erro
 */
export function recordError(
  state: CycleState,
  error: Error | string,
  stack?: string
): CycleState {
  const errorEntry: ErrorEntry = {
    cycle: state.cycle,
    timestamp: new Date().toISOString(),
    message: error instanceof Error ? error.message : error,
    stack: stack || (error instanceof Error ? error.stack : undefined),
    recovered: false,
  };
  
  return {
    ...state,
    errors: [...state.errors, errorEntry].slice(-50), // Manter últimos 50 erros
  };
}

/**
 * Marca um erro como recuperado
 */
export function markErrorRecovered(state: CycleState, errorIndex: number): CycleState {
  if (!state.errors[errorIndex]) {
    return state;
  }
  
  const updatedErrors = [...state.errors];
  updatedErrors[errorIndex] = { ...updatedErrors[errorIndex], recovered: true };
  
  return {
    ...state,
    errors: updatedErrors,
  };
}

/**
 * Adiciona ou atualiza uma hipótese
 */
export function updateHypothesis(
  state: CycleState,
  id: string,
  description: string,
  status: HypothesisEntry['status'],
  evidence?: string
): CycleState {
  const existingIndex = state.hypotheses.findIndex(h => h.id === id);
  
  const hypothesis: HypothesisEntry = {
    id,
    description,
    status,
    evidence,
  };
  
  let updatedHypotheses: HypothesisEntry[];
  if (existingIndex >= 0) {
    updatedHypotheses = [...state.hypotheses];
    updatedHypotheses[existingIndex] = hypothesis;
  } else {
    updatedHypotheses = [...state.hypotheses, hypothesis];
  }
  
  return {
    ...state,
    hypotheses: updatedHypotheses,
  };
}

/**
 * Adiciona contexto ao estado
 */
export function addContext<T>(
  state: CycleState,
  key: string,
  value: T
): CycleState {
  return {
    ...state,
    context: {
      ...state.context,
      [key]: value,
    },
  };
}

/**
 * Verifica se há um estado recuperável
 */
export function hasRecoverableState(config: SnapshotConfig = DEFAULT_CONFIG): boolean {
  const snapshotPath = join(config.snapshotDir, 'current.json');
  return existsSync(snapshotPath);
}

/**
 * Limpa o estado atual (após conclusão bem-sucedida)
 */
export async function clearSnapshot(config: SnapshotConfig = DEFAULT_CONFIG): Promise<void> {
  const { unlink } = await import('fs/promises');
  const snapshotPath = join(config.snapshotDir, 'current.json');
  
  if (existsSync(snapshotPath)) {
    await unlink(snapshotPath);
  }
}

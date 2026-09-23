/**
 * State Snapshot - Persistência de Estado para Continuidade de Contexto
 * 
 * Salva o estado atual do XOCP a cada ciclo, permitindo retomada após
 * escalação humana ou interrupções.
 */

export interface StateSnapshot {
  ciclo: number;
  timestamp: string;
  historico: HistoricoAcao[];
  erros: ErroContexto[];
  hipoteses: Hipotese[];
  gitState: GitState;
  briefsAtivos: string[];
  criteriosPendentes: string[];
}

export interface HistoricoAcao {
  ciclo: number;
  agente: string;
  acao: string;
  artefatos: string[];
  resultado: 'sucesso' | 'falha' | 'parcial';
}

export interface ErroContexto {
  ciclo: number;
  mensagem: string;
  contexto: Record<string, unknown>;
  recuperavel: boolean;
}

export interface Hipotese {
  id: string;
  descricao: string;
  status: 'ativa' | 'validada' | 'refutada';
  evidencias: string[];
}

export interface GitState {
  branch: string;
  commit: string;
  changesStaged: boolean;
  changesUnstaged: boolean;
}

export class StateSnapshotManager {
  private snapshotPath: string;

  constructor(basePath: string = '.opencode/state') {
    this.snapshotPath = `${basePath}/snapshot.json`;
  }

  /**
   * Salva um snapshot do estado atual
   */
  async save(snapshot: StateSnapshot): Promise<void> {
    const fs = await import('fs');
    const path = await import('path');
    
    // Garantir diretório existe
    const dir = path.dirname(this.snapshotPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Adicionar timestamp de salvamento
    const snapshotWithMeta = {
      ...snapshot,
      savedAt: new Date().toISOString(),
    };

    // Escrever snapshot (atômico via write temporário)
    const tempPath = `${this.snapshotPath}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(snapshotWithMeta, null, 2));
    fs.renameSync(tempPath, this.snapshotPath);
  }

  /**
   * Carrega o último snapshot salvo
   */
  async load(): Promise<StateSnapshot | null> {
    const fs = await import('fs');
    
    if (!fs.existsSync(this.snapshotPath)) {
      return null;
    }

    try {
      const content = fs.readFileSync(this.snapshotPath, 'utf-8');
      return JSON.parse(content) as StateSnapshot;
    } catch (error) {
      console.warn('Falha ao carregar snapshot:', error);
      return null;
    }
  }

  /**
   * Limpa snapshots antigos (mantém apenas o último)
   */
  async cleanup(maxAgeHours: number = 24): Promise<void> {
    const fs = await import('fs');
    
    if (!fs.existsSync(this.snapshotPath)) {
      return;
    }

    try {
      const stats = fs.statSync(this.snapshotPath);
      const now = new Date();
      const fileTime = stats.mtime;
      const ageHours = (now.getTime() - fileTime.getTime()) / (1000 * 60 * 60);

      if (ageHours > maxAgeHours) {
        fs.unlinkSync(this.snapshotPath);
      }
    } catch (error) {
      console.warn('Falha ao limpar snapshot:', error);
    }
  }

  /**
   * Cria um snapshot básico do estado atual
   */
  async createBasicSnapshot(
    ciclo: number,
    gitState: GitState
  ): Promise<StateSnapshot> {
    return {
      ciclo,
      timestamp: new Date().toISOString(),
      historico: [],
      erros: [],
      hipoteses: [],
      gitState,
      briefsAtivos: [],
      criteriosPendentes: [],
    };
  }
}

export default StateSnapshotManager;

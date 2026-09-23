/**
 * Internal Change Detector
 * Detecta mudanças em arquivos críticos do próprio XOCP
 * para acionar governança antes de commits.
 */

import { readdir, readFile } from 'fs/promises';
import { join, relative } from 'path';
import { createHash } from 'crypto';

export interface FileChange {
  path: string;
  type: 'modified' | 'created' | 'deleted';
  previousHash?: string;
  currentHash?: string;
}

export interface GovernanceTrigger {
  requiresBrief: boolean;
  changedFiles: FileChange[];
  severity: 'low' | 'medium' | 'high' | 'critical';
}

const CRITICAL_PATTERNS = [
  'packages/core/src/',
  'packages/opencode/src/',
  'AGENTS.md',
  'specs/xocp/',
  '.opencode/skills/',
];

const GOVERNANCE_ARTIFACTS = [
  '.opencode/briefs/',
  '.opencode/reviews/',
  '.opencode/evolution/',
];

/**
 * Calcula hash MD5 de um arquivo
 */
async function calculateFileHash(filePath: string): Promise<string> {
  try {
    const content = await readFile(filePath);
    return createHash('md5').update(content).digest('hex');
  } catch {
    return '';
  }
}

/**
 * Verifica se um arquivo é crítico (parte do XOCP)
 */
function isCriticalFile(filePath: string): boolean {
  return CRITICAL_PATTERNS.some(pattern => 
    filePath.startsWith(pattern) || filePath.includes(pattern)
  );
}

/**
 * Verifica se mudança requer artefatos de governança
 */
function requiresGovernanceArtifacts(filePath: string): boolean {
  // Mudanças em arquivos críticos sempre requerem governança
  if (isCriticalFile(filePath)) {
    return true;
  }
  
  // Mudanças em skills ou prompts requerem governança
  if (filePath.includes('.opencode/skills/') || filePath.includes('/prompt/')) {
    return true;
  }
  
  return false;
}

/**
 * Detecta mudanças que requerem governança
 */
export async function detectInternalChanges(
  stagedFiles: string[]
): Promise<GovernanceTrigger> {
  const changedFiles: FileChange[] = [];
  let requiresBrief = false;
  let maxSeverity: 'low' | 'medium' | 'high' | 'critical' = 'low';

  for (const file of stagedFiles) {
    const isCritical = isCriticalFile(file);
    const needsGovernance = requiresGovernanceArtifacts(file);
    
    if (isCritical || needsGovernance) {
      const currentHash = await calculateFileHash(file);
      
      changedFiles.push({
        path: file,
        type: 'modified', // Simplificado para detecção atual
        currentHash,
      });

      if (needsGovernance) {
        requiresBrief = true;
      }

      // Atualiza severidade
      if (file.includes('packages/core/src/') || file.includes('packages/opencode/src/')) {
        maxSeverity = 'critical';
      } else if (file.includes('specs/xocp/')) {
        maxSeverity = maxSeverity === 'critical' ? 'critical' : 'high';
      } else if (file.includes('AGENTS.md')) {
        maxSeverity = maxSeverity === 'critical' || maxSeverity === 'high' ? maxSeverity : 'medium';
      }
    }
  }

  return {
    requiresBrief,
    changedFiles,
    severity: maxSeverity,
  };
}

/**
 * Valida se artefatos de governança existem
 */
export async function validateGovernanceArtifacts(
  changedFiles: FileChange[]
): Promise<{ valid: boolean; missing: string[] }> {
  const missing: string[] = [];
  
  // Verifica se existe brief de governança
  const briefsDir = join(process.cwd(), '.opencode', 'briefs');
  try {
    const files = await readdir(briefsDir);
    const recentBriefs = files.filter(f => f.includes('governance') || f.includes('internal'));
    
    if (recentBriefs.length === 0 && changedFiles.length > 0) {
      missing.push('Brief de Governança (.opencode/briefs/)');
    }
  } catch {
    missing.push('Diretório de Briefs não encontrado');
  }

  return {
    valid: missing.length === 0,
    missing,
  };
}

export default {
  detectInternalChanges,
  validateGovernanceArtifacts,
  isCriticalFile,
};

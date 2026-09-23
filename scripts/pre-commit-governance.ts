#!/usr/bin/env bun
/**
 * Pre-Commit Governance Hook
 * Bloqueia commits de mudanças internas do XOCP sem Brief de Governança
 */

import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';

// Importa módulos de governança
import { detectInternalChanges, isCriticalFile } from '../packages/core/src/governance/internal-change-detector.js';
import { validateGovernance, formatValidationError } from '../packages/core/src/governance/governance-validator.js';
import { generateReport, printReport, logGovernanceSkip } from '../packages/core/src/governance/governance-reporter.js';

const CRITICAL_PATTERNS = [
  'packages/core/',
  'packages/opencode/',
  'AGENTS.md',
  'specs/xocp/',
];

/**
 * Obtém lista de arquivos staged para commit
 */
function getStagedFiles(): string[] {
  try {
    const output = execSync('git diff --cached --name-only', { encoding: 'utf-8' });
    return output.split('\n').filter(f => f.trim() !== '');
  } catch {
    return [];
  }
}

/**
 * Verifica se há arquivos críticos staged
 */
function hasCriticalFiles(files: string[]): boolean {
  return files.some(f => isCriticalFile(f));
}

/**
 * Main
 */
async function main() {
  const stagedFiles = getStagedFiles();
  
  // Se não há arquivos staged, libera
  if (stagedFiles.length === 0) {
    process.exit(0);
  }

  // Verifica skip de governança via variável de ambiente
  const skipGovernance = process.env.XOCP_SKIP_GOVERNANCE === '1';
  
  if (skipGovernance) {
    const criticalFiles = stagedFiles.filter(f => 
      CRITICAL_PATTERNS.some(p => f.startsWith(p) || f.includes(p))
    );
    
    if (criticalFiles.length > 0) {
      console.error('❌ BLOQUEADO: Skip não permitido em arquivos críticos');
      console.error('Arquivos críticos afetados:');
      criticalFiles.forEach(f => console.error(`  - ${f}`));
      console.error('\nPara mudanças em arquivos críticos, governança é OBRIGATÓRIA.');
      console.error('Remova XOCP_SKIP_GOVERNANCE=1 e crie um Brief de Governança.');
      process.exit(1);
    }
    
    // Registra skip em log persistente
    logGovernanceSkip(stagedFiles, process.env.XOCP_SKIP_REASON, process.env.USER);
    process.exit(0);
  }

  // Detecta mudanças internas
  const trigger = await detectInternalChanges(stagedFiles);
  
  // Se não há mudanças críticas, libera
  if (!trigger.requiresBrief || trigger.changedFiles.length === 0) {
    process.exit(0);
  }

  // Valida governança
  const validation = validateGovernance(trigger.changedFiles, trigger.severity);
  
  // Gera relatório
  const report = generateReport(trigger, validation);
  printReport(report);

  // Bloqueia commit se validação falhou
  if (!validation.valid) {
    console.error(formatValidationError(validation));
    process.exit(1);
  }

  // Permite commit com avisos se houver warnings
  if (validation.warnings.length > 0) {
    console.warn('⚠️  Commit permitido com ressalvas. Revise os avisos acima.');
  } else {
    console.log('✅ Governança em conformidade. Commit permitido.');
  }

  process.exit(0);
}

main().catch(err => {
  console.error('Erro na governança:', err);
  process.exit(1);
});

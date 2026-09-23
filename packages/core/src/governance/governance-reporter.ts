/**
 * Governance Reporter
 * Gera relatórios de compliance e auditoria de mudanças
 */

import { appendFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import type { FileChange, GovernanceTrigger } from './internal-change-detector.js';
import type { ValidationResult } from './governance-validator.js';

export interface GovernanceReport {
  timestamp: string;
  gitCommit?: string;
  author: string;
  trigger: GovernanceTrigger;
  validation: ValidationResult;
  decision: 'approved' | 'blocked' | 'warning';
  artifacts: {
    briefs: string[];
    reviews: string[];
    evolution: string[];
  };
}

const REPORTS_DIR = join(process.cwd(), '.opencode', 'governance-reports');
const SKIPS_LOG = join(process.cwd(), '.opencode', 'governance-skips.log');

/**
 * Garante que diretórios de governança existam
 */
function ensureGovernanceDirs(): void {
  const dirs = [
    REPORTS_DIR,
    join(process.cwd(), '.opencode', 'briefs'),
    join(process.cwd(), '.opencode', 'reviews'),
    join(process.cwd(), '.opencode', 'evolution'),
  ];

  for (const dir of dirs) {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }
}

/**
 * Gera relatório de governança
 */
export function generateReport(
  trigger: GovernanceTrigger,
  validation: ValidationResult,
  author?: string
): GovernanceReport {
  ensureGovernanceDirs();

  const decision: 'approved' | 'blocked' | 'warning' = 
    validation.valid 
      ? (validation.warnings.length > 0 ? 'warning' : 'approved')
      : 'blocked';

  const report: GovernanceReport = {
    timestamp: new Date().toISOString(),
    author: author || process.env.USER || 'desconhecido',
    trigger,
    validation,
    decision,
    artifacts: {
      briefs: [],
      reviews: [],
      evolution: [],
    },
  };

  // Salva relatório em arquivo
  const reportFile = join(
    REPORTS_DIR,
    `governance-${Date.now()}-${decision}.json`
  );
  
  writeFileSync(reportFile, JSON.stringify(report, null, 2));

  return report;
}

/**
 * Registra skip de governança (quando permitido)
 */
export function logGovernanceSkip(
  stagedFiles: string[],
  reason?: string,
  author?: string
): void {
  ensureGovernanceDirs();

  const skipRecord = {
    timestamp: new Date().toISOString(),
    author: author || process.env.USER || 'desconhecido',
    reason: reason || 'NÃO INFORMADO',
    files_changed: stagedFiles,
    warning: 'GOVERNANÇA PULADA - AUDITORIA REGISTRADA',
  };

  appendFileSync(
    SKIPS_LOG,
    JSON.stringify(skipRecord) + '\n'
  );

  console.warn('⚠️  GOVERNANÇA PULADA — AUDITORIA REGISTRADA EM .opencode/governance-skips.log');
}

/**
 * Imprime relatório formatado no console
 */
export function printReport(report: GovernanceReport): void {
  const icon = {
    approved: '✅',
    blocked: '🚫',
    warning: '⚠️',
  }[report.decision];

  console.log(`\n${icon} RELATÓRIO DE GOVERNANÇA\n`);
  console.log(`Timestamp: ${report.timestamp}`);
  console.log(`Autor: ${report.author}`);
  console.log(`Decisão: ${report.decision.toUpperCase()}\n`);

  if (report.trigger.changedFiles.length > 0) {
    console.log('Arquivos Afetados:');
    report.trigger.changedFiles.forEach(f => {
      console.log(`  - ${f.path} (${f.type})`);
    });
    console.log('');
  }

  if (report.validation.errors.length > 0) {
    console.log('Erros Críticos:');
    report.validation.errors.forEach(err => {
      console.log(`  ${err}`);
    });
    console.log('');
  }

  if (report.validation.warnings.length > 0) {
    console.log('Avisos:');
    report.validation.warnings.forEach(warn => {
      console.log(`  ${warn}`);
    });
    console.log('');
  }

  if (report.decision === 'blocked') {
    console.log('🛑 COMMIT BLOQUEADO: Corrija os erros acima antes de commitar.\n');
  } else if (report.decision === 'warning') {
    console.log('⚠️  COMMIT PERMITIDO COM RESSALVAS: Revise os avisos acima.\n');
  } else {
    console.log('✅ COMMIT APROVADO: Governança em conformidade.\n');
  }
}

/**
 * Carrega histórico de skips para auditoria
 */
export function loadSkipHistory(): Array<{
  timestamp: string;
  author: string;
  reason: string;
  files_changed: string[];
}> {
  if (!existsSync(SKIPS_LOG)) {
    return [];
  }

  try {
    const content = require('fs').readFileSync(SKIPS_LOG, 'utf-8');
    return content
      .split('\n')
      .filter(line => line.trim())
      .map(line => JSON.parse(line));
  } catch {
    return [];
  }
}

export default {
  generateReport,
  logGovernanceSkip,
  printReport,
  loadSkipHistory,
};

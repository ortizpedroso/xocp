/**
 * Governance Validator
 * Valida se mudanças internas do XOCP possuem artefatos de governança obrigatórios
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import type { FileChange } from './internal-change-detector.js';

/**
 * Extrai a lista de arquivos cobertos por um brief de governança.
 * Convenção: seção "## Arquivos Afetados" com itens de lista `- caminho`.
 */
export function extractCoveredFiles(briefContent: string): string[] {
  const covered: string[] = [];
  let inSection = false;
  for (const line of briefContent.split('\n')) {
    if (/^#{1,3}\s*arquivos\s+afetados/i.test(line.trim())) {
      inSection = true;
      continue;
    }
    if (inSection) {
      if (/^#{1,3}\s/.test(line.trim())) break; // próxima seção
      const match = line.trim().match(/^[-*]\s*`?([^`\s]+)`?/);
      if (match && match[1]) covered.push(match[1]);
    }
  }
  return covered;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface GovernanceArtifact {
  type: 'brief' | 'review' | 'evolution';
  path: string;
  timestamp: Date;
  coversFiles: string[];
}

const REQUIRED_ARTIFACTS = {
  brief: '.opencode/briefs/',
  review: '.opencode/reviews/',
  evolution: '.opencode/evolution/',
};

/**
 * Busca artefatos de governança recentes (últimas 24h)
 */
function findRecentArtifacts(artifactType: 'brief' | 'review' | 'evolution'): GovernanceArtifact[] {
  const dirPath = join(process.cwd(), REQUIRED_ARTIFACTS[artifactType]);
  const artifacts: GovernanceArtifact[] = [];
  
  if (!existsSync(dirPath)) {
    return [];
  }

  try {
    const files = readdirSync(dirPath);
    const now = Date.now();
    const twentyFourHours = 24 * 60 * 60 * 1000;

    for (const file of files) {
      if (!file.endsWith('.md')) continue;

      const filePath = join(dirPath, file);
      const stats = statSync(filePath);
      const age = now - stats.mtimeMs;

      if (age <= twentyFourHours) {
        let coversFiles: string[] = [];
        try {
          coversFiles = extractCoveredFiles(readFileSync(filePath, 'utf-8'));
        } catch {
          // arquivo ilegível — segue sem cobertura declarada
        }
        artifacts.push({
          type: artifactType,
          path: filePath,
          timestamp: new Date(stats.mtime),
          coversFiles,
        });
      }
    }
  } catch {
    // Ignora erros de leitura
  }

  return artifacts;
}

/**
 * Valida se mudanças possuem governança adequada
 */
export function validateGovernance(
  changedFiles: FileChange[],
  severity: 'low' | 'medium' | 'high' | 'critical'
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Se não há mudanças críticas, apenas avisa
  if (changedFiles.length === 0) {
    return { valid: true, errors, warnings };
  }

  // Para severidade high/critical, exige brief OBRIGATORIAMENTE
  if (severity === 'high' || severity === 'critical') {
    const recentBriefs = findRecentArtifacts('brief');
    
    if (recentBriefs.length === 0) {
      errors.push(
        `❌ BLOQUEADO: Mudanças ${severity.toUpperCase()} requerem Brief de Governança.\n` +
        `   Arquivos afetados: ${changedFiles.map(f => f.path).join(', ')}\n` +
        `   Crie um brief em: ${REQUIRED_ARTIFACTS.brief}`
      );
    } else {
      // Verifica se o brief cobre os arquivos mudados
      const coveredFiles = recentBriefs.flatMap(b => b.coversFiles);
      const uncoveredFiles = changedFiles.filter(
        f => !coveredFiles.some(covered => covered.includes(f.path))
      );

      if (uncoveredFiles.length > 0) {
        warnings.push(
          `⚠️  AVISO: Alguns arquivos podem não estar cobertos pelo brief:\n` +
          `   ${uncoveredFiles.map(f => f.path).join(', ')}`
        );
      }
    }
  }

  // Para qualquer mudança interna, sugere review
  if (severity !== 'low') {
    const recentReviews = findRecentArtifacts('review');
    
    if (recentReviews.length === 0 && severity === 'critical') {
      warnings.push(
        `⚠️  RECOMENDAÇÃO: Mudanças críticas devem ter review registrado em ${REQUIRED_ARTIFACTS.review}`
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Gera mensagem de erro formatada para falha de validação
 */
export function formatValidationError(result: ValidationResult): string {
  let message = '🚫 VALIDAÇÃO DE GOVERNANÇA FALHOU\n\n';
  
  if (result.errors.length > 0) {
    message += 'ERROS CRÍTICOS:\n';
    result.errors.forEach(err => {
      message += `  ${err}\n`;
    });
  }

  if (result.warnings.length > 0) {
    message += '\nAVISOS:\n';
    result.warnings.forEach(warn => {
      message += `  ${warn}\n`;
    });
  }

  message += '\n📚 Consulte specs/xocp/documentacao.md para detalhes sobre governança.';
  
  return message;
}

export default {
  validateGovernance,
  formatValidationError,
  findRecentArtifacts,
};

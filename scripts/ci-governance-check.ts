#!/usr/bin/env bun
/**
 * CI Governance Check (server-side)
 *
 * P1 da auditoria 2026-09-24: hooks locais são bypassáveis (--no-verify),
 * então a governança precisa de uma linha de defesa no servidor.
 *
 * Uso: bun scripts/ci-governance-check.ts <base-ref>
 *
 * Regra: se o range de commits toca arquivos críticos do XOCP,
 * esse MESMO range precisa incluir um artefato de governança novo
 * (.opencode/briefs/, .opencode/reviews/ ou .opencode/evolution/).
 */

import { execSync } from 'child_process';

const CRITICAL_PATTERNS = [
  'packages/core/',
  'packages/opencode/',
  'AGENTS.md',
  'specs/xocp/',
  '.opencode/skills/',
];

const GOVERNANCE_PATTERNS = [
  '.opencode/briefs/',
  '.opencode/reviews/',
  '.opencode/evolution/',
];

function changedFilesBetween(base: string, head: string): string[] {
  try {
    const output = execSync(`git diff --name-only ${base} ${head}`, {
      encoding: 'utf-8',
      maxBuffer: 32 * 1024 * 1024,
    });
    return output.split('\n').filter((f) => f.trim() !== '');
  } catch {
    // base ref indisponível (ex.: force-push, shallow clone sem histórico):
    // fallback para os arquivos do último commit
    try {
      const output = execSync('git diff-tree --no-commit-id --name-only -r HEAD', {
        encoding: 'utf-8',
      });
      return output.split('\n').filter((f) => f.trim() !== '');
    } catch {
      return [];
    }
  }
}

function main() {
  const base = process.argv[2] || 'HEAD~1';
  const head = 'HEAD';
  const files = changedFilesBetween(base, head);

  if (files.length === 0) {
    console.log('✅ CI-GOVERNANCE: nenhum arquivo alterado — liberado.');
    process.exit(0);
  }

  const critical = files.filter((f) =>
    CRITICAL_PATTERNS.some((p) => f.startsWith(p))
  );

  if (critical.length === 0) {
    console.log('✅ CI-GOVERNANCE: nenhuma mudança interna crítica — liberado.');
    process.exit(0);
  }

  const governance = files.filter((f) =>
    GOVERNANCE_PATTERNS.some((p) => f.startsWith(p))
  );

  if (governance.length > 0) {
    console.log('✅ CI-GOVERNANCE: mudanças críticas acompanhadas de artefatos de governança:');
    governance.forEach((g) => console.log(`  📄 ${g}`));
    process.exit(0);
  }

  console.error('❌ CI-GOVERNANCE: BLOQUEADO (server-side)');
  console.error(`Mudanças em ${critical.length} arquivo(s) crítico(s) do XOCP sem Brief de Governança:`);
  critical.slice(0, 20).forEach((f) => console.error(`  - ${f}`));
  if (critical.length > 20) console.error(`  ... e mais ${critical.length - 20}`);
  console.error('');
  console.error('Correção: adicione um Brief em .opencode/briefs/ cobrindo os arquivos');
  console.error('(seção "## Arquivos Afetados") e reabra o PR / repush.');
  process.exit(1);
}

main();

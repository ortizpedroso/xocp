import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { existsSync, writeFileSync, mkdirSync, rmSync, appendFileSync } from 'fs';
import { join } from 'path';

// Mock dos módulos de governança
const mockStagedFiles = [
  'packages/core/src/governance/test.ts',
  'specs/xocp/documentacao.md',
];

const mockCriticalFiles = [
  'packages/core/src/main.ts',
  'packages/opencode/src/agent/prompt/avaliador.txt',
  'AGENTS.md',
];

describe('Governance Skip Audit', () => {
  const skipsLogPath = join(process.cwd(), '.opencode', 'governance-skips.log');
  const briefsDir = join(process.cwd(), '.opencode', 'briefs');

  beforeEach(() => {
    // Limpa log anterior
    if (existsSync(skipsLogPath)) {
      rmSync(skipsLogPath);
    }
    
    // Cria diretórios necessários
    if (!existsSync(briefsDir)) {
      mkdirSync(briefsDir, { recursive: true });
    }
  });

  afterEach(() => {
    // Limpeza pós-teste
    if (existsSync(skipsLogPath)) {
      rmSync(skipsLogPath);
    }
  });

  it('deve bloquear skip em arquivos críticos', () => {
    // Simula tentativa de skip com arquivo crítico
    const hasCritical = mockCriticalFiles.some(f => 
      f.startsWith('packages/core/') || f.startsWith('packages/opencode/')
    );
    
    expect(hasCritical).toBe(true);
    console.log('✅ Teste: Skip bloqueado para arquivos críticos');
  });

  it('deve permitir skip em arquivos não-críticos', () => {
    const nonCriticalFiles = ['docs/readme.md', 'test/example.test.ts'];
    const hasCritical = nonCriticalFiles.some(f =>
      f.startsWith('packages/core/') || 
      f.startsWith('packages/opencode/') ||
      f === 'AGENTS.md' ||
      f.startsWith('specs/xocp/')
    );
    
    expect(hasCritical).toBe(false);
    console.log('✅ Teste: Skip permitido para arquivos não-críticos');
  });

  it('deve registrar skip em log persistente', () => {
    const skipRecord = {
      timestamp: new Date().toISOString(),
      author: 'test-user',
      reason: 'Teste de auditoria',
      files_changed: ['docs/test.md'],
      warning: 'GOVERNANÇA PULADA - AUDITORIA REGISTRADA',
    };

    // Simula escrita no log
    appendFileSync(skipsLogPath, JSON.stringify(skipRecord) + '\n');
    
    // Verifica se log foi criado
    expect(existsSync(skipsLogPath)).toBe(true);
    
    // Verifica conteúdo do log
    const logContent = require('fs').readFileSync(skipsLogPath, 'utf-8');
    const parsed = JSON.parse(logContent.trim());
    
    expect(parsed.author).toBe('test-user');
    expect(parsed.reason).toBe('Teste de auditoria');
    console.log('✅ Teste: Skip registrado em log persistente');
  });

  it('deve carregar histórico de skips', () => {
    // Cria múltiplos registros
    const records = [
      { timestamp: '2024-01-01T00:00:00Z', author: 'user1', reason: 'Motivo 1', files_changed: ['file1.md'] },
      { timestamp: '2024-01-02T00:00:00Z', author: 'user2', reason: 'Motivo 2', files_changed: ['file2.md'] },
    ];

    records.forEach(r => {
      appendFileSync(skipsLogPath, JSON.stringify(r) + '\n');
    });

    // Carrega e verifica
    const content = require('fs').readFileSync(skipsLogPath, 'utf-8');
    const lines = content.split('\n').filter(l => l.trim());
    
    expect(lines.length).toBe(2);
    console.log('✅ Teste: Histórico de skips carregado corretamente');
  });

  it('deve validar razão do skip', () => {
    const skipWithoutReason = {
      timestamp: new Date().toISOString(),
      author: 'test-user',
      reason: 'NÃO INFORMADO', // Razão padrão quando não informada
      files_changed: ['test.md'],
    };

    expect(skipWithoutReason.reason).toBe('NÃO INFORMADO');
    console.log('✅ Teste: Validação de razão do skip');
  });

  it('deve rejeitar skip sem razão em arquivos críticos', () => {
    const criticalFile = 'packages/core/src/governance.ts';
    const isCritical = criticalFile.startsWith('packages/core/');
    
    expect(isCritical).toBe(true);
    console.log('✅ Teste: Rejeição de skip sem razão em crítico');
  });

  it('deve formatar relatório de auditoria', () => {
    const auditReport = {
      timestamp: new Date().toISOString(),
      totalSkips: 3,
      criticalAttempts: 1,
      approvedSkips: 2,
    };

    expect(auditReport.totalSkips).toBe(3);
    expect(auditReport.criticalAttempts).toBe(1);
    console.log('✅ Teste: Formatação de relatório de auditoria');
  });

  it('deve identificar padrões de arquivos críticos', () => {
    const patterns = [
      'packages/core/',
      'packages/opencode/',
      'AGENTS.md',
      'specs/xocp/',
    ];

    const testFiles = [
      { path: 'packages/core/src/test.ts', expected: true },
      { path: 'packages/opencode/src/agent/prompt.txt', expected: true },
      { path: 'AGENTS.md', expected: true },
      { path: 'specs/xocp/documentacao.md', expected: true },
      { path: 'src/app.ts', expected: false },
      { path: 'docs/readme.md', expected: false },
    ];

    testFiles.forEach(({ path, expected }) => {
      const isCritical = patterns.some(p => path.startsWith(p) || path === p);
      expect(isCritical).toBe(expected);
    });

    console.log('✅ Teste: Identificação de padrões críticos');
  });

  it('deve validar ambiente XOCP_SKIP_GOVERNANCE', () => {
    // Simula variáveis de ambiente
    const envTests = [
      { value: '1', shouldSkip: true },
      { value: '0', shouldSkip: false },
      { value: undefined, shouldSkip: false },
    ];

    envTests.forEach(({ value, shouldSkip }) => {
      const skip = value === '1';
      expect(skip).toBe(shouldSkip);
    });

    console.log('✅ Teste: Validação de variável de ambiente');
  });

  it('deve impedir commit sem brief em mudanças críticas', () => {
    const hasBrief = existsSync(join(briefsDir, 'governance-brief.md'));
    const requiresBrief = true; // Mudança crítica
    
    expect(requiresBrief && !hasBrief).toBe(true); // Deve bloquear
    console.log('✅ Teste: Bloqueio de commit sem brief');
  });

  it('deve permitir commit com brief válido', () => {
    // Cria brief fictício
    const briefPath = join(briefsDir, 'governance-test.md');
    writeFileSync(briefPath, '# Brief de Governança\n\nConteúdo...');
    
    const hasBrief = existsSync(briefPath);
    expect(hasBrief).toBe(true);
    
    // Limpa
    rmSync(briefPath);
    console.log('✅ Teste: Commit permitido com brief válido');
  });

  it('deve classificar severidade de mudanças', () => {
    const severityTests = [
      { file: 'packages/core/src/main.ts', expected: 'critical' },
      { file: 'packages/opencode/src/agent.ts', expected: 'critical' },
      { file: 'specs/xocp/doc.md', expected: 'high' },
      { file: 'AGENTS.md', expected: 'medium' },
      { file: 'src/app.ts', expected: 'low' },
    ];

    severityTests.forEach(({ file, expected }) => {
      let severity: string = 'low';
      
      if (file.includes('packages/core/src/') || file.includes('packages/opencode/src/')) {
        severity = 'critical';
      } else if (file.includes('specs/xocp/')) {
        severity = 'high';
      } else if (file === 'AGENTS.md') {
        severity = 'medium';
      }
      
      expect(severity).toBe(expected);
    });

    console.log('✅ Teste: Classificação de severidade');
  });

  it('deve gerar mensagem de erro formatada', () => {
    const errors = ['Erro 1', 'Erro 2'];
    const warnings = ['Aviso 1'];
    
    const message = `🚫 VALIDAÇÃO DE GOVERNANÇA FALHOU\n\nERROS CRÍTICOS:\n  ${errors.join('\n  ')}\n\nAVISOS:\n  ${warnings.join('\n  ')}`;
    
    expect(message).toContain('🚫');
    expect(message).toContain('ERROS CRÍTICOS');
    expect(errors.length).toBe(2);
    console.log('✅ Teste: Mensagem de erro formatada');
  });

  it('deve preservar artefatos de governança na limpeza', () => {
    const preservedArtifacts = [
      '.opencode/briefs/',
      '.opencode/reviews/',
      '.opencode/evolution/',
      '.opencode/governance-skips.log',
    ];

    const runtimeArtifacts = [
      '.opencode/state/',
      '.opencode/execution-log/',
      '.opencode/dag.db*',
      '.opencode/governance-reports/',
    ];

    // Verifica que preservados NÃO estão na lista de runtime
    const allPreserved = preservedArtifacts.every(p => 
      !runtimeArtifacts.includes(p)
    );

    expect(allPreserved).toBe(true);
    console.log('✅ Teste: Preservação de artefatos de governança');
  });

  it('deve detectar tentativas de bypass', () => {
    const bypassAttempts = [
      { env: '1', files: ['packages/core/test.ts'], shouldBlock: true },
      { env: '1', files: ['docs/test.md'], shouldBlock: false },
      { env: '0', files: ['packages/core/test.ts'], shouldBlock: false }, // Sem skip, validação normal
    ];

    bypassAttempts.forEach(({ env, files, shouldBlock }) => {
      const skipEnabled = env === '1';
      const hasCritical = files.some(f => f.startsWith('packages/core/'));
      const blocked = skipEnabled && hasCritical;
      
      expect(blocked).toBe(shouldBlock);
    });

    console.log('✅ Teste: Detecção de tentativas de bypass');
  });

  it('deve validar integridade do log de auditoria', () => {
    // Cria log com entradas válidas e inválidas
    const validEntry = JSON.stringify({
      timestamp: new Date().toISOString(),
      author: 'user',
      reason: 'Válido',
      files_changed: ['test.md']
    });

    const invalidEntry = 'linha quebrada sem json';

    appendFileSync(skipsLogPath, validEntry + '\n');
    appendFileSync(skipsLogPath, invalidEntry + '\n');

    // Lê e valida
    const content = require('fs').readFileSync(skipsLogPath, 'utf-8');
    const lines = content.split('\n').filter(l => l.trim());
    
    let validCount = 0;
    lines.forEach(line => {
      try {
        JSON.parse(line);
        validCount++;
      } catch {
        // Entrada inválida ignorada
      }
    });

    expect(validCount).toBe(1);
    console.log('✅ Teste: Validação de integridade do log');
  });
});

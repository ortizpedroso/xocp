/**
 * Classification Module for Human Escalation
 * 
 * Classifica intervenções humanas em três níveis:
 * - L1_LOCAL_ADJUST: Executor pode retomar com contexto local
 * - L2_REPLANNING: Analista precisa ajustar Briefs afetados
 * - L3_REDIRECTION: Analista precisa re-mapear toda a abordagem
 */

export enum EscalationLevel {
  /**
   * Nível 1: Ajuste Local
   * 
   * O Executor pode retomar o trabalho com pequenas correções.
   * Contexto permanece válido, apenas ajustes pontuais necessários.
   * 
   * Exemplos:
   * - Correção de bug simples em código existente
   * - Ajuste de implementação que não afeta contratos
   * - Refatoração menor sem mudança de comportamento
   */
  L1_LOCAL_ADJUST = 'L1_LOCAL_ADJUST',
  
  /**
   * Nível 2: Replanejamento
   * 
   * Analista precisa ajustar Briefs afetados antes de continuar.
   * Alguns contratos ou critérios precisam ser revisados.
   * 
   * Exemplos:
   * - Mudança em requisitos de um cluster específico
   * - Descoberta de dependência não mapeada
   * - Critérios de aceitação precisam ser reformulados
   */
  L2_REPLANNING = 'L2_REPLANNING',
  
  /**
   * Nível 3: Redirecionamento
   * 
   * Analista precisa re-mapear completamente a abordagem.
   * Hipóteses fundamentais foram refutadas.
   * 
   * Exemplos:
   * - Arquitetura escolhida se mostrou inadequada
   * - Restrições técnicas críticas descobertas tardiamente
   * - Mudança significativa nos objetivos do projeto
   */
  L3_REDIRECTION = 'L3_REDIRECTION',
}

export interface EscalationContext {
  level: EscalationLevel;
  reason: string;
  affectedClusters: string[];
  affectedBriefs?: string[];
  hypotheses?: {
    id: string;
    status: 'refuted' | 'needs_revision';
    evidence: string;
  }[];
  recommendedAction: string;
  timestamp: string;
  escalatedBy: string;
}

/**
 * Thresholds objetivos para classificação automática
 */
export const CLASSIFICATION_THRESHOLDS = {
  /**
   * L1: Até 2 critérios falhando, nenhum contrato quebrado
   */
  L1_MAX_FAILED_CRITERIA: 2,
  
  /**
   * L2: 3-5 critérios falhando OU 1 contrato quebrado
   */
  L2_MAX_FAILED_CRITERIA: 5,
  
  /**
   * L3: >5 critérios falhando OU >1 contrato quebrado OU hipótese fundamental refutada
   */
  L3_MIN_FAILED_CRITERIA: 6,
};

/**
 * Classifica uma escalação baseada em evidências objetivas
 */
export function classifyEscalation(params: {
  failedCriteriaCount: number;
  brokenContractsCount: number;
  fundamentalHypothesisRefuted: boolean;
  affectedClusters: string[];
  description: string;
}): EscalationLevel {
  const {
    failedCriteriaCount,
    brokenContractsCount,
    fundamentalHypothesisRefuted,
    affectedClusters,
  } = params;
  
  // L3: Hipótese fundamental refutada sempre requer redirecionamento
  if (fundamentalHypothesisRefuted) {
    return EscalationLevel.L3_REDIRECTION;
  }
  
  // L3: Múltiplos contratos quebrados
  if (brokenContractsCount > 1) {
    return EscalationLevel.L3_REDIRECTION;
  }
  
  // L3: Muitos critérios falhando
  if (failedCriteriaCount >= CLASSIFICATION_THRESHOLDS.L3_MIN_FAILED_CRITERIA) {
    return EscalationLevel.L3_REDIRECTION;
  }
  
  // L2: Contrato quebrado ou vários critérios falhando
  if (brokenContractsCount === 1 || 
      failedCriteriaCount > CLASSIFICATION_THRESHOLDS.L1_MAX_FAILED_CRITERIA) {
    return EscalationLevel.L2_REPLANNING;
  }
  
  // L2: Múltiplos clusters afetados
  if (affectedClusters.length > 1) {
    return EscalationLevel.L2_REPLANNING;
  }
  
  // L1: Casos restantes (poucos critérios falhando, impacto local)
  return EscalationLevel.L1_LOCAL_ADJUST;
}

/**
 * Cria um contexto de escalação estruturado
 */
export function createEscalationContext(
  level: EscalationLevel,
  reason: string,
  escalatedBy: string,
  options: Partial<EscalationContext> = {}
): EscalationContext {
  return {
    level,
    reason,
    affectedClusters: options.affectedClusters || [],
    affectedBriefs: options.affectedBriefs,
    hypotheses: options.hypotheses,
    recommendedAction: getRecommendedAction(level),
    timestamp: new Date().toISOString(),
    escalatedBy,
  };
}

/**
 * Obtém ação recomendada baseada no nível de escalação
 */
function getRecommendedAction(level: EscalationLevel): string {
  switch (level) {
    case EscalationLevel.L1_LOCAL_ADJUST:
      return 'Executor deve revisar código com foco nos critérios falhos e retomar implementação';
    
    case EscalationLevel.L2_REPLANNING:
      return 'Analista deve revisar e ajustar Briefs afetados antes de nova execução';
    
    case EscalationLevel.L3_REDIRECTION:
      return 'Analista deve conduzir sessão de re-mapeamento completo da abordagem';
    
    default:
      return 'Ação não definida';
  }
}

/**
 * Valida se um estado permite retomada pelo Executor
 */
export function canResumeWithLocalAdjust(state: {
  escalationLevel?: EscalationLevel;
  hasValidContext: boolean;
  criticalErrorsResolved: boolean;
}): boolean {
  return (
    state.escalationLevel === EscalationLevel.L1_LOCAL_ADJUST &&
    state.hasValidContext &&
    state.criticalErrorsResolved
  );
}

/**
 * Determina quais Briefs precisam ser revisados
 */
export function getAffectedBriefs(
  level: EscalationLevel,
  affectedClusters: string[],
  allBriefs: Array<{ id: string; cluster: string }>
): string[] {
  if (level === EscalationLevel.L3_REDIRECTION) {
    // L3: Todos os Briefs podem precisar revisão
    return allBriefs.map(b => b.id);
  }
  
  if (level === EscalationLevel.L2_REPLANNING) {
    // L2: Apenas Briefs dos clusters afetados
    return allBriefs
      .filter(b => affectedClusters.includes(b.cluster))
      .map(b => b.id);
  }
  
  // L1: Nenhum Brief precisa revisão
  return [];
}

/**
 * Serializa contexto de escalação para log/auditoria
 */
export function serializeEscalationContext(context: EscalationContext): string {
  return JSON.stringify({
    ...context,
    timestamp: context.timestamp,
    level: EscalationLevel[context.level],
  }, null, 2);
}

/**
 * Parse de contexto de escalação serializado
 */
export function parseEscalationContext(data: string): EscalationContext | null {
  try {
    const parsed = JSON.parse(data);
    
    // Validar estrutura básica
    if (!parsed.level || !Object.values(EscalationLevel).includes(parsed.level)) {
      return null;
    }
    
    return parsed as EscalationContext;
  } catch {
    return null;
  }
}

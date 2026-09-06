export const ELICITADOR_AGENT_ID = "elicitador"

/**
 * Heuristic v1 for suggesting the Elicitador agent on a new session's first message.
 * Cheap client-side keyword matching only — no LLM. Tune with real usage data.
 */
export const ELICITADOR_PROJECT_SIGNALS_V1 = [
  /quero criar (um|uma) (sistema|app|site|plataforma|aplicativo|aplicação)/i,
  /quero (um|uma) (app|site|plataforma|sistema|aplicativo|aplicação)\b/i,
  /preciso de (um|uma) (sistema|plataforma|app|site|aplicativo|aplicação)/i,
  /desenvolver (um|uma) (sistema|app|site|plataforma|aplicativo|aplicação)/i,
  /criar (um|uma) (sistema|app|site|plataforma|aplicativo|aplicação)/i,
  /montar (um|uma) (sistema|app|site|plataforma)/i,
  /construir (um|uma) (sistema|app|site|plataforma)/i,
  /novo (projeto|sistema|app|site|plataforma)/i,
  /nova (plataforma|aplicação|aplicativo)/i,
  /want to (build|create) (a|an) (system|app|site|platform|application)/i,
  /need (a|an) (system|app|site|platform|application)/i,
  /build (a|an) (new )?(system|app|site|platform|application)/i,
  /create (a|an) (new )?(system|app|site|platform|application)/i,
] as const

/** Signals that the user is asking for a point task, not greenfield system design. */
export const ELICITADOR_POINT_TASK_SIGNALS_V1 = [
  /\b(corrige|corrigir|corrig|fix|debug|debugger|bug|erro|error|falha|failure|broken)\b/i,
  /\b(arquivo|file|ficheiro)\b/i,
  /\b(linha|line)\s*\d+/i,
  /:\d+\b/,
  /@[\w./-]+\.\w+/,
  /\b[\w./-]+\.(ts|tsx|js|jsx|py|go|rs|java|md|json|yaml|yml|css|html|vue|svelte)\b/i,
  /\b(this|esse|esta|neste|nesta) (bug|erro|arquivo|file)\b/i,
] as const

/**
 * Weak hints that the message might describe a system, but without strong greenfield signals.
 * Calibration examples (v1 — tune with real usage):
 *
 * ambiguous (ask):
 * - "preciso melhorar o sistema de login"
 * - "quero uma dashboard para vendas"
 * - "precisamos de um portal para clientes"
 * - "implementar módulo de relatórios"
 *
 * not ambiguous (silence — no project, no point-task, no weak hints):
 * - "bom dia"
 * - "o que é typescript?"
 * - "como funciona o git?"
 * - "me explica async await"
 */
export const ELICITADOR_AMBIGUOUS_HINTS_V1 = [
  /\b(sistema|plataforma|aplicativo|aplicação|software|portal|módulo|modulo)\b/i,
  /\b(app|site|dashboard|painel)\b/i,
  /\b(system|platform|application|software|dashboard|portal|module)\b/i,
  /\b(melhorar|implementar|desenvolver|construir|montar)\b/i,
  /\b(improve|implement|develop|build)\b/i,
] as const

const MIN_PROMPT_LENGTH = 12

export type ElicitadorTriage = "project" | "point_task" | "ambiguous" | "insufficient"

export function hasElicitadorPointTaskSignals(text: string) {
  return ELICITADOR_POINT_TASK_SIGNALS_V1.some((pattern) => pattern.test(text))
}

export function hasElicitadorProjectSignals(text: string) {
  return ELICITADOR_PROJECT_SIGNALS_V1.some((pattern) => pattern.test(text))
}

export function hasElicitadorAmbiguousHints(text: string) {
  return ELICITADOR_AMBIGUOUS_HINTS_V1.some((pattern) => pattern.test(text))
}

export function triageElicitador(text: string): ElicitadorTriage {
  const normalized = text.trim()
  if (normalized.length < MIN_PROMPT_LENGTH) return "insufficient"
  if (hasElicitadorPointTaskSignals(normalized)) return "point_task"
  if (hasElicitadorProjectSignals(normalized)) return "project"
  if (hasElicitadorAmbiguousHints(normalized)) return "ambiguous"
  return "insufficient"
}

export function suggestsElicitador(text: string) {
  return triageElicitador(text) === "project"
}

export function shouldOfferElicitadorSuggestion(input: {
  text: string
  agent: string
  userMessageCount: number
  dismissed: boolean
}) {
  if (input.dismissed) return false
  if (input.userMessageCount > 0) return false
  if (input.agent !== "build") return false
  return suggestsElicitador(input.text)
}

export function shouldAskElicitadorAmbiguity(input: {
  text: string
  agent: string
  userMessageCount: number
  resolved: boolean
}) {
  if (input.resolved) return false
  if (input.userMessageCount > 0) return false
  if (input.agent !== "build") return false
  return triageElicitador(input.text) === "ambiguous"
}

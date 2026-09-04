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

const MIN_PROMPT_LENGTH = 12

export function hasElicitadorPointTaskSignals(text: string) {
  return ELICITADOR_POINT_TASK_SIGNALS_V1.some((pattern) => pattern.test(text))
}

export function hasElicitadorProjectSignals(text: string) {
  return ELICITADOR_PROJECT_SIGNALS_V1.some((pattern) => pattern.test(text))
}

export function suggestsElicitador(text: string) {
  const normalized = text.trim()
  if (normalized.length < MIN_PROMPT_LENGTH) return false
  if (hasElicitadorPointTaskSignals(normalized)) return false
  return hasElicitadorProjectSignals(normalized)
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

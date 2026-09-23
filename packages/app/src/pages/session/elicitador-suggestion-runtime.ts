import { createSignal } from "solid-js"

const dismissed = new Set<string>()
const ambiguityResolved = new Set<string>()

function dismissStorageKey(scope: string) {
  return `elicitador-suggestion-dismissed:${scope}`
}

function ambiguityStorageKey(scope: string) {
  return `elicitador-ambiguity-resolved:${scope}`
}

export function elicitadorSuggestionScope(sessionID: string | undefined, sessionKey: string | undefined) {
  if (sessionID) return sessionID
  if (sessionKey) return `draft:${sessionKey}`
  return "draft:default"
}

const [dismissRevision, setDismissRevision] = createSignal(0)
const [ambiguityRevision, setAmbiguityRevision] = createSignal(0)

let agentOverride: string | undefined
let submitTrigger: (() => void) | undefined

export type ElicitadorAmbiguityChoice = "project" | "point_task"

type AmbiguityPending = {
  scope: string
  resolve: (choice: ElicitadorAmbiguityChoice) => void
}

let ambiguityPending: AmbiguityPending | undefined

export function isElicitadorSuggestionDismissed(scope: string) {
  dismissRevision()
  if (dismissed.has(scope)) return true
  try {
    return sessionStorage.getItem(dismissStorageKey(scope)) === "1"
  } catch {
    return false
  }
}

export function dismissElicitadorSuggestion(scope: string) {
  dismissed.add(scope)
  try {
    sessionStorage.setItem(dismissStorageKey(scope), "1")
  } catch {
    // Ignore storage failures; in-memory dismiss still applies for this tab.
  }
  setDismissRevision((value) => value + 1)
}

export function isElicitadorAmbiguityResolved(scope: string) {
  ambiguityRevision()
  if (ambiguityResolved.has(scope)) return true
  if (isElicitadorSuggestionDismissed(scope)) return true
  try {
    return sessionStorage.getItem(ambiguityStorageKey(scope)) === "1"
  } catch {
    return false
  }
}

export function resolveElicitadorAmbiguityScope(scope: string) {
  ambiguityResolved.add(scope)
  dismissElicitadorSuggestion(scope)
  try {
    sessionStorage.setItem(ambiguityStorageKey(scope), "1")
  } catch {
    // Ignore storage failures; in-memory resolution still applies for this tab.
  }
  setAmbiguityRevision((value) => value + 1)
}

export function elicitadorAmbiguityPending() {
  ambiguityRevision()
  return ambiguityPending
}

export function requestElicitadorAmbiguityResolution(scope: string) {
  return new Promise<ElicitadorAmbiguityChoice>((resolve) => {
    ambiguityPending = { scope, resolve }
    setAmbiguityRevision((value) => value + 1)
  })
}

export function answerElicitadorAmbiguity(choice: ElicitadorAmbiguityChoice) {
  const pending = ambiguityPending
  if (!pending) return
  ambiguityPending = undefined
  resolveElicitadorAmbiguityScope(pending.scope)
  setAmbiguityRevision((value) => value + 1)
  pending.resolve(choice)
}

export function setElicitadorSubmitAgent(agent: string | undefined) {
  agentOverride = agent
}

export function consumeElicitadorSubmitAgent() {
  const agent = agentOverride
  agentOverride = undefined
  return agent
}

export function registerElicitadorSubmitTrigger(trigger: (() => void) | undefined) {
  submitTrigger = trigger
}

export function triggerElicitadorSubmit() {
  submitTrigger?.()
}

import { createSignal } from "solid-js"

const dismissed = new Set<string>()

function storageKey(scope: string) {
  return `elicitador-suggestion-dismissed:${scope}`
}

export function elicitadorSuggestionScope(sessionID: string | undefined, sessionKey: string | undefined) {
  if (sessionID) return sessionID
  if (sessionKey) return `draft:${sessionKey}`
  return "draft:default"
}

const [dismissRevision, setDismissRevision] = createSignal(0)

let agentOverride: string | undefined
let submitTrigger: (() => void) | undefined

export function isElicitadorSuggestionDismissed(scope: string) {
  dismissRevision()
  if (dismissed.has(scope)) return true
  try {
    return sessionStorage.getItem(storageKey(scope)) === "1"
  } catch {
    return false
  }
}

export function dismissElicitadorSuggestion(scope: string) {
  dismissed.add(scope)
  try {
    sessionStorage.setItem(storageKey(scope), "1")
  } catch {
    // Ignore storage failures; in-memory dismiss still applies for this tab.
  }
  setDismissRevision((value) => value + 1)
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

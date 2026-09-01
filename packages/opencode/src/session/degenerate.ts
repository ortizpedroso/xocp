import { ProviderV2 } from "@opencode-ai/core/provider"
import { ModelV2 } from "@opencode-ai/core/model"
import { Provider } from "@/provider/provider"

export const DEGENERATE_REPEAT_THRESHOLD = 3
const MIN_DELTA_LEN = 8
const MIN_PATTERN_LEN = 12

export type DegenerateDeltaState = { last: string; count: number }

export function initialDegenerateDeltaState(): DegenerateDeltaState {
  return { last: "", count: 0 }
}

export function trackDegenerateDelta(
  state: DegenerateDeltaState,
  delta: string,
): { state: DegenerateDeltaState; detected: boolean } {
  if (delta.length < MIN_DELTA_LEN) return { state: { last: delta, count: 1 }, detected: false }
  if (delta === state.last) {
    const count = state.count + 1
    return { state: { last: delta, count }, detected: count >= DEGENERATE_REPEAT_THRESHOLD }
  }
  return { state: { last: delta, count: 1 }, detected: false }
}

export function detectDegenerateText(text: string) {
  const normalized = text.trimEnd()
  if (normalized.length < MIN_PATTERN_LEN * DEGENERATE_REPEAT_THRESHOLD) return false
  const maxLen = Math.floor(normalized.length / DEGENERATE_REPEAT_THRESHOLD)
  for (let len = MIN_PATTERN_LEN; len <= maxLen; len++) {
    const pattern = normalized.slice(-len)
    let count = 1
    let pos = normalized.length - len * 2
    while (pos >= 0 && normalized.slice(pos, pos + len) === pattern) {
      count++
      pos -= len
    }
    if (count >= DEGENERATE_REPEAT_THRESHOLD) return true
  }
  return false
}

const sameModel = (left: { providerID: ProviderV2.ID; modelID: ModelV2.ID }, right: Provider.Model) =>
  left.providerID === right.providerID && left.modelID === right.api.id

export function resolveDegenerateFallbackModel(input: {
  providers: Record<ProviderV2.ID, Provider.Info>
  current: Provider.Model
  configured?: string
}) {
  if (input.configured) {
    const parsed = Provider.parseModel(input.configured)
    if (input.providers[parsed.providerID]?.models[parsed.modelID] && !sameModel(parsed, input.current)) return parsed
  }

  const all = Object.values(input.providers).flatMap((provider) =>
    Object.values(provider.models).map((model) => ({
      providerID: provider.id,
      modelID: model.id,
    })),
  )
  const currentKey = `${input.current.providerID}/${input.current.api.id}`
  const index = all.findIndex((item) => `${item.providerID}/${item.modelID}` === currentKey)
  if (index === -1) return all.find((item) => `${item.providerID}/${item.modelID}` !== currentKey)

  for (let i = index + 1; i < all.length; i++) {
    const key = `${all[i].providerID}/${all[i].modelID}`
    if (key !== currentKey) return all[i]
  }
  for (let i = 0; i < index; i++) {
    const key = `${all[i].providerID}/${all[i].modelID}`
    if (key !== currentKey) return all[i]
  }
  return undefined
}

export function degenerateFallbackNotice(from: Provider.Model, to: Provider.Model) {
  return `Model ${from.name} did not complete the action (repetitive pattern detected). Retrying with model ${to.name}.`
}

export function degenerateFallbackFailedMessage() {
  return "Both the selected model and the fallback model produced repetitive output. Try another model."
}

export function degenerateNoFallbackMessage() {
  return "Repetitive output detected and no fallback model is available."
}

export * as SessionDegenerate from "./degenerate"

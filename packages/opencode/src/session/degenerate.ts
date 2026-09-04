import { Effect } from "effect"
import { Config } from "@/config/config"
import { Provider } from "@/provider/provider"
import type { Provider as ProviderTypes } from "@/provider/provider"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { ModelV2 } from "@opencode-ai/core/model"

export const DEGENERATE_REPEAT_THRESHOLD = 3
export const DEGENERATE_PREFIX_WORDS_MIN = 5
export const DEGENERATE_PREFIX_WORDS_MAX = 10

export type DegenerateTracker = {
  snippets: string[]
  completedTools: number
  toolCountAtLastSnippet: number
}

export function createDegenerateTracker(): DegenerateTracker {
  return { snippets: [], completedTools: 0, toolCountAtLastSnippet: 0 }
}

export function prefixKey(text: string, words = DEGENERATE_PREFIX_WORDS_MIN) {
  const normalized = text.trim().toLowerCase().replace(/\s+/g, " ")
  if (!normalized) return ""
  return normalized.split(" ").slice(0, words).join(" ")
}

export function sharedPrefixKey(text: string) {
  const tokens = text.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (!tokens.length) return ""
  for (let size = DEGENERATE_PREFIX_WORDS_MAX; size >= DEGENERATE_PREFIX_WORDS_MIN; size--) {
    if (tokens.length < size) continue
    return tokens.slice(0, size).join(" ")
  }
  return tokens.join(" ")
}

export function onDegenerateToolCompleted(tracker: DegenerateTracker) {
  tracker.completedTools += 1
}

export function checkDegenerateText(tracker: DegenerateTracker, text: string) {
  const key = sharedPrefixKey(text)
  if (!key) return false

  if (tracker.completedTools !== tracker.toolCountAtLastSnippet) {
    tracker.snippets = [key]
    tracker.toolCountAtLastSnippet = tracker.completedTools
    return false
  }

  tracker.snippets.push(key)
  const recent = tracker.snippets.slice(-DEGENERATE_REPEAT_THRESHOLD)
  if (recent.length < DEGENERATE_REPEAT_THRESHOLD) return false
  const first = recent[0]
  return recent.every((snippet) => snippet.startsWith(first) || first.startsWith(snippet))
}

export function checkDegenerateStreamingText(text: string) {
  const tokens = text.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (tokens.length < DEGENERATE_PREFIX_WORDS_MIN * DEGENERATE_REPEAT_THRESHOLD) return false

  for (let size = DEGENERATE_PREFIX_WORDS_MIN; size <= DEGENERATE_PREFIX_WORDS_MAX; size++) {
    for (let start = 0; start <= tokens.length - size * DEGENERATE_REPEAT_THRESHOLD; start++) {
      const pattern = tokens.slice(start, start + size)
      let matches = 0
      for (let index = 0; index < DEGENERATE_REPEAT_THRESHOLD; index++) {
        const offset = start + index * size
        const slice = tokens.slice(offset, offset + size)
        if (slice.length !== size || slice.join(" ") !== pattern.join(" ")) break
        matches += 1
      }
      if (matches >= DEGENERATE_REPEAT_THRESHOLD) return true
    }
  }
  return false
}

export function degenerateNotice(from: ProviderTypes.Model, to: ProviderTypes.Model) {
  const fromLabel = `${from.providerID}/${from.id}`
  const toLabel = `${to.providerID}/${to.id}`
  return `Model ${fromLabel} did not complete the action (repetitive pattern detected). Retrying with ${toLabel}.`
}

export function degenerateFailure(model: ProviderTypes.Model) {
  return `Model ${model.providerID}/${model.id} did not complete the action (repetitive pattern detected). Automatic retry was not successful.`
}

export const resolveFallbackModel = Effect.fn("SessionDegenerate.resolveFallbackModel")(function* (
  current: ProviderTypes.Model,
) {
  const config = yield* Config.Service
  const provider = yield* Provider.Service
  const cfg = yield* config.get()
  const configured = cfg.experimental?.degenerate_fallback_model
  if (configured) {
    const parsed = Provider.parseModel(configured)
    if (parsed.providerID === current.providerID && parsed.modelID === current.id) return undefined
    return yield* provider.getModel(parsed.providerID, parsed.modelID).pipe(
      Effect.catchTag("ProviderModelNotFoundError", () => Effect.succeed(undefined)),
    )
  }

  const providers = yield* provider.list()

  for (const model of Object.values(providers[current.providerID]?.models ?? {})) {
    if (model.id === current.id) continue
    return {
      ...model,
      providerID: current.providerID,
      id: ModelV2.ID.make(model.id),
    } satisfies ProviderTypes.Model
  }

  for (const [providerID, info] of Object.entries(providers)) {
    for (const model of Object.values(info.models)) {
      if (providerID === current.providerID && model.id === current.id) continue
      return {
        ...model,
        providerID: ProviderV2.ID.make(providerID),
        id: ModelV2.ID.make(model.id),
      } satisfies ProviderTypes.Model
    }
  }
  return undefined
})

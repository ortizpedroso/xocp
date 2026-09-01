import { describe, expect, test } from "bun:test"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { ModelV2 } from "@opencode-ai/core/model"
import {
  detectDegenerateText,
  resolveDegenerateFallbackModel,
  trackDegenerateDelta,
} from "../../src/session/degenerate"
import type { Provider } from "@/provider/provider"

const model = (id: string): Provider.Model =>
  ({
    id: ModelV2.ID.make(id),
    providerID: ProviderV2.ID.make("test"),
    api: { id, url: "", npm: "@ai-sdk/openai-compatible" },
    name: id,
    status: "active",
    cost: { input: 0, output: 0, cache: { read: 0, write: 0 } },
    limit: { context: 100000, output: 10000 },
    options: {},
    headers: {},
    release_date: "2025-01-01",
    capabilities: {
      temperature: false,
      reasoning: false,
      attachment: false,
      toolcall: true,
      input: { text: true, audio: false, image: false, video: false, pdf: false },
      output: { text: true, audio: false, image: false, video: false, pdf: false },
      interleaved: false,
    },
  }) as Provider.Model

const providers = {
  [ProviderV2.ID.make("test")]: {
    id: ProviderV2.ID.make("test"),
    name: "Test",
    source: "config" as const,
    env: [],
    options: {},
    models: {
      [ModelV2.ID.make("primary")]: model("primary"),
      [ModelV2.ID.make("fallback")]: model("fallback"),
    },
  },
}

describe("trackDegenerateDelta", () => {
  test("detects three identical deltas", () => {
    let state = { last: "", count: 0 }
    const delta = "repeat me now!"
    state = trackDegenerateDelta(state, delta).state
    expect(trackDegenerateDelta(state, delta).detected).toBe(false)
    state = trackDegenerateDelta(state, delta).state
    expect(trackDegenerateDelta(state, delta).detected).toBe(true)
  })
})

describe("detectDegenerateText", () => {
  test("detects trailing repeated patterns", () => {
    const pattern = "degenerate-loop-phrase "
    const text = pattern.repeat(4)
    expect(detectDegenerateText(text)).toBe(true)
  })

  test("ignores normal text", () => {
    expect(detectDegenerateText("Here is a normal answer about the task.")).toBe(false)
  })
})

describe("resolveDegenerateFallbackModel", () => {
  test("uses configured fallback when available", () => {
    expect(
      resolveDegenerateFallbackModel({
        providers,
        current: model("primary"),
        configured: "test/fallback",
      }),
    ).toEqual({
      providerID: ProviderV2.ID.make("test"),
      modelID: ModelV2.ID.make("fallback"),
    })
  })

  test("picks the next available model when not configured", () => {
    expect(
      resolveDegenerateFallbackModel({
        providers,
        current: model("primary"),
      }),
    ).toEqual({
      providerID: ProviderV2.ID.make("test"),
      modelID: ModelV2.ID.make("fallback"),
    })
  })
})

import { describe, expect, test } from "bun:test"
import { Effect, Layer } from "effect"
import { Provider } from "@/provider/provider"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { ModelV2 } from "@opencode-ai/core/model"
import {
  checkDegenerateStreamingText,
  checkDegenerateText,
  createDegenerateTracker,
  modelHasPaidCost,
  onDegenerateToolCompleted,
  prefixKey,
  resolveFallbackModel,
} from "../../src/session/degenerate"
import { ProviderTest } from "../fake/provider"
import { TestConfig } from "../fixture/config"
import { testEffect } from "../lib/effect"

describe("session.degenerate", () => {
  test("prefixKey normalizes whitespace and case", () => {
    expect(prefixKey("  Vou   Executar O Comando  ")).toBe("vou executar o comando")
  })

  test("checkDegenerateText detects three matching snippets without tools", () => {
    const tracker = createDegenerateTracker()
    const line = "vou executar o comando agora mesmo"
    expect(checkDegenerateText(tracker, line)).toBe(false)
    expect(checkDegenerateText(tracker, `${line} por favor`)).toBe(false)
    expect(checkDegenerateText(tracker, `${line} de novo`)).toBe(true)
  })

  test("checkDegenerateText resets after a completed tool call", () => {
    const tracker = createDegenerateTracker()
    const line = "vou executar o comando agora mesmo"
    checkDegenerateText(tracker, line)
    checkDegenerateText(tracker, `${line} por favor`)
    onDegenerateToolCompleted(tracker)
    expect(checkDegenerateText(tracker, line)).toBe(false)
    expect(checkDegenerateText(tracker, `${line} por favor`)).toBe(false)
    expect(checkDegenerateText(tracker, `${line} de novo`)).toBe(true)
  })

  test("checkDegenerateStreamingText detects repeated prefix in one block", () => {
    const phrase = "vou executar o comando agora mesmo"
    const repeated = `${phrase} ${phrase} ${phrase}`
    expect(checkDegenerateStreamingText(repeated)).toBe(true)
  })

  test("checkDegenerateStreamingText ignores normal text", () => {
    expect(checkDegenerateStreamingText("Here is a normal answer about the repository structure.")).toBe(false)
  })
})

const it = testEffect(Layer.mergeAll(TestConfig.layer(), ProviderTest.fake().layer))

function providerInfo(
  providerID: string,
  models: Provider.Model[],
): Record<string, Provider.Info> {
  const id = ProviderV2.ID.make(providerID)
  return {
    [id]: {
      id,
      name: providerID,
      source: "config",
      env: [],
      options: {},
      models: Object.fromEntries(models.map((model) => [model.id, model])),
    },
  }
}

describe("session.degenerate.resolveFallbackModel", () => {
  test("modelHasPaidCost treats zero-cost models as free", () => {
    expect(modelHasPaidCost(ProviderTest.model())).toBe(false)
    expect(modelHasPaidCost(ProviderTest.model({ cost: { input: 1, output: 0, cache: { read: 0, write: 0 } } }))).toBe(true)
  })

  it.effect("blocks paid fallback for a free model when only paid alternatives exist", () =>
    Effect.gen(function* () {
      const providerID = ProviderV2.ID.make("opencode")
      const current = ProviderTest.model({
        id: ModelV2.ID.make("free-a"),
        providerID,
      })
      const paid = ProviderTest.model({
        id: ModelV2.ID.make("paid-b"),
        providerID,
        cost: { input: 1, output: 1, cache: { read: 0, write: 0 } },
      })
      const providers = providerInfo("opencode", [current, paid])
      const layer = Layer.mergeAll(
        TestConfig.layer(),
        Layer.succeed(
          Provider.Service,
          Provider.Service.of({
            list: () => Effect.succeed(providers),
            getProvider: () => Effect.die("unused"),
            getModel: () => Effect.die("unused"),
            getLanguage: () => Effect.die("unused"),
            closest: () => Effect.die("unused"),
            getSmallModel: () => Effect.die("unused"),
            defaultModel: () => Effect.die("unused"),
          }),
        ),
      )

      const result = yield* resolveFallbackModel(current).pipe(Effect.provide(layer))
      expect(result.type).toBe("blocked_paid")
    }),
  )

  it.effect("uses configured paid fallback when degenerate_fallback_model is set", () =>
    Effect.gen(function* () {
      const providerID = ProviderV2.ID.make("test")
      const current = ProviderTest.model({
        id: ModelV2.ID.make("free-a"),
        providerID,
      })
      const paidFallback = ProviderTest.model({
        id: ModelV2.ID.make("paid-fallback"),
        providerID,
        cost: { input: 2, output: 2, cache: { read: 0, write: 0 } },
      })
      const providers = providerInfo("test", [current, paidFallback])
      const layer = Layer.mergeAll(
        TestConfig.layer({
          get: () =>
            Effect.succeed({
              experimental: {
                degenerate_fallback_model: "test/paid-fallback",
              },
            }),
        }),
        Layer.succeed(
          Provider.Service,
          Provider.Service.of({
            list: () => Effect.succeed(providers),
            getProvider: () => Effect.die("unused"),
            getModel: (requestedProviderID, modelID) => {
              if (requestedProviderID === providerID && modelID === paidFallback.id) {
                return Effect.succeed(paidFallback)
              }
              return Effect.die(`unexpected getModel ${requestedProviderID}/${modelID}`)
            },
            getLanguage: () => Effect.die("unused"),
            closest: () => Effect.die("unused"),
            getSmallModel: () => Effect.die("unused"),
            defaultModel: () => Effect.die("unused"),
          }),
        ),
      )

      const result = yield* resolveFallbackModel(current).pipe(Effect.provide(layer))
      expect(result.type).toBe("model")
      if (result.type === "model") {
        expect(result.model.id).toBe(paidFallback.id)
      }
    }),
  )

  it.effect("falls back to another free model on the same provider", () =>
    Effect.gen(function* () {
      const providerID = ProviderV2.ID.make("opencode")
      const current = ProviderTest.model({
        id: ModelV2.ID.make("free-a"),
        providerID,
      })
      const otherFree = ProviderTest.model({
        id: ModelV2.ID.make("free-b"),
        providerID,
      })
      const paidOtherProvider = ProviderTest.model({
        id: ModelV2.ID.make("paid-remote"),
        providerID: ProviderV2.ID.make("anthropic"),
        cost: { input: 1, output: 1, cache: { read: 0, write: 0 } },
      })
      const providers = {
        ...providerInfo("opencode", [current, otherFree]),
        ...providerInfo("anthropic", [paidOtherProvider]),
      }
      const layer = Layer.mergeAll(
        TestConfig.layer(),
        Layer.succeed(
          Provider.Service,
          Provider.Service.of({
            list: () => Effect.succeed(providers),
            getProvider: () => Effect.die("unused"),
            getModel: () => Effect.die("unused"),
            getLanguage: () => Effect.die("unused"),
            closest: () => Effect.die("unused"),
            getSmallModel: () => Effect.die("unused"),
            defaultModel: () => Effect.die("unused"),
          }),
        ),
      )

      const result = yield* resolveFallbackModel(current).pipe(Effect.provide(layer))
      expect(result.type).toBe("model")
      if (result.type === "model") {
        expect(result.model.id).toBe(otherFree.id)
        expect(result.model.providerID).toBe(providerID)
      }
    }),
  )
})

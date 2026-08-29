import { describe, expect, test } from "bun:test"
import { Effect, Layer } from "effect"
import { BackgroundJob } from "@opencode-ai/core/background-job"
import { Config } from "@opencode-ai/core/config"
import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { Graphify } from "@opencode-ai/core/graphify"
import { AbsolutePath } from "@opencode-ai/core/schema"
import { testEffect } from "../lib/effect"
import { fakeSidecar } from "./fixture"

const directory = AbsolutePath.make("/project")

const configLayer = (url: string) =>
  Layer.succeed(
    Config.Service,
    Config.Service.of({
      entries: () =>
        Effect.succeed([
          {
            type: "document" as const,
            path: "/project/.opencode/opencode.json",
            info: {
              experimental: {
                graphify_sidecar: {
                  enabled: true,
                  url,
                  timeout_ms: 2000,
                },
              },
            },
          },
        ]),
    }),
  )

const disabledConfigLayer = Layer.succeed(
  Config.Service,
  Config.Service.of({
    entries: () =>
      Effect.succeed([
        {
          type: "document" as const,
          path: "/project/.opencode/opencode.json",
          info: {
            experimental: {
              graphify_sidecar: {
                enabled: false,
                url: "http://127.0.0.1:9",
              },
            },
          },
        },
      ]),
  }),
)

const graphifyLayerFor = (url: string) =>
  AppNodeBuilder.build(LayerNode.group([BackgroundJob.node, Graphify.node]), [[Config.node, configLayer(url)]])

const disabledGraphifyLayer = AppNodeBuilder.build(LayerNode.group([BackgroundJob.node, Graphify.node]), [
  [Config.node, disabledConfigLayer],
])

const itDisabled = testEffect(disabledGraphifyLayer)

describe("Graphify", () => {
  itDisabled.effect("startMap fails NotConfigured without creating a job", () =>
    Effect.gen(function* () {
      const sidecar = fakeSidecar({})
      try {
        const graphify = yield* Graphify.Service
        const jobs = yield* BackgroundJob.Service
        expect(yield* jobs.list()).toHaveLength(0)
        const error = yield* graphify.startMap({ directory }).pipe(Effect.flip)
        expect(error._tag).toBe("Graphify.NotConfigured")
        expect(yield* jobs.list()).toHaveLength(0)
        expect(sidecar.requests()).toBe(0)
      } finally {
        sidecar.stop()
      }
    }),
  )

  test("startMap runs to completion", async () => {
    const sidecar = fakeSidecar({
      map: (body) => Response.json({ status: "completed", directory: body.directory }),
    })
    try {
      await Effect.gen(function* () {
        const graphify = yield* Graphify.Service
        const jobs = yield* BackgroundJob.Service
        const started = yield* graphify.startMap({ directory })
        expect(started).toMatchObject({ type: "graphify.map", status: "running" })
        expect(yield* graphify.getMap(started.id)).toMatchObject({ status: "running" })

        const waited = yield* jobs.wait({ id: started.id })
        expect(waited.timedOut).toBe(false)
        expect(waited.info).toMatchObject({
          status: "completed",
          type: "graphify.map",
          output: JSON.stringify({ status: "completed", directory }),
        })
        expect(sidecar.requests()).toBe(1)
      }).pipe(Effect.scoped, Effect.provide(graphifyLayerFor(sidecar.url)), Effect.runPromise)
    } finally {
      sidecar.stop()
    }
  })

  test("checkSidecarHealth reports ok", async () => {
    const sidecar = fakeSidecar({})
    try {
      await Effect.gen(function* () {
        const graphify = yield* Graphify.Service
        expect(yield* graphify.checkSidecarHealth()).toEqual({ status: "ok" })
        expect(sidecar.requests()).toBe(1)
      }).pipe(Effect.scoped, Effect.provide(graphifyLayerFor(sidecar.url)), Effect.runPromise)
    } finally {
      sidecar.stop()
    }
  })
})

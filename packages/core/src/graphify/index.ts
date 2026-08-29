import { Context, Effect, Layer } from "effect"
import { BackgroundJob } from "../background-job"
import { Config } from "../config"
import { makeLocationNode } from "../effect/app-node"
import type { SessionSchema } from "../session/schema"
import { AbsolutePath } from "../schema"
import { health, MapInput, requestMap, type HealthStatus } from "./client"
import { GraphifyConfig } from "./config"
import type { Error } from "./error"

export interface Interface {
  readonly checkSidecarHealth: () => Effect.Effect<HealthStatus, Error>
  readonly startMap: (input: {
    sessionID?: SessionSchema.ID
    directory: AbsolutePath
  }) => Effect.Effect<BackgroundJob.Info, Error>
  readonly getMap: (id: string) => Effect.Effect<BackgroundJob.Info | undefined>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/Graphify") {}

const make = Effect.gen(function* () {
  const config = yield* Config.Service
  const jobs = yield* BackgroundJob.Service

  const readSidecarConfig = Effect.fn("Graphify.readSidecarConfig")(function* () {
    const entries = yield* config.entries()
    for (const entry of entries) {
      if (entry.type !== "document") continue
      if (entry.info.experimental?.graphify_sidecar) return entry.info.experimental.graphify_sidecar
    }
    return undefined
  })

  const resolveConfig = Effect.fn("Graphify.resolveConfig")(function* () {
    const sidecar = yield* readSidecarConfig()
    return yield* GraphifyConfig.resolve(sidecar)
  })

  const checkSidecarHealth = Effect.fn("Graphify.checkSidecarHealth")(function* () {
    const resolved = yield* resolveConfig()
    return yield* health(resolved)
  })

  const startMap = Effect.fn("Graphify.startMap")(function* (input: {
    sessionID?: SessionSchema.ID
    directory: AbsolutePath
  }) {
    const resolved = yield* resolveConfig()
    return yield* jobs.start({
      type: "graphify.map",
      title: "Graphify project map",
      metadata: {
        ...(input.sessionID ? { sessionID: input.sessionID } : {}),
        directory: input.directory,
      },
      run: requestMap(resolved, MapInput.make({ directory: input.directory })).pipe(
        Effect.flatMap((result) => Effect.succeed(JSON.stringify(result))),
      ),
    })
  })

  const getMap = Effect.fn("Graphify.getMap")(function* (id: string) {
    return yield* jobs.get(id)
  })

  return Service.of({ checkSidecarHealth, startMap, getMap })
})

const layer = Layer.effect(Service, make)

// Location-scoped: sidecar URL is per-project config (like MCP). BackgroundJob is
// process-global; jobs started here are not durable across process restart.
export const node = makeLocationNode({
  service: Service,
  layer,
  deps: [Config.node, BackgroundJob.node],
})

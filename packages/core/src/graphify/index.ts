import { Context, Effect, Layer } from "effect"
import { BackgroundJob } from "../background-job"
import { Config } from "../config"
import { makeLocationNode } from "../effect/app-node"
import { GraphifyConfig } from "./config"
import { health, type HealthStatus } from "./client"
import type { Error } from "./error"

export interface Interface {
  readonly checkSidecarHealth: () => Effect.Effect<HealthStatus, Error>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/Graphify") {}

const make = Effect.gen(function* () {
  const config = yield* Config.Service

  const readSidecarConfig = Effect.fn("Graphify.readSidecarConfig")(function* () {
    const entries = yield* config.entries()
    for (const entry of entries) {
      if (entry.type !== "document") continue
      if (entry.info.experimental?.graphify_sidecar) return entry.info.experimental.graphify_sidecar
    }
    return undefined
  })

  const checkSidecarHealth = Effect.fn("Graphify.checkSidecarHealth")(function* () {
    const sidecar = yield* readSidecarConfig()
    const resolved = yield* GraphifyConfig.resolve(sidecar)
    return yield* health(resolved)
  })

  return Service.of({ checkSidecarHealth })
})

const layer = Layer.effect(Service, make)

// Location-scoped: sidecar URL is per-project config (like MCP). BackgroundJob is
// process-global; jobs started here are not durable across process restart.
export const node = makeLocationNode({
  service: Service,
  layer,
  deps: [Config.node, BackgroundJob.node],
})

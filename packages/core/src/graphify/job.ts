export * as GraphifyJob from "./job"

import { Effect } from "effect"
import { BackgroundJob } from "../background-job"
import { Config } from "../config"
import type { SessionSchema } from "../session/schema"
import { AbsolutePath } from "../schema"
import { GraphifyConfig } from "./config"
import { MapInput, requestMap } from "./client"

const readSidecarConfig = Effect.fn("GraphifyJob.readSidecarConfig")(function* () {
  const config = yield* Config.Service
  const entries = yield* config.entries()
  for (const entry of entries) {
    if (entry.type !== "document") continue
    if (entry.info.experimental?.graphify_sidecar) return entry.info.experimental.graphify_sidecar
  }
  return undefined
})

const resolveConfig = Effect.fn("GraphifyJob.resolveConfig")(function* () {
  const sidecar = yield* readSidecarConfig()
  return yield* GraphifyConfig.resolve(sidecar)
})

export const startMapJob = Effect.fn("GraphifyJob.startMapJob")(function* (input: {
  sessionID?: SessionSchema.ID
  directory: AbsolutePath
}) {
  const config = yield* resolveConfig()
  const jobs = yield* BackgroundJob.Service
  return yield* jobs.start({
    type: "graphify.map",
    title: "Graphify project map",
    metadata: {
      ...(input.sessionID ? { sessionID: input.sessionID } : {}),
      directory: input.directory,
    },
    run: requestMap(config, MapInput.make({ directory: input.directory })).pipe(
      Effect.flatMap((result) => Effect.succeed(JSON.stringify(result))),
    ),
  })
})

export const getMapJob = Effect.fn("GraphifyJob.getMapJob")(function* (id: string) {
  const jobs = yield* BackgroundJob.Service
  return yield* jobs.get(id)
})

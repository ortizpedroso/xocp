import { Graphify } from "@opencode-ai/core/graphify"
import { Location } from "@opencode-ai/core/location"
import { SessionTelemetry } from "@opencode-ai/core/telemetry"
import { SUGGEST_MAP_THRESHOLD } from "@opencode-ai/core/telemetry/score"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { Api } from "../api"
import {
  GraphifyDisabledError,
  GraphifyMapNotFoundError,
  GraphifyUvNotFoundError,
} from "@opencode-ai/protocol/groups/graphify"

export const GraphifyHandler = HttpApiBuilder.group(Api, "server.graphify", (handlers) =>
  handlers
    .handle(
      "session.graphify.suggestion",
      Effect.fn(function* (ctx) {
        const graphify = yield* Graphify.Service
        const telemetry = yield* SessionTelemetry.Service
        const available = yield* graphify.available()
        const score = yield* telemetry.score(ctx.params.sessionID)
        return {
          eligible: score >= SUGGEST_MAP_THRESHOLD && available,
          score,
          threshold: SUGGEST_MAP_THRESHOLD,
          available,
        }
      }),
    )
    .handle(
      "session.graphify.map",
      Effect.fn(function* (ctx) {
        const graphify = yield* Graphify.Service
        const location = yield* Location.Service
        const started = yield* graphify
          .startMap({
            sessionID: ctx.params.sessionID,
            directory: location.directory,
          })
          .pipe(
            Effect.catchTags({
              "Graphify.GraphifyDisabled": () => new GraphifyDisabledError({ code: "graphify_disabled" }),
              "Graphify.UvNotFound": () => new GraphifyUvNotFoundError({ code: "graphify_uv_not_found" }),
            }),
          )
        return { jobID: started.id, status: "running" as const }
      }),
    )
    .handle(
      "session.graphify.map.get",
      Effect.fn(function* (ctx) {
        const graphify = yield* Graphify.Service
        const job = yield* graphify.getMap(ctx.params.jobID)
        if (!job) {
          return yield* new GraphifyMapNotFoundError({
            jobID: ctx.params.jobID,
            message: `Graphify map job not found: ${ctx.params.jobID}`,
          })
        }
        return {
          id: job.id,
          status: job.status,
          ...(job.output !== undefined ? { output: job.output } : {}),
          ...(job.error !== undefined ? { error: job.error } : {}),
        }
      }),
    ),
)

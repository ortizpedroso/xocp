import { Config } from "@opencode-ai/core/config"
import { Graphify } from "@opencode-ai/core/graphify"
import { GraphifyConfig } from "@opencode-ai/core/graphify/config"
import type { Error as GraphifyServiceError } from "@opencode-ai/core/graphify/error"
import { Location } from "@opencode-ai/core/location"
import { SessionTelemetry } from "@opencode-ai/core/telemetry"
import { SUGGEST_MAP_THRESHOLD } from "@opencode-ai/core/telemetry/score"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { Api } from "../api"
import {
  GraphifyMapNotFoundError,
  GraphifyNotConfiguredError,
  GraphifySidecarError,
} from "@opencode-ai/protocol/groups/graphify"

function sidecarErrorMessage(error: GraphifyServiceError) {
  if (error._tag === "Graphify.Unreachable") return error.cause
  if (error._tag === "Graphify.InvalidResponse") return error.message
  if (error._tag === "Graphify.RemoteError") return error.body || `Sidecar returned HTTP ${error.status}`
  return "Graphify sidecar error"
}

function mapGraphifyError<A, R>(effect: Effect.Effect<A, GraphifyServiceError, R>) {
  return effect.pipe(
    Effect.catchTags({
      "Graphify.NotConfigured": () => new GraphifyNotConfiguredError({ code: "graphify_not_configured" }),
      "Graphify.Unreachable": (error) =>
        new GraphifySidecarError({ code: "graphify_sidecar_error", message: sidecarErrorMessage(error) }),
      "Graphify.InvalidResponse": (error) =>
        new GraphifySidecarError({ code: "graphify_sidecar_error", message: sidecarErrorMessage(error) }),
      "Graphify.RemoteError": (error) =>
        new GraphifySidecarError({ code: "graphify_sidecar_error", message: sidecarErrorMessage(error) }),
    }),
  )
}

export const GraphifyHandler = HttpApiBuilder.group(Api, "server.graphify", (handlers) =>
  handlers
    .handle(
      "session.graphify.suggestion",
      Effect.fn(function* (ctx) {
        const config = yield* Config.Service
        const telemetry = yield* SessionTelemetry.Service
        const entries = yield* config.entries()
        let configured = false
        for (const entry of entries) {
          if (entry.type !== "document") continue
          const resolved = yield* GraphifyConfig.resolve(entry.info.experimental?.graphify_sidecar).pipe(Effect.option)
          if (resolved._tag === "Some") {
            configured = true
            break
          }
        }
        const score = yield* telemetry.score(ctx.params.sessionID)
        return {
          eligible: score >= SUGGEST_MAP_THRESHOLD && configured,
          score,
          threshold: SUGGEST_MAP_THRESHOLD,
          sidecarConfigured: configured,
        }
      }),
    )
    .handle(
      "session.graphify.map",
      Effect.fn(function* (ctx) {
        const graphify = yield* Graphify.Service
        const location = yield* Location.Service
        const started = yield* mapGraphifyError(
          graphify.startMap({
            sessionID: ctx.params.sessionID,
            directory: location.directory,
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

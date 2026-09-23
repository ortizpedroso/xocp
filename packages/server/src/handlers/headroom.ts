import { Headroom } from "@opencode-ai/core/headroom"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { Api } from "../api"
import {
  HeadroomActivateNotFoundError,
  HeadroomUvNotFoundError,
} from "@opencode-ai/protocol/groups/headroom"

export const HeadroomHandler = HttpApiBuilder.group(Api, "server.headroom", (handlers) =>
  handlers
    .handle(
      "headroom.status",
      Effect.fn(function* () {
        const headroom = yield* Headroom.Service
        const available = yield* headroom.available()
        const running = available ? yield* headroom.detectRunning() : false
        return { available, running }
      }),
    )
    .handle(
      "headroom.activate",
      Effect.fn(function* () {
        const headroom = yield* Headroom.Service
        const started = yield* headroom.startActivate().pipe(
          Effect.catchTag("Headroom.UvNotFound", () => new HeadroomUvNotFoundError({ code: "headroom_uv_not_found" })),
        )
        return { jobID: started.id, status: "running" as const }
      }),
    )
    .handle(
      "headroom.activate.get",
      Effect.fn(function* (ctx) {
        const headroom = yield* Headroom.Service
        const job = yield* headroom.getActivate(ctx.params.jobID)
        if (!job) {
          return yield* new HeadroomActivateNotFoundError({
            jobID: ctx.params.jobID,
            message: `Headroom activation job not found: ${ctx.params.jobID}`,
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

import { OmniRoute } from "@opencode-ai/core/omniroute"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { Api } from "../api"
import {
  OmniRouteActivateNotFoundError,
  OmniRouteNpmNotFoundError,
} from "@opencode-ai/protocol/groups/omniroute"

export const OmniRouteHandler = HttpApiBuilder.group(Api, "server.omniroute", (handlers) =>
  handlers
    .handle(
      "omniroute.status",
      Effect.fn(function* () {
        const omniroute = yield* OmniRoute.Service
        const available = yield* omniroute.available()
        const running = available ? yield* omniroute.detectRunning() : false
        return { available, running }
      }),
    )
    .handle(
      "omniroute.activate",
      Effect.fn(function* () {
        const omniroute = yield* OmniRoute.Service
        const started = yield* omniroute.startActivate().pipe(
          Effect.catchTag("OmniRoute.NpmNotFound", () => new OmniRouteNpmNotFoundError({ code: "omniroute_npm_not_found" })),
        )
        return { jobID: started.id, status: "running" as const }
      }),
    )
    .handle(
      "omniroute.activate.get",
      Effect.fn(function* (ctx) {
        const omniroute = yield* OmniRoute.Service
        const job = yield* omniroute.getActivate(ctx.params.jobID)
        if (!job) {
          return yield* new OmniRouteActivateNotFoundError({
            jobID: ctx.params.jobID,
            message: `OmniRoute activation job not found: ${ctx.params.jobID}`,
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

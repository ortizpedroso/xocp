import { Effect, Schema } from "effect"
import { Graphify } from "@opencode-ai/core/graphify"
import { Location } from "@opencode-ai/core/location"
import { LocationServiceMap } from "@opencode-ai/core/location-services"
import { AbsolutePath } from "@opencode-ai/core/schema"
import { InstanceState } from "@/effect/instance-state"
import * as Tool from "./tool"
import DESCRIPTION from "./graphify-query.txt"

export const Parameters = Schema.Struct({
  question: Schema.String.annotate({
    description: "Structural question about how code connects in this project",
  }),
})

export const GraphifyQueryTool = Tool.define(
  "graphify_query",
  Effect.gen(function* () {
    const locations = yield* LocationServiceMap.Service

    return {
      description: DESCRIPTION,
      parameters: Parameters,
      execute: (params: Schema.Schema.Type<typeof Parameters>, ctx: Tool.Context) =>
        Effect.gen(function* () {
          yield* ctx.ask({
            permission: "graphify_query",
            patterns: ["*"],
            always: ["*"],
            metadata: {},
          })

          const instance = yield* InstanceState.context
          const directory = AbsolutePath.make(instance.directory)
          const graphify = yield* Graphify.Service.pipe(
            Effect.provide(locations.get(Location.Ref.make({ directory }))),
          )

          const result = yield* graphify.query({
            sessionID: ctx.sessionID,
            directory,
            question: params.question,
          })

          if (result.status === "ok") {
            return {
              title: "graphify query",
              output: result.output ?? result.message,
              metadata: {},
            }
          }

          return {
            title: `graphify ${result.status.replaceAll("_", " ")}`,
            output: result.message,
            metadata: {},
          }
        }),
    } satisfies Tool.DefWithoutID<typeof Parameters>
  }),
)

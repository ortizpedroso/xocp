import { Effect, Schema } from "effect"
import { Handoff } from "@opencode-ai/core/handoff"
import { Location } from "@opencode-ai/core/location"
import { LocationServiceMap } from "@opencode-ai/core/location-services"
import { AbsolutePath } from "@opencode-ai/core/schema"
import { InstanceState } from "@/effect/instance-state"
import * as Tool from "./tool"
import DESCRIPTION from "./handoff-write.txt"

export const Parameters = Schema.Struct({
  content: Schema.String.annotate({
    description: "Summary for the next session in this project (max 2000 characters)",
  }),
})

export const HandoffWriteTool = Tool.define(
  "handoff_write",
  Effect.gen(function* () {
    const locations = yield* LocationServiceMap.Service

    return {
      description: DESCRIPTION,
      parameters: Parameters,
      execute: (params: Schema.Schema.Type<typeof Parameters>, ctx: Tool.Context) =>
        Effect.gen(function* () {
          yield* ctx.ask({
            permission: "handoff_write",
            patterns: ["*"],
            always: ["*"],
            metadata: {},
          })

          const instance = yield* InstanceState.context
          const directory = AbsolutePath.make(instance.directory)
          const handoff = yield* Handoff.Service.pipe(
            Effect.provide(locations.get(Location.Ref.make({ directory }))),
          )

          return yield* handoff
            .write({
              sessionID: ctx.sessionID,
              directory,
              content: params.content,
            })
            .pipe(
              Effect.map(() => ({
                title: "handoff saved",
                output: `Saved handoff summary (${params.content.length} characters) for this project.`,
                metadata: {},
              })),
              Effect.catchTag("Handoff.TooLong", (error) =>
                Effect.succeed({
                  title: "handoff too long",
                  output: `Summary is ${error.length} characters; maximum is ${error.max} — shorten it and try again.`,
                  metadata: {},
                }),
              ),
            )
        }),
    } satisfies Tool.DefWithoutID<typeof Parameters>
  }),
)

import { Effect, Schema } from "effect"
import { Handoff } from "@opencode-ai/core/handoff"
import { Location } from "@opencode-ai/core/location"
import { LocationServiceMap } from "@opencode-ai/core/location-services"
import { AbsolutePath } from "@opencode-ai/core/schema"
import { InstanceState } from "@/effect/instance-state"
import * as Tool from "./tool"
import DESCRIPTION from "./handoff-read.txt"

export const Parameters = Schema.Struct({})

function formatAge(createdAt: number) {
  const seconds = Math.max(0, Math.floor((Date.now() - createdAt) / 1000))
  if (seconds < 60) return `${seconds} second${seconds === 1 ? "" : "s"} ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 48) return `${hours} hour${hours === 1 ? "" : "s"} ago`
  const days = Math.floor(hours / 24)
  return `${days} day${days === 1 ? "" : "s"} ago`
}

export const HandoffReadTool = Tool.define(
  "handoff_read",
  Effect.gen(function* () {
    const locations = yield* LocationServiceMap.Service

    return {
      description: DESCRIPTION,
      parameters: Parameters,
      execute: (_params: {}, ctx: Tool.Context) =>
        Effect.gen(function* () {
          yield* ctx.ask({
            permission: "handoff_read",
            patterns: ["*"],
            always: ["*"],
            metadata: {},
          })

          const instance = yield* InstanceState.context
          const directory = AbsolutePath.make(instance.directory)
          const handoff = yield* Handoff.Service.pipe(
            Effect.provide(locations.get(Location.Ref.make({ directory }))),
          )
          const row = yield* handoff.latestForDirectory(directory)
          if (!row) {
            return {
              title: "no handoff",
              output: "No previous handoff found for this project.",
              metadata: {},
            }
          }

          return {
            title: "handoff",
            output: [
              `Written ${formatAge(row.createdAt)} (session ${row.sessionID}).`,
              "",
              row.content,
            ].join("\n"),
            metadata: {},
          }
        }),
    } satisfies Tool.DefWithoutID<typeof Parameters>
  }),
)

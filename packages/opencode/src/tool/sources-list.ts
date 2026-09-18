import { Effect, Schema } from "effect"
import { SourcesPermissionDeniedError, sources_list } from "@opencode-ai/core/sources/index"
import { InstanceState } from "@/effect/instance-state"
import * as Tool from "./tool"
import DESCRIPTION from "./sources-list.txt"

export const Parameters = Schema.Struct({})

export const SourcesListTool = Tool.define(
  "sources_list",
  Effect.succeed({
    description: DESCRIPTION,
    parameters: Parameters,
    execute: (_params: Schema.Schema.Type<typeof Parameters>, ctx: Tool.Context) =>
      Effect.gen(function* () {
        const instance = yield* InstanceState.context
        const directory = instance.directory

        const result = yield* Effect.promise(async () => {
          try {
            const rows = await sources_list(directory, ctx.agent)
            if (rows.length === 0) {
              return { title: "sources list (0)", output: "Nenhuma fonte ingerida ainda.", metadata: {} }
            }
            const lines = rows.map((r) => `- [${r.id}] ${r.title} (${r.kind}) ${r.created_at}`)
            return { title: `sources list (${rows.length})`, output: lines.join("\n"), metadata: {} }
          } catch (error) {
            if (error instanceof SourcesPermissionDeniedError) {
              return { title: "sources permission denied", output: error.message, metadata: {} }
            }
            throw error
          }
        })
        return result
      }),
  } satisfies Tool.DefWithoutID<typeof Parameters>),
)
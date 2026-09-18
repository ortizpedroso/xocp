import { Effect, Schema } from "effect"
import {
  SourcesPermissionDeniedError,
  assertCanAccessSources,
  querySources,
} from "@opencode-ai/core/sources/index"
import { querySourcesByIntent, type SourceChunk } from "@opencode-ai/core/sources/sources-query"
import { InstanceState } from "@/effect/instance-state"
import * as Tool from "./tool"
import DESCRIPTION from "./sources-query.txt"

export const Parameters = Schema.Struct({
  user_objective: Schema.optional(Schema.String).annotate({
    description:
      'Objetivo/necessidade do usuário; dispara a busca por intenção (querySourcesByIntent) que ranqueia chunks por relevância à meta. Prefira este campo quando o agente souber o que o usuário quer alcançar.',
  }),
  query: Schema.optional(Schema.String).annotate({
    description: "Termos de busca full-text (BM25/FTS5). Usado sozinho ou somado ao user_objective.",
  }),
  source_id: Schema.optional(Schema.String).annotate({
    description: "Restringe a busca a um source_id previamente ingerido.",
  }),
})

export const SourcesQueryTool = Tool.define(
  "sources_query",
  Effect.succeed({
    description: DESCRIPTION,
    parameters: Parameters,
    execute: (params: Schema.Schema.Type<typeof Parameters>, ctx: Tool.Context) =>
      Effect.gen(function* () {
        const instance = yield* InstanceState.context
        const directory = instance.directory

        const result = yield* Effect.promise(async () => {
          try {
            assertCanAccessSources(ctx.agent)

            if (!params.user_objective && !params.query) {
              return {
                title: "sources query",
                output: 'Informe "user_objective" e/ou "query".',
                metadata: {},
              }
            }

            if (params.user_objective) {
              const chunks = querySourcesByIntent(directory, params.user_objective, params.query)
              return formatChunks(chunks)
            }

            const rows = querySources(directory, params.query!, params.source_id)
            if (rows.length === 0) {
              return { title: `sources query (0)`, output: "Nenhum resultado encontrado.", metadata: {} }
            }
            return {
              title: `sources query (${rows.length})`,
              output: rows.map((r) => `- [${r.id}] ${r.title} (${r.kind}) score ${r.score.toFixed(2)}\n  ${r.snippet}`).join("\n"),
              metadata: {},
            }
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

function formatChunks(chunks: SourceChunk[]): Tool.ExecuteResult {
  if (chunks.length === 0) {
    return { title: "sources query (0)", output: "Nenhum chunk correspondeu à intenção.", metadata: {} }
  }
  const lines = chunks.map((chunk) => {
    const reason = chunk.relevanceReason ? ` (${chunk.relevanceReason})` : ""
    const content = chunk.content.replace(/\n+/g, " ").slice(0, 600)
    return `- [${chunk.source_id} / ${chunk.heading}] score ${chunk.score.toFixed(2)}${reason}\n  ${content}`
  })
  return { title: `sources query (${chunks.length})`, output: lines.join("\n"), metadata: {} }
}
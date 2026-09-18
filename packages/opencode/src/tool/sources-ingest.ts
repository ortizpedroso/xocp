import { Effect, Schema } from "effect"
import { SourcesPermissionDeniedError } from "@opencode-ai/core/sources/index"
import { ingestAndNormalizeSource, type SourceType } from "@opencode-ai/core/sources/ingest"
import { InstanceState } from "@/effect/instance-state"
import * as Tool from "./tool"
import DESCRIPTION from "./sources-ingest.txt"

const INGEST_ALLOWED = new Set<string>(["elicitador", "analista", "research-operator"])

export const Parameters = Schema.Struct({
  source_type: Schema.Literals(["url", "pdf", "html", "transcript", "snippet"]).annotate({
    description:
      "Tipo da fonte: url/html (converte Markdown), pdf (texto ou buffer), transcript (segmentos com timestamp), snippet (código com language).",
  }),
  source_id: Schema.optional(Schema.String).annotate({
    description: "id estável da fonte; se omitido, um id é gerado automaticamente.",
  }),
  title: Schema.optional(Schema.String).annotate({
    description: "Título da fonte.",
  }),
  original_uri: Schema.optional(Schema.String).annotate({
    description: "URI original (URL/vídeo/etc.).",
  }),
  raw_content: Schema.optional(Schema.String).annotate({
    description: "Conteúdo bruto (HTML, texto extraído de PDF, ou código).",
  }),
  language: Schema.optional(Schema.String).annotate({
    description: "Linguagem para source_type=snippet (ex.: ts).",
  }),
  summary: Schema.optional(Schema.String).annotate({
    description: "Resumo em 1-3 frases; se omitido é derivado do conteúdo.",
  }),
  key_entities: Schema.optional(Schema.Array(Schema.String)).annotate({
    description: "Entidades-chave (nomes, termos importantes).",
  }),
  transcript_segments: Schema.optional(
    Schema.Array(
      Schema.Struct({
        timestamp: Schema.String,
        text: Schema.String,
      }),
    ),
  ).annotate({
    description: "Segmentos de transcrição para source_type=transcript.",
  }),
})

export const SourcesIngestTool = Tool.define(
  "sources_ingest",
  Effect.succeed({
    description: DESCRIPTION,
    parameters: Parameters,
    execute: (params: Schema.Schema.Type<typeof Parameters>, ctx: Tool.Context) =>
      Effect.gen(function* () {
        const instance = yield* InstanceState.context
        const directory = instance.directory

        const result = yield* Effect.promise(async () => {
          try {
            if (!INGEST_ALLOWED.has(ctx.agent)) {
              throw new SourcesPermissionDeniedError(ctx.agent)
            }

            const doc = await ingestAndNormalizeSource(directory, {
              source_id: params.source_id,
              title: params.title,
              source_type: params.source_type as SourceType,
              original_uri: params.original_uri,
              raw_content: params.raw_content,
              language: params.language,
              summary: params.summary,
              key_entities: params.key_entities ? [...params.key_entities] : undefined,
              transcript_segments: params.transcript_segments ? [...params.transcript_segments] : undefined,
            })

            return {
              title: `ingested ${doc.metadata.source_id}`,
              output:
                `Ingerida fonte "${doc.metadata.title}" (${doc.metadata.source_type}).\n` +
                `id: ${doc.metadata.source_id}\n` +
                `resumo: ${doc.metadata.summary}\n` +
                `entidades: ${doc.metadata.key_entities.join(", ")}\n` +
                `normalized: ${doc.normalizedPath}\n` +
                `raw: ${doc.rawPath}`,
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
import { Effect, Schema } from "effect"
import { buildRecurrenceReport } from "@opencode-ai/core/evolution/pattern-events"
import { InstanceState } from "@/effect/instance-state"
import * as Tool from "./tool"
import DESCRIPTION from "./pattern-recurrence-read.txt"

export const Parameters = Schema.Struct({})

function formatCategory(entry: {
  category_id: string
  source: string
  distinctTasks: number
  occurrences: number
  task_ids: string[]
}) {
  return `- [${entry.source}] ${entry.category_id}: ${entry.distinctTasks} tarefas distintas (${entry.occurrences} ocorrências) — ${entry.task_ids.join(", ")}`
}

export const PatternRecurrenceReadTool = Tool.define(
  "pattern_recurrence_read",
  Effect.succeed({
    description: DESCRIPTION,
    parameters: Parameters,
    execute: (_params: {}, _ctx: Tool.Context) =>
      Effect.gen(function* () {
        const instance = yield* InstanceState.context
        const report = yield* Effect.sync(() => buildRecurrenceReport(instance.directory))

        const lines = [
          `Tarefas concluídas (aprovadas) ao todo: ${report.completedTasks}.`,
          `Janela de análise: eventos desde ${report.windowStart}.`,
          "",
          "## Erro recorrente (critério/regra reprovando repetidamente)",
          report.erroRecorrente.length > 0
            ? report.erroRecorrente.map(formatCategory).join("\n")
            : "Nenhum critério/regra atingiu o limiar de recorrência (≥3 tarefas distintas) na janela atual.",
          "",
          "## Rotina recorrente (mesmo trabalho manual se repetindo, sem reprovação)",
          `(vazio nesta versão) ${report.rotinaRecorrente.limitation}`,
        ]

        return {
          title: `recurrence report (${report.completedTasks} tarefas)`,
          output: lines.join("\n"),
          metadata: {},
        }
      }),
  } satisfies Tool.DefWithoutID<typeof Parameters>),
)

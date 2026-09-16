import { Effect, Schema } from "effect"
import { WorkflowReview } from "@opencode-ai/core/workflow-review"
import {
  recordPatternEvent,
  recordTaskCompletion,
  REPORT_EVERY_N_COMPLETIONS,
} from "@opencode-ai/core/evolution/pattern-events"
import { InstanceState } from "@/effect/instance-state"
import * as Tool from "./tool"
import { sanitizeHandoffSummary } from "./handoff-sanitize"
import DESCRIPTION from "./review-checklist-write.txt"

export const Parameters = Schema.Struct({
  task_id: Schema.String,
  gates: WorkflowReview.ReviewGates,
  criteria: Schema.Array(WorkflowReview.ReviewCriterion),
  verdict: WorkflowReview.ReviewVerdict,
  timestamp: Schema.optional(Schema.String),
})

export const ReviewChecklistWriteTool = Tool.define(
  "review_checklist_write",
  Effect.succeed({
    description: DESCRIPTION,
    parameters: Parameters,
    execute: (params: Schema.Schema.Type<typeof Parameters>, _ctx: Tool.Context) =>
      Effect.gen(function* () {
        const instance = yield* InstanceState.context
        const result = yield* Effect.promise(async () => {
          try {
            const saved = await WorkflowReview.writeReviewChecklist(instance.directory, {
              task_id: params.task_id,
              gates: params.gates,
              criteria: params.criteria.map((entry) => ({
                ...entry,
                evidence: sanitizeHandoffSummary(entry.evidence),
              })),
              verdict: params.verdict,
              timestamp: params.timestamp,
            })

            // Recurrence tracking (Tarefa 10) — one of the 3 fixed event
            // sources feeding pattern-auditor. Never affects the review
            // result itself; a failure here would only lose telemetry.
            for (const criterion of saved.payload.criteria) {
              if (criterion.status !== "fail") continue
              await recordPatternEvent(instance.directory, {
                task_id: params.task_id,
                category_id: criterion.id,
                source: "review_checklist",
                cycle: saved.cycle,
              }).catch(() => {})
            }

            let output = `Wrote ${saved.relativePath} for cycle ${saved.cycle}.`
            if (saved.payload.verdict === "approved") {
              const completions = await recordTaskCompletion(instance.directory, params.task_id).catch(
                () => undefined,
              )
              if (completions !== undefined && completions > 0 && completions % REPORT_EVERY_N_COMPLETIONS === 0) {
                output += `\n\n<recurrence_report_trigger>\n${completions} tarefas concluídas ao todo — chame, via \`task\`, o \`pattern-auditor\` (não precisa de task_id específico, ele analisa o projeto inteiro) para gerar o relatório de recorrência desta leva de 10.\n</recurrence_report_trigger>`
              }
            }

            return {
              title: `review ${saved.payload.verdict}`,
              output,
              metadata: {},
            }
          } catch (error) {
            if (
              typeof error === "object" &&
              error !== null &&
              "_tag" in error &&
              error._tag === "WorkflowReview.InvalidGates"
            ) {
              const e = error as WorkflowReview.InvalidGates
              return {
                title: "invalid gates",
                output: e.message,
                metadata: {},
              }
            }
            if (error instanceof Error) {
              return {
                title: "review checklist failed",
                output: error.message,
                metadata: {},
              }
            }
            throw error
          }
        })
        return result
      }),
  } satisfies Tool.DefWithoutID<typeof Parameters>),
)

import { Effect, Schema } from "effect"
import { WorkflowReview } from "@opencode-ai/core/workflow-review"
import { recordPatternEvent } from "@opencode-ai/core/evolution/pattern-events"
import { InstanceState } from "@/effect/instance-state"
import * as Tool from "./tool"
import DESCRIPTION from "./baseline-audit-write.txt"

export const Parameters = Schema.Struct({
  task_id: Schema.String,
  items: Schema.Array(WorkflowReview.BaselineAuditItem),
  overall: WorkflowReview.BaselineAuditOverall,
})

export const BaselineAuditWriteTool = Tool.define(
  "baseline_audit_write",
  Effect.succeed({
    description: DESCRIPTION,
    parameters: Parameters,
    execute: (params: Schema.Schema.Type<typeof Parameters>, _ctx: Tool.Context) =>
      Effect.gen(function* () {
        const instance = yield* InstanceState.context
        const result = yield* Effect.promise(async () => {
          try {
            const saved = await WorkflowReview.writeBaselineAudit(instance.directory, {
              task_id: params.task_id,
              items: [...params.items],
              overall: params.overall,
            })

            // Recurrence tracking (Tarefa 10) — one of the 3 fixed event
            // sources feeding pattern-auditor. Never affects the audit
            // result itself; a failure here would only lose telemetry.
            for (const item of saved.payload.items) {
              if (item.status !== "fail") continue
              await recordPatternEvent(instance.directory, {
                task_id: params.task_id,
                category_id: item.id,
                source: "baseline_auditor",
                cycle: saved.cycle,
              }).catch(() => {})
            }

            return {
              title: `baseline audit ${saved.payload.overall}`,
              output: `Wrote ${saved.relativePath} for cycle ${saved.cycle}.`,
              metadata: {},
            }
          } catch (error) {
            if (
              typeof error === "object" &&
              error !== null &&
              "_tag" in error &&
              error._tag === "WorkflowReview.InconsistentOverall"
            ) {
              const e = error as WorkflowReview.InconsistentOverall
              return {
                title: "inconsistent overall",
                output: e.message,
                metadata: {},
              }
            }
            if (error instanceof Error) {
              return {
                title: "baseline audit failed",
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

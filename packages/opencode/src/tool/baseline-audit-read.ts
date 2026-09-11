import { Effect, Schema } from "effect"
import { WorkflowReview } from "@opencode-ai/core/workflow-review"
import { InstanceState } from "@/effect/instance-state"
import * as Tool from "./tool"
import DESCRIPTION from "./baseline-audit-read.txt"

export const Parameters = Schema.Struct({
  task_id: Schema.String.annotate({
    description: "Brief id or Spec task id (spec:<slug>:G<N>)",
  }),
})

export const BaselineAuditReadTool = Tool.define(
  "baseline_audit_read",
  Effect.succeed({
    description: DESCRIPTION,
    parameters: Parameters,
    execute: (params: Schema.Schema.Type<typeof Parameters>, _ctx: Tool.Context) =>
      Effect.gen(function* () {
        const instance = yield* InstanceState.context
        const result = yield* Effect.promise(() =>
          WorkflowReview.readLatestBaselineAudit(instance.directory, params.task_id),
        )
        if (!result) {
          return {
            title: "no baseline audit",
            output: `No baseline audit found for task_id "${params.task_id}".`,
            metadata: {},
          }
        }

        return {
          title: `baseline audit cycle ${result.payload.cycle}`,
          output: JSON.stringify(result.payload, null, 2),
          metadata: {},
        }
      }),
  } satisfies Tool.DefWithoutID<typeof Parameters>),
)

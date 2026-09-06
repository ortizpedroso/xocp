import { Effect, Schema } from "effect"
import { WorkflowReview } from "@opencode-ai/core/workflow-review"
import { InstanceState } from "@/effect/instance-state"
import * as Tool from "./tool"
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
              criteria: [...params.criteria],
              verdict: params.verdict,
              timestamp: params.timestamp,
            })
            return {
              title: `review ${saved.payload.verdict}`,
              output: `Wrote ${saved.relativePath} for cycle ${saved.cycle}.`,
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

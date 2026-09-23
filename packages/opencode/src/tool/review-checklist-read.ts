import { Effect, Schema } from "effect"
import { WorkflowReview } from "@opencode-ai/core/workflow-review"
import { InstanceState } from "@/effect/instance-state"
import * as Tool from "./tool"
import DESCRIPTION from "./review-checklist-read.txt"

export const Parameters = Schema.Struct({
  task_id: Schema.String.annotate({
    description: "Brief id or Spec task id (spec:<slug>:G<N>)",
  }),
})

export const ReviewChecklistReadTool = Tool.define(
  "review_checklist_read",
  Effect.succeed({
    description: DESCRIPTION,
    parameters: Parameters,
    execute: (params: Schema.Schema.Type<typeof Parameters>, _ctx: Tool.Context) =>
      Effect.gen(function* () {
        const instance = yield* InstanceState.context
        const result = yield* Effect.promise(() =>
          WorkflowReview.readLatestReviewChecklist(instance.directory, params.task_id),
        )
        if (!result) {
          return {
            title: "no review checklist",
            output: `No review checklist found for task_id "${params.task_id}".`,
            metadata: {},
          }
        }

        return {
          title: `review cycle ${result.payload.cycle}`,
          output: JSON.stringify(result.payload, null, 2),
          metadata: {},
        }
      }),
  } satisfies Tool.DefWithoutID<typeof Parameters>),
)

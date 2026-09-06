import { Effect, Schema } from "effect"
import { WorkflowReview } from "@opencode-ai/core/workflow-review"
import { InstanceState } from "@/effect/instance-state"
import * as Tool from "./tool"
import DESCRIPTION from "./execution-summary-write.txt"

export const Parameters = Schema.Struct({
  task_id: Schema.String,
  completed: Schema.Array(WorkflowReview.CompletedItem),
  incomplete: Schema.Array(WorkflowReview.IncompleteItem),
  status: WorkflowReview.ExecutionSummaryStatus,
})

export const ExecutionSummaryWriteTool = Tool.define(
  "execution_summary_write",
  Effect.succeed({
    description: DESCRIPTION,
    parameters: Parameters,
    execute: (params: Schema.Schema.Type<typeof Parameters>, _ctx: Tool.Context) =>
      Effect.gen(function* () {
        const instance = yield* InstanceState.context
        const result = yield* Effect.promise(async () => {
          try {
            const saved = await WorkflowReview.writeExecutionSummary(instance.directory, {
              task_id: params.task_id,
              completed: [...params.completed],
              incomplete: [...params.incomplete],
              status: params.status,
            })
            return {
              title: "execution summary saved",
              output: `Wrote ${saved.relativePath} for cycle ${saved.cycle} (status: ${saved.payload.status}).`,
              metadata: {},
            }
          } catch (error) {
            if (
              typeof error === "object" &&
              error !== null &&
              "_tag" in error &&
              error._tag === "WorkflowReview.CompleteWithIncomplete"
            ) {
              const e = error as WorkflowReview.CompleteWithIncomplete
              return {
                title: "invalid status",
                output: `Cannot set status to "complete" while ${e.incompleteCount} incomplete item(s) remain.`,
                metadata: {},
              }
            }
            if (error instanceof Error) {
              return {
                title: "execution summary failed",
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

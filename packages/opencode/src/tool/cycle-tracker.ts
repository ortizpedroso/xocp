import { Effect, Schema } from "effect"
import { WorkflowReview } from "@opencode-ai/core/workflow-review"
import { InstanceState } from "@/effect/instance-state"
import * as Tool from "./tool"
import DESCRIPTION from "./cycle-tracker.txt"

export const Parameters = Schema.Struct({
  task_id: Schema.String.annotate({
    description: "Brief id or Spec task id (spec:<slug>:G<N>)",
  }),
})

export const CycleTrackerTool = Tool.define(
  "cycle_tracker",
  Effect.succeed({
    description: DESCRIPTION,
    parameters: Parameters,
    execute: (params: Schema.Schema.Type<typeof Parameters>, _ctx: Tool.Context) =>
      Effect.gen(function* () {
        const instance = yield* InstanceState.context
        const result = yield* Effect.promise(async () => {
          try {
            const cycle = await WorkflowReview.incrementCycle(instance.directory, params.task_id)
            return {
              title: `cycle ${cycle}`,
              output: `Cycle incremented to ${cycle} for task_id "${params.task_id}".`,
              metadata: {},
            }
          } catch (error) {
            if (
              typeof error === "object" &&
              error !== null &&
              "_tag" in error &&
              error._tag === "WorkflowReview.CycleLimitExceeded"
            ) {
              const e = error as WorkflowReview.CycleLimitExceeded
              return {
                title: "cycle limit reached",
                output: `limite de ciclos atingido, escale pra humano (cycle ${e.cycle} for ${e.task_id}).`,
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

import { Effect, Schema } from "effect"
import { WorkflowReview } from "@opencode-ai/core/workflow-review"
import { InstanceState } from "@/effect/instance-state"
import * as Tool from "./tool"
import DESCRIPTION from "./task-approval-check.txt"

export const Parameters = Schema.Struct({
  task_id: Schema.String.annotate({
    description: "Brief id or Spec task id (spec:<slug>:G<N>)",
  }),
})

function workflowError(error: unknown) {
  if (typeof error !== "object" || error === null || !("_tag" in error)) return undefined
  return error as { _tag: string }
}

export const TaskApprovalCheckTool = Tool.define(
  "task_approval_check",
  Effect.succeed({
    description: DESCRIPTION,
    parameters: Parameters,
    execute: (params: Schema.Schema.Type<typeof Parameters>, _ctx: Tool.Context) =>
      Effect.gen(function* () {
        const instance = yield* InstanceState.context
        const result = yield* Effect.promise(async () => {
          try {
            const contract = await WorkflowReview.taskApprovalCheck(instance.directory, params.task_id)
            return {
              title: "approved",
              output: `Contract ${contract.relativePath} is approved. Status: aprovada.\n\n${contract.content}`,
              metadata: {},
            }
          } catch (error) {
            const tagged = workflowError(error)
            if (tagged?._tag === "WorkflowReview.ContractNotFound") {
              const e = error as WorkflowReview.ContractNotFound
              return {
                title: "contract not found",
                output: `No contract file found for task_id "${e.task_id}" at ${e.path}.`,
                metadata: {},
              }
            }
            if (tagged?._tag === "WorkflowReview.FrontmatterParseError") {
              const e = error as WorkflowReview.FrontmatterParseError
              return {
                title: "parse error",
                output: `Failed to parse contract at ${e.path}: ${e.message}`,
                metadata: {},
              }
            }
            if (tagged?._tag === "WorkflowReview.NotApproved") {
              const e = error as WorkflowReview.NotApproved
              return {
                title: "not approved",
                output: `Contract ${e.path} has status "${e.status}" — must be "aprovada" before implementation.`,
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

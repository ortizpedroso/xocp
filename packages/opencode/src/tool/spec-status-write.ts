import { Effect, Schema } from "effect"
import { WorkflowReview } from "@opencode-ai/core/workflow-review"
import { InstanceState } from "@/effect/instance-state"
import { Question } from "../question"
import * as Tool from "./tool"
import DESCRIPTION from "./spec-status-write.txt"

export const Parameters = Schema.Struct({
  task_id: Schema.String.annotate({
    description: "Brief id or Spec task id (spec:<slug>:G<N>)",
  }),
  new_status: WorkflowReview.Status.annotate({
    description: "Target status value for the contract file",
  }),
})

const APPROVAL_LABEL = "Yes"

function workflowError(error: unknown) {
  if (typeof error !== "object" || error === null || !("_tag" in error)) return undefined
  return error as { _tag: string }
}

export const SpecStatusWriteTool = Tool.define(
  "spec_status_write",
  Effect.gen(function* () {
    const question = yield* Question.Service

    return {
      description: DESCRIPTION,
      parameters: Parameters,
      execute: (params: Schema.Schema.Type<typeof Parameters>, ctx: Tool.Context) =>
        Effect.gen(function* () {
          const instance = yield* InstanceState.context

          let contract: WorkflowReview.ContractRead
          try {
            contract = yield* Effect.promise(() =>
              WorkflowReview.readContractStatus(instance.directory, params.task_id),
            )
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
            throw error
          }

          if (params.new_status === "aprovada") {
            const kind = WorkflowReview.taskKind(params.task_id) === "spec" ? "Spec" : "Brief"
            const answers = yield* question
              .ask({
                sessionID: ctx.sessionID,
                questions: [
                  {
                    question: `Aprovar a ${kind} ${params.task_id}? Isso libera implementação.`,
                    header: "Aprovar",
                    custom: false,
                    options: [
                      { label: APPROVAL_LABEL, description: "Approve and allow implementation to proceed" },
                      { label: "No", description: "Do not approve; keep the current status" },
                    ],
                  },
                ],
                tool: ctx.callID ? { messageID: ctx.messageID, callID: ctx.callID } : undefined,
              })
              .pipe(Effect.catchTag("QuestionRejectedError", () => Effect.succeed([[""] as Question.Answer])))

            if (answers[0]?.[0] !== APPROVAL_LABEL) {
              return {
                title: "approval declined",
                output: `Status not changed: approval for ${params.task_id} was declined in the UI.`,
                metadata: {},
              }
            }
          }

          const updated = yield* Effect.promise(() =>
            WorkflowReview.writeContractStatus(instance.directory, params.task_id, params.new_status),
          )

          return {
            title: "status updated",
            output: `Updated ${updated.relativePath} status from "${updated.previous_status}" to "${updated.status}".`,
            metadata: {},
          }
        }),
    } satisfies Tool.DefWithoutID<typeof Parameters>
  }),
)

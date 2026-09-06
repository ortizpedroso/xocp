import path from "path"
import { Effect, Schema } from "effect"
import { InstanceState } from "@/effect/instance-state"
import { Question } from "../question"
import { resolveTaskPath } from "../workflow/task-path"
import { Status, readBriefStatus, readSpecStatus, writeBriefStatus, writeSpecStatus } from "../workflow/status"
import * as Tool from "./tool"
import DESCRIPTION from "./spec-status-write.txt"

export const Parameters = Schema.Struct({
  task_id: Schema.String.annotate({
    description: "Brief id (e.g. brief-ui-01) or Spec task id (e.g. spec:my-feature:G1)",
  }),
  new_status: Status.annotate({
    description: "Target status value for the contract file frontmatter",
  }),
})

type Metadata = {
  task_id: string
  new_status: Status
  relativePath: string
  previous_status?: Status
  applied: boolean
}

const APPROVAL_LABEL = "Yes"

export const SpecStatusWriteTool = Tool.define<typeof Parameters, Metadata, Question.Service>(
  "spec_status_write",
  Effect.gen(function* () {
    const question = yield* Question.Service

    return {
      description: DESCRIPTION,
      parameters: Parameters,
      execute: (params: Schema.Schema.Type<typeof Parameters>, ctx: Tool.Context<Metadata>) =>
        Effect.gen(function* () {
          const instance = yield* InstanceState.context
          const resolved = yield* Effect.promise(() => resolveTaskPath(instance.directory, params.task_id))
          if (!resolved) {
            return {
              title: "contract not found",
              output: `No Spec or Brief file found for task_id "${params.task_id}".`,
              metadata: {
                task_id: params.task_id,
                new_status: params.new_status,
                relativePath: "",
                applied: false,
              },
            }
          }

          const filePath = path.join(instance.directory, resolved.relativePath)
          const content = yield* Effect.promise(() => Bun.file(filePath).text())
          const previous =
            resolved.kind === "spec" ? readSpecStatus(content) : readBriefStatus(content)

          if (params.new_status === "aprovada") {
            const kind = resolved.kind === "spec" ? "Spec" : "Brief"
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
              .pipe(
                Effect.catchTag("QuestionRejectedError", () =>
                  Effect.succeed([[""] as Question.Answer]),
                ),
              )

            if (answers[0]?.[0] !== APPROVAL_LABEL) {
              return {
                title: "approval declined",
                output: `Status not changed: approval for ${params.task_id} was declined in the UI.`,
                metadata: {
                  task_id: params.task_id,
                  new_status: params.new_status,
                  relativePath: resolved.relativePath,
                  previous_status: previous,
                  applied: false,
                },
              }
            }
          }

          const next =
            resolved.kind === "spec"
              ? writeSpecStatus(content, params.new_status)
              : writeBriefStatus(content, params.new_status)

          yield* Effect.promise(() => Bun.write(filePath, next))

          return {
            title: "status updated",
            output: `Updated ${resolved.relativePath} status to "${params.new_status}".`,
            metadata: {
              task_id: params.task_id,
              new_status: params.new_status,
              relativePath: resolved.relativePath,
              previous_status: previous,
              applied: true,
            },
          }
        }),
    } satisfies Tool.DefWithoutID<typeof Parameters, Metadata>
  }),
)

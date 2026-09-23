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

// Non-binding fields from the brief template (specs/xocp/workflow-pipeline.md §4).
// Best-effort: any parse failure or missing brief just skips the reminder.
async function buildScopeReminder(directory: string, task_id: string, cycle: number): Promise<string> {
  if (WorkflowReview.taskKind(task_id) !== "brief") return ""
  try {
    const contract = await WorkflowReview.readContractStatus(directory, task_id)
    const parsed = Bun.YAML.parse(contract.content) as
      | { files_expected_touched?: unknown; constraints?: unknown }
      | undefined
    const filesExpectedTouched = Array.isArray(parsed?.files_expected_touched) ? parsed.files_expected_touched : []
    const constraints = Array.isArray(parsed?.constraints) ? parsed.constraints : []
    if (filesExpectedTouched.length === 0 && constraints.length === 0) return ""
    return `\n\n<execution_turn_reminder>
[CICLO DE CORREÇÃO ATUAL: ${cycle}]
Arquivos esperados a tocar (orientação do Brief, files_expected_touched — não é lista fechada): ${JSON.stringify(filesExpectedTouched)}
Restrições que o Executor NÃO PODE violar (constraints do Brief): ${JSON.stringify(constraints)}
Qualquer edição fora desse escopo só se for estritamente necessária pro critério de aceite — se não for, não faça.
</execution_turn_reminder>`
  } catch {
    return ""
  }
}

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
            let output = `Cycle incremented to ${cycle} for task_id "${params.task_id}".`
            if (cycle >= 2) {
              output += await buildScopeReminder(instance.directory, params.task_id, cycle)
            }
            return {
              title: `cycle ${cycle}`,
              output,
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

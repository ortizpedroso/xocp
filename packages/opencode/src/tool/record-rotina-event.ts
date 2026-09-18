import { Effect, Schema } from "effect"
import { recordPatternEvent, routineProgress, ROTINA_RECURRENCE_THRESHOLD } from "@opencode-ai/core/evolution/pattern-events"
import { InstanceState } from "@/effect/instance-state"
import * as Tool from "./tool"
import DESCRIPTION from "./record-rotina-event.txt"

export const Parameters = Schema.Struct({
  task_id: Schema.String.annotate({
    description: "Brief id or Spec task id (spec:<slug>:G<N>) — same task_id used for cycle_tracker",
  }),
  rotina_id: Schema.String.annotate({
    description:
      "Short, stable kebab-case label (ex.: 'consulta-sources-db', 'reuso-padrao-teste') for a repeatable work routine you used in THIS cycle. Not the task name — the same label must be reused across unrelated tasks to be counted as recurring.",
  }),
  ciclo: Schema.optional(Schema.Number).annotate({
    description: "Optional cycle counter (default 1) — used only for the event record, not for recurrence counting.",
  }),
})

export const RecordRotinaEventTool = Tool.define(
  "record_rotina_event",
  Effect.succeed({
    description: DESCRIPTION,
    parameters: Parameters,
    execute: (params: Schema.Schema.Type<typeof Parameters>, _ctx: Tool.Context) =>
      Effect.gen(function* () {
        const instance = yield* InstanceState.context
        yield* Effect.promise(() =>
          recordPatternEvent(instance.directory, {
            task_id: params.task_id,
            category_id: params.rotina_id,
            source: "executor_rotina",
            cycle: params.ciclo ?? 1,
          }),
        )
        const progress = yield* Effect.sync(() => routineProgress(instance.directory, params.rotina_id))
        return {
          title: "rotina registrada",
          output:
            `Rotina "${params.rotina_id}" registrada para "${params.task_id}" (fonte executor_rotina). ` +
            `Progresso: ${progress.distinctTasks} tarefa(s) distinta(s) com esta rotina na janela — ` +
            `candidata a tool/skill a partir de ${ROTINA_RECURRENCE_THRESHOLD} tarefas distintas.`,
          metadata: { distinctTasks: progress.distinctTasks },
        }
      }),
  } satisfies Tool.DefWithoutID<typeof Parameters>),
)
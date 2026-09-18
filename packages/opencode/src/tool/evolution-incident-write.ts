import { Effect, Schema } from "effect"
import { recordIncident } from "@opencode-ai/core/evolution/incident"
import { InstanceState } from "@/effect/instance-state"
import path from "path"
import * as Tool from "./tool"
import DESCRIPTION from "./evolution-incident-write.txt"

const INCIDENT_WRITE_ALLOWED = new Set<string>(["evolution-incident-reporter"])

export const Parameters = Schema.Struct({
  task_id: Schema.String.annotate({
    description: "Brief id ou Spec task id (spec:<slug>:G<N>) associado ao incidente.",
  }),
  cycles_used: Schema.Number.annotate({
    description: "Número de ciclos consumidos até a escalação/falha.",
  }),
  root_cause_category: Schema.String.annotate({
    description: "Categoria da causa raiz (ex.: cycle_threshold_reached, brief_insufficient_contract).",
  }),
  symptom: Schema.String.annotate({
    description: "Sintoma observado (o que falhou/escalou).",
  }),
  context_snapshot: Schema.Record(Schema.String, Schema.Unknown).annotate({
    description: "Contexto do incidente (metadados arbitrários para telemetria).",
  }),
})

export const EvolutionIncidentWriteTool = Tool.define(
  "evolution_incident_write",
  Effect.succeed({
    description: DESCRIPTION,
    parameters: Parameters,
    execute: (params: Schema.Schema.Type<typeof Parameters>, ctx: Tool.Context) =>
      Effect.gen(function* () {
        const instance = yield* InstanceState.context
        const directory = instance.directory

        if (!INCIDENT_WRITE_ALLOWED.has(ctx.agent)) {
          return {
            title: "evolution incident write denied",
            output: `Agent '${ctx.agent}' is not allowed to write evolution incidents. Only 'evolution-incident-reporter' is permitted.`,
            metadata: {},
          }
        }

        const incident = yield* Effect.promise(() =>
          recordIncident(directory, {
            task_id: params.task_id,
            cycles_used: params.cycles_used,
            root_cause_category: params.root_cause_category,
            symptom: params.symptom,
            context_snapshot: params.context_snapshot,
          }),
        )

        const filePath = path.join(directory, ".opencode", "evolution", `incident-${incident.id}.json`)
        return {
          title: `incident ${incident.id}`,
          output: `Registrado incidente ${incident.id} para "${incident.task_id}" (${incident.root_cause_category}).\nArquivo: ${filePath}`,
          metadata: {},
        }
      }),
  } satisfies Tool.DefWithoutID<typeof Parameters>),
)
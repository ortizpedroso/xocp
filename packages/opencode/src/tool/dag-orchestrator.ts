import { Effect, Schema } from "effect"
import { InstanceState } from "@/effect/instance-state"
import * as Tool from "./tool"
import DESCRIPTION from "./dag-orchestrator.txt"

export const Parameters = Schema.Struct({
  action: Schema.Literals(["status", "mark_running", "apply_verdicts"]).annotate({
    description: "DAG operation to run: status (report nodes + ready waves), mark_running (reserve a brief), apply_verdicts (read review_checklist verdicts from disk)",
  }),
  brief_id: Schema.optional(Schema.String).annotate({
    description: "Brief id — required only when action=mark_running",
  }),
})

type Metadata = {
  clusterId?: string
  applied?: number
}

export const DagOrchestratorTool = Tool.define<typeof Parameters, Metadata, never>(
  "dag_orchestrator",
  Effect.succeed({
    description: DESCRIPTION,
    parameters: Parameters,
    execute: (params: Schema.Schema.Type<typeof Parameters>, _ctx: Tool.Context) =>
      Effect.gen(function* () {
        const instance = yield* InstanceState.context
        const result = yield* Effect.promise(async () => {
          try {
            const { DagOrchestrator } = await import("@opencode-ai/core/cluster/orchestrator")
            const orch = await DagOrchestrator.open(instance.directory)
            const dispatcher = orch.getDispatcher()

            if (params.action === "mark_running") {
              if (!params.brief_id) {
                return {
                  title: "invalid arguments",
                  output: 'action=mark_running requires "brief_id".',
                  metadata: {},
                }
              }
              const ctx = orch.markRunning(params.brief_id)
              return {
                title: `running: ${params.brief_id}`,
                output:
                  `Brief "${ctx.briefId}" marked running (cluster ${ctx.clusterId}, delegation depth ${ctx.delegationDepth}). ` +
                  `Scope (allow_modify): ${ctx.assignedFiles.allow_modify.join(", ") || "(none)"}`,
                metadata: { clusterId: ctx.clusterId },
              }
            }

            if (params.action === "apply_verdicts") {
              const { applied } = await orch.applyVerdicts()
              const waves = orch.readyWaves()
              return {
                title: `applied ${applied} verdicts`,
                output: renderSummary(dispatcher.getAllNodes(), waves, `Applied ${applied} review veredict(s).`),
                metadata: { applied },
              }
            }

            const waves = orch.readyWaves()
            return {
              title: "dag status",
              output: renderSummary(dispatcher.getAllNodes(), waves),
              metadata: {},
            }
          } catch (error) {
            throw error
          }
        })
        return result
      }),
  } satisfies Tool.DefWithoutID<typeof Parameters>),
)

function renderSummary(
  nodes: Array<{
    brief: { brief_id: string; domain_cluster: string; depends_on: string[] }
    status: string
    reviewVerdict?: string
  }>,
  waves: Array<Array<{ brief_id: string }>>,
  context = "",
): string {
  const lines: string[] = []
  if (context) lines.push(context, "")
  lines.push(`DAG — ${nodes.length} briefs carregados:`)
  if (nodes.length === 0) {
    lines.push("  (nenhum brief aprovado em .opencode/briefs/)")
  }
  for (const node of nodes) {
    const deps = node.brief.depends_on.length > 0 ? `  deps: ${node.brief.depends_on.join(",")}` : ""
    const verdict = node.reviewVerdict ? `  [${node.reviewVerdict}]` : ""
    lines.push(`  - ${node.brief.brief_id}  (${node.brief.domain_cluster})  ${node.status}${verdict}${deps}`)
  }
  lines.push("")
  lines.push(
    waves.length === 0
      ? "Ready waves: nenhuma no momento (verifique vereditos pendentes com apply_verdicts)."
      : "Ready waves (executar em ordem, cada wave em paralelo):",
  )
  for (const [i, wave] of waves.entries()) {
    lines.push(`  wave ${i + 1}: ${wave.map((b) => b.brief_id).join(", ")}`)
  }
  return lines.join("\n")
}
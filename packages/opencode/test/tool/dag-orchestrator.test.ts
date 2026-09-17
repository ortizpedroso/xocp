import { afterEach, describe, expect } from "bun:test"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { Effect } from "effect"
import path from "path"
import fs from "fs/promises"
import { DagOrchestratorTool } from "../../src/tool/dag-orchestrator"
import { SessionID, MessageID } from "../../src/session/schema"
import { Tool } from "@/tool/tool"
import { disposeAllInstances, TestInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"
import { DagOrchestrator } from "@opencode-ai/core/cluster/orchestrator"
import { Truncate } from "@/tool/truncate"
import { Agent } from "../../src/agent/agent"

const ctx: Tool.Context = {
  sessionID: SessionID.make("ses_test-dag-orchestrator"),
  messageID: MessageID.make("msg_test-dag-orchestrator"),
  callID: "test-call",
  agent: "core-lead",
  abort: AbortSignal.any([]),
  messages: [],
  metadata: () => Effect.void,
  ask: () => Effect.void,
}

afterEach(async () => {
  await disposeAllInstances()
})

const it = testEffect(LayerNode.compile(LayerNode.group([Truncate.node, Agent.node])))

const init = Effect.fn("DagOrchestratorToolTest.init")(function* () {
  const info = yield* DagOrchestratorTool
  return yield* info.init()
})

const run = Effect.fn("DagOrchestratorToolTest.run")(function* (
  args: Tool.InferParameters<typeof DagOrchestratorTool>,
) {
  const tool = yield* init()
  return yield* tool.execute(args, ctx)
})

async function writeBrief(dir: string, yaml: string) {
  const briefsDir = path.join(dir, ".opencode", "briefs")
  await fs.mkdir(briefsDir, { recursive: true })
  const match = yaml.match(/^brief_id:\s*(\S+)/m)
  if (!match) throw new Error(`fixture missing brief_id:\n${yaml}`)
  await Bun.write(path.join(briefsDir, `${match[1]}.yaml`), yaml)
}

async function writeVerdict(dir: string, taskId: string, verdict: "approved" | "rejected" | "failed") {
  const reviewsDir = path.join(dir, ".opencode", "reviews", taskId)
  await fs.mkdir(reviewsDir, { recursive: true })
  await Bun.write(
    path.join(reviewsDir, "cycle-1.json"),
    JSON.stringify({
      task_id: taskId,
      cycle: 1,
      gates: { execution_summary_complete: "pass" },
      criteria: [{ id: "c1", status: "pass", evidence: "fixture" }],
      verdict,
      timestamp: new Date().toISOString(),
    }),
  )
}

const BRIEF_A = `brief_id: brief-a
version: 1
task_summary: "core schema"
status: aprovada
depends_on: []
files_expected_touched:
  - packages/core/src/db/schema.ts
acceptance_criteria:
  - id: AC1
    description: "schema works"
    verifiable_by: "cd packages/core && bun test test/x.test.ts"
`

const BRIEF_B = `brief_id: brief-b
version: 1
task_summary: "backend api"
status: aprovada
depends_on:
  - brief-a
files_expected_touched:
  - packages/server/src/api/users.ts
acceptance_criteria:
  - id: AC1
    description: "api works"
    verifiable_by: "cd packages/server && bun test test/api.test.ts"
`

describe("tool.dag_orchestrator", () => {
  it.instance("status reports nodes, clusters and ready waves (no mutation)", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      yield* Effect.promise(() => Promise.all([writeBrief(test.directory, BRIEF_A), writeBrief(test.directory, BRIEF_B)]))

      const result = yield* run({ action: "status" })
      expect(result.output).toContain("brief-a")
      expect(result.output).toContain("brief-b")
      expect(result.output).toContain("(core)")
      expect(result.output).toContain("blocked")
      expect(result.output).toContain("wave 1: brief-a")

      const orch = yield* Effect.promise(() => DagOrchestrator.open(test.directory))
      expect(orch.getDispatcher().getNode("brief-a")?.status).toBe("pending")
    }),
  )

  it.instance("mark_running reserves a brief and persists running state", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      yield* Effect.promise(() => writeBrief(test.directory, BRIEF_A))

      const result = yield* run({ action: "mark_running", brief_id: "brief-a" })
      expect(result.output).toContain(`Brief "brief-a" marked running`)
      expect(result.output).toContain("cluster core")
      expect(result.output).toContain("delegation depth 1")

      const orch = yield* Effect.promise(() => DagOrchestrator.open(test.directory))
      expect(orch.getDispatcher().getNode("brief-a")?.status).toBe("running")
    }),
  )

  it.instance("mark_running requires brief_id", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      yield* Effect.promise(() => writeBrief(test.directory, BRIEF_A))

      const result = yield* run({ action: "mark_running" })
      expect(result.output).toContain("requires \"brief_id\"")
    }),
  )

  it.instance("apply_verdicts reads review_checklist verdicts and unblocks dependents", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      yield* Effect.promise(() => Promise.all([writeBrief(test.directory, BRIEF_A), writeBrief(test.directory, BRIEF_B)]))
      yield* Effect.promise(() => writeVerdict(test.directory, "brief-a", "approved"))

      const result = yield* run({ action: "apply_verdicts" })
      expect(result.output).toContain("Applied 1 review veredict")
      expect(result.output).toContain("wave 1: brief-b")
    }),
  )
})
import { afterEach, describe, expect } from "bun:test"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { WorkflowReview } from "@opencode-ai/core/workflow-review"
import { Effect } from "effect"
import fs from "fs/promises"
import path from "path"
import { CycleTrackerTool } from "../../src/tool/cycle-tracker"
import { ReviewChecklistReadTool } from "../../src/tool/review-checklist-read"
import { ReviewChecklistWriteTool } from "../../src/tool/review-checklist-write"
import { TaskApprovalCheckTool } from "../../src/tool/task-approval-check"
import { Truncate } from "@/tool/truncate"
import { Agent } from "../../src/agent/agent"
import { SessionID, MessageID } from "../../src/session/schema"
import { Tool } from "@/tool/tool"
import { disposeAllInstances, TestInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"
import { reply } from "../lib/llm-server"
import { cliIt } from "../lib/cli-process"

const ctx = {
  sessionID: SessionID.make("ses_workflow-cycle"),
  messageID: MessageID.make("msg_workflow-cycle"),
  callID: "workflow-cycle-call",
  agent: "workflow-executor",
  abort: AbortSignal.any([]),
  messages: [],
  metadata: () => Effect.void,
  ask: () => Effect.void,
}

afterEach(async () => {
  await disposeAllInstances()
})

const it = testEffect(
  LayerNode.compile(LayerNode.group([Truncate.node, Agent.node])),
)

const briefApproved = `brief_id: brief-cycle-demo
status: aprovada
task_summary: demo cycle
`

async function writeApprovedBrief(directory: string) {
  const briefPath = path.join(directory, ".opencode", "briefs", "brief-cycle-demo.yaml")
  await fs.mkdir(path.dirname(briefPath), { recursive: true })
  await fs.writeFile(briefPath, briefApproved, "utf-8")
}

const initCycleTracker = Effect.fn("WorkflowCycleTest.initCycleTracker")(function* () {
  const info = yield* CycleTrackerTool
  return yield* info.init()
})

const initTaskApprovalCheck = Effect.fn("WorkflowCycleTest.initTaskApprovalCheck")(function* () {
  const info = yield* TaskApprovalCheckTool
  return yield* info.init()
})

const initReviewChecklistRead = Effect.fn("WorkflowCycleTest.initReviewChecklistRead")(function* () {
  const info = yield* ReviewChecklistReadTool
  return yield* info.init()
})

const initReviewChecklistWrite = Effect.fn("WorkflowCycleTest.initReviewChecklistWrite")(function* () {
  const info = yield* ReviewChecklistWriteTool
  return yield* info.init()
})

const runCycleTracker = Effect.fn("WorkflowCycleTest.runCycleTracker")(function* (args: Tool.InferParameters<typeof CycleTrackerTool>) {
  const tool = yield* initCycleTracker()
  return yield* tool.execute(args, ctx)
})

const runTaskApprovalCheck = Effect.fn("WorkflowCycleTest.runTaskApprovalCheck")(function* (
  args: Tool.InferParameters<typeof TaskApprovalCheckTool>,
) {
  const tool = yield* initTaskApprovalCheck()
  return yield* tool.execute(args, ctx)
})

const runReviewChecklistRead = Effect.fn("WorkflowCycleTest.runReviewChecklistRead")(function* (
  args: Tool.InferParameters<typeof ReviewChecklistReadTool>,
) {
  const tool = yield* initReviewChecklistRead()
  return yield* tool.execute(args, ctx)
})

const runReviewChecklistWrite = Effect.fn("WorkflowCycleTest.runReviewChecklistWrite")(function* (
  args: Tool.InferParameters<typeof ReviewChecklistWriteTool>,
) {
  const tool = yield* initReviewChecklistWrite()
  return yield* tool.execute(args, ctx)
})

describe("workflow pipeline agents cycle", () => {
  it.instance("task_approval_check blocks executor when brief is not approved", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      const briefPath = path.join(test.directory, ".opencode", "briefs", "brief-cycle-demo.yaml")
      yield* Effect.promise(async () => {
        await fs.mkdir(path.dirname(briefPath), { recursive: true })
        await fs.writeFile(
          briefPath,
          briefApproved.replace("aprovada", "aguardando_aprovacao"),
          "utf-8",
        )
      })

      const result = yield* runTaskApprovalCheck({ task_id: "brief-cycle-demo" })
      expect(result.output).toContain("must be \"aprovada\"")
    }),
  )

  it.instance("rejected checklist feeds the next executor cycle until approval", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      yield* Effect.promise(() => writeApprovedBrief(test.directory))
      const task_id = "brief-cycle-demo"

      yield* Effect.promise(() => WorkflowReview.incrementCycle(test.directory, task_id))
      yield* Effect.promise(() =>
        WorkflowReview.writeReviewChecklist(test.directory, {
          task_id,
          gates: { execution_summary_complete: "fail" },
          criteria: [{ id: "AC1", status: "fail", evidence: "typecheck failed in packages/core" }],
          verdict: "rejected",
        }),
      )

      yield* runCycleTracker({ task_id })
      yield* runTaskApprovalCheck({ task_id })
      const checklist = yield* runReviewChecklistRead({ task_id })

      expect(checklist.output).toContain("rejected")
      expect(checklist.output).toContain("typecheck failed in packages/core")

      yield* Effect.promise(() =>
        WorkflowReview.writeExecutionSummary(test.directory, {
          task_id,
          completed: [{ item: "AC1", evidence: "cd packages/core && bun typecheck passed" }],
          incomplete: [],
          status: "complete",
        }),
      )

      const approved = yield* runReviewChecklistWrite({
        task_id,
        gates: { execution_summary_complete: "pass" },
        criteria: [{ id: "AC1", status: "pass", evidence: "verified independently" }],
        verdict: "approved",
      })

      expect(approved.title).toContain("review approved")
      const latest = yield* Effect.promise(() => WorkflowReview.readLatestReviewChecklist(test.directory, task_id))
      expect(latest?.payload.verdict).toBe("approved")
    }),
  )

  it.instance("cycle_tracker blocks the fourth increment", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      const task_id = "brief-cycle-limit"

      const first = yield* runCycleTracker({ task_id })
      const second = yield* runCycleTracker({ task_id })
      const third = yield* runCycleTracker({ task_id })
      const fourth = yield* runCycleTracker({ task_id })

      expect(first.output).toContain("Cycle incremented to 1")
      expect(second.output).toContain("Cycle incremented to 2")
      expect(third.output).toContain("Cycle incremented to 3")
      expect(fourth.output).toContain("limite de ciclos atingido")
    }),
  )
})

describe("workflow pipeline agents cli", () => {
  cliIt.live(
    "workflow-executor loads rejected checklist via TestLLMServer tool chain",
    ({ home, llm, opencode }) =>
      Effect.gen(function* () {
        const projectDir = path.join(home, "workflow-cli-project")
        yield* Effect.promise(async () => {
          await writeApprovedBrief(projectDir)
          await WorkflowReview.incrementCycle(projectDir, "brief-cycle-demo")
          await WorkflowReview.writeReviewChecklist(projectDir, {
            task_id: "brief-cycle-demo",
            gates: { execution_summary_complete: "fail" },
            criteria: [{ id: "AC1", status: "fail", evidence: "missing test coverage" }],
            verdict: "rejected",
          })
        })

        yield* llm.push(
          reply().tool("cycle_tracker", { task_id: "brief-cycle-demo" }),
          reply().tool("task_approval_check", { task_id: "brief-cycle-demo" }),
          reply().tool("review_checklist_read", { task_id: "brief-cycle-demo" }),
          reply().text("loaded rejected checklist").stop(),
        )

        const run = yield* opencode.run("Start workflow cycle.", {
          agent: "workflow-executor",
          extraArgs: ["--dir", projectDir, "--dangerously-skip-permissions"],
        })
        opencode.expectExit(run, 0)
        const inputs = JSON.stringify(yield* llm.inputs)
        expect(inputs).toContain("cycle_tracker")
        expect(inputs).toContain("task_approval_check")
        expect(inputs).toContain("review_checklist_read")
        const checklist = yield* Effect.promise(() =>
          WorkflowReview.readLatestReviewChecklist(projectDir, "brief-cycle-demo"),
        )
        expect(checklist?.payload.verdict).toBe("rejected")
        expect(checklist?.payload.criteria[0]?.evidence).toContain("missing test coverage")
      }),
    120_000,
  )

  cliIt.live(
    "workflow-executor escalates when cycle_tracker hits the limit",
    ({ home, llm, opencode }) =>
      Effect.gen(function* () {
        const projectDir = path.join(home, "workflow-limit-project")
        yield* Effect.promise(() => writeApprovedBrief(projectDir))
        yield* Effect.promise(async () => {
          for (let cycle = 0; cycle < 3; cycle++) {
            await WorkflowReview.incrementCycle(projectDir, "brief-cycle-demo")
          }
        })

        yield* llm.push(
          reply().tool("cycle_tracker", { task_id: "brief-cycle-demo" }),
          reply().text("cycle limit reached").stop(),
        )

        const run = yield* opencode.run("Attempt fourth cycle.", {
          agent: "workflow-executor",
          extraArgs: ["--dir", projectDir, "--dangerously-skip-permissions"],
        })
        opencode.expectExit(run, 0)
        expect(`${run.stdout}\n${run.stderr}`).toContain("cycle limit reached")
      }),
    120_000,
  )
})

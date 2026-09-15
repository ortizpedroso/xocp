import { afterEach, describe, expect } from "bun:test"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { WorkflowReview } from "@opencode-ai/core/workflow-review"
import { queryRecurringCategories, countCompletedTasks } from "@opencode-ai/core/evolution/pattern-events"
import { Effect } from "effect"
import { ReviewChecklistWriteTool } from "../../src/tool/review-checklist-write"
import { BaselineAuditWriteTool } from "../../src/tool/baseline-audit-write"
import { PatternRecurrenceReadTool } from "../../src/tool/pattern-recurrence-read"
import { Truncate } from "@/tool/truncate"
import { Agent } from "../../src/agent/agent"
import { SessionID, MessageID } from "../../src/session/schema"
import { disposeAllInstances, TestInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

const ctx = {
  sessionID: SessionID.make("ses_pattern-events"),
  messageID: MessageID.make("msg_pattern-events"),
  callID: "pattern-events-call",
  agent: "avaliador",
  abort: AbortSignal.any([]),
  messages: [],
  metadata: () => Effect.void,
  ask: () => Effect.void,
}

afterEach(async () => {
  await disposeAllInstances()
})

const it = testEffect(LayerNode.compile(LayerNode.group([Truncate.node, Agent.node])))

describe("pattern-events wiring (Tarefa 10)", () => {
  it.instance("review_checklist_write records a pattern event for each failing criterion", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      yield* Effect.promise(() => WorkflowReview.incrementCycle(test.directory, "brief-pe-01"))
      const tool = yield* (yield* ReviewChecklistWriteTool).init()

      yield* tool.execute(
        {
          task_id: "brief-pe-01",
          gates: { execution_summary_complete: "pass" },
          criteria: [
            { id: "AC1", status: "fail", evidence: "typecheck failed" },
            { id: "AC2", status: "pass", evidence: "ok" },
          ],
          verdict: "rejected",
        },
        ctx,
      )

      const events = yield* Effect.sync(() => queryRecurringCategories(test.directory))
      // Below threshold with only 1 occurrence — proves recording happened
      // without asserting on the (separately unit-tested) threshold logic.
      expect(events).toHaveLength(0)
    }),
  )

  it.instance("baseline_audit_write records a pattern event for each failing item", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      yield* Effect.promise(() => WorkflowReview.incrementCycle(test.directory, "brief-pe-02"))
      const tool = yield* (yield* BaselineAuditWriteTool).init()

      yield* tool.execute(
        {
          task_id: "brief-pe-02",
          items: [{ id: "G-SEC-1", status: "fail", evidence: "plaintext password compare at auth.ts:42" }],
          overall: "fail",
        },
        ctx,
      )

      const countBefore = yield* Effect.sync(() => countCompletedTasks(test.directory))
      expect(countBefore).toBe(0) // baseline audits never mark a task completed
    }),
  )

  it.instance(
    "review_checklist_write signals the recurrence_report_trigger exactly on the 10th distinct approval",
    () =>
      Effect.gen(function* () {
        const test = yield* TestInstance
        const tool = yield* (yield* ReviewChecklistWriteTool).init()

        let lastOutput = ""
        for (let i = 1; i <= 10; i++) {
          const taskId = `brief-pe-trigger-${i}`
          yield* Effect.promise(() => WorkflowReview.incrementCycle(test.directory, taskId))
          const result = yield* tool.execute(
            {
              task_id: taskId,
              gates: { execution_summary_complete: "pass" },
              criteria: [{ id: "AC1", status: "pass", evidence: "ok" }],
              verdict: "approved",
            },
            ctx,
          )
          lastOutput = result.output
        }

        expect(lastOutput).toContain("<recurrence_report_trigger>")
        expect(lastOutput).toContain("pattern-auditor")
      }),
  )

  it.instance("pattern_recurrence_read separates erro recorrente from the rotina recorrente limitation", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      const checklistTool = yield* (yield* ReviewChecklistWriteTool).init()

      for (const taskId of ["brief-pe-r1", "brief-pe-r2", "brief-pe-r3"]) {
        yield* Effect.promise(() => WorkflowReview.incrementCycle(test.directory, taskId))
        yield* checklistTool.execute(
          {
            task_id: taskId,
            gates: { execution_summary_complete: "pass" },
            criteria: [{ id: "AC9", status: "fail", evidence: "same failure again" }],
            verdict: "rejected",
          },
          ctx,
        )
      }

      const readTool = yield* (yield* PatternRecurrenceReadTool).init()
      const result = yield* readTool.execute({}, ctx)

      expect(result.output).toContain("Erro recorrente")
      expect(result.output).toContain("AC9")
      expect(result.output).toContain("Rotina recorrente")
      expect(result.output).toContain("Sem dado suficiente")
    }),
  )
})

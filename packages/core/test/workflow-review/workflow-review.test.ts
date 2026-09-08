import { afterEach, describe, expect, test } from "bun:test"
import fs from "fs/promises"
import os from "os"
import path from "path"
import { WorkflowReview } from "@opencode-ai/core/workflow-review"

const dirs: string[] = []

afterEach(async () => {
  for (const dir of dirs.splice(0)) {
    await fs.rm(dir, { recursive: true, force: true })
  }
})

async function tmpdir() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "workflow-review-"))
  dirs.push(dir)
  return dir
}

const specApproved = `---
status: aprovada
versao: "1.0"
---

# Spec
`

const specDraft = specApproved.replace("aprovada", "rascunho")

const briefApproved = `brief_id: brief-demo-01
status: aprovada
task_summary: demo
`

const briefDraft = briefApproved.replace("aprovada", "aguardando_aprovacao")

describe("WorkflowReview", () => {
  test("cycle_tracker: missing file starts at 0 and limit 3 is enforced", async () => {
    const dir = await tmpdir()
    const task_id = "brief-cycle-01"

    expect(await WorkflowReview.readCycle(dir, task_id)).toBe(0)
    expect(await WorkflowReview.incrementCycle(dir, task_id)).toBe(1)
    expect(await WorkflowReview.incrementCycle(dir, task_id)).toBe(2)
    expect(await WorkflowReview.incrementCycle(dir, task_id)).toBe(3)

    await expect(WorkflowReview.incrementCycle(dir, task_id)).rejects.toMatchObject({
      _tag: "WorkflowReview.CycleLimitExceeded",
      cycle: 4,
    })
  })

  test("execution_summary_write rejects status complete when incomplete is non-empty", async () => {
    const dir = await tmpdir()
    const task_id = "brief-summary-01"
    await WorkflowReview.incrementCycle(dir, task_id)

    await expect(
      WorkflowReview.writeExecutionSummary(dir, {
        task_id,
        completed: [{ item: "AC1", evidence: "done" }],
        incomplete: [{ item: "AC2", reason: "blocked", category: "duvida_humana" }],
        status: "complete",
      }),
    ).rejects.toMatchObject({ _tag: "WorkflowReview.CompleteWithIncomplete" })
  })

  test("task_approval_check refuses non-aprovada for Spec and Brief task_ids", async () => {
    const dir = await tmpdir()

    await fs.mkdir(path.join(dir, "specs"), { recursive: true })
    await fs.writeFile(path.join(dir, "specs/demo.md"), specDraft)
    await fs.mkdir(path.join(dir, ".opencode/briefs"), { recursive: true })
    await fs.writeFile(path.join(dir, ".opencode/briefs/brief-demo-01.yaml"), briefDraft)

    await expect(WorkflowReview.taskApprovalCheck(dir, "spec:demo:G1")).rejects.toMatchObject({
      _tag: "WorkflowReview.NotApproved",
      status: "rascunho",
    })

    await expect(WorkflowReview.taskApprovalCheck(dir, "brief-demo-01")).rejects.toMatchObject({
      _tag: "WorkflowReview.NotApproved",
      status: "aguardando_aprovacao",
    })
  })

  test("review_checklist_write accepts absent spec gates for Brief tasks", async () => {
    const dir = await tmpdir()
    const task_id = "brief-checklist-01"
    await WorkflowReview.incrementCycle(dir, task_id)

    const result = await WorkflowReview.writeReviewChecklist(dir, {
      task_id,
      gates: { execution_summary_complete: "pass" },
      criteria: [{ id: "AC1", status: "pass", evidence: "verified" }],
      verdict: "approved",
    })

    expect(result.payload.gates.spec_updated).toBeUndefined()
    expect(result.payload.gates.norm_sources_verified).toBeUndefined()
    expect(result.payload.gates.execution_summary_complete).toBe("pass")

    await expect(
      WorkflowReview.writeReviewChecklist(dir, {
        task_id,
        gates: {
          execution_summary_complete: "pass",
          spec_updated: "pass",
        },
        criteria: [],
        verdict: "rejected",
      }),
    ).rejects.toMatchObject({ _tag: "WorkflowReview.InvalidGates" })
  })

  test("task_approval_check approves when status is aprovada", async () => {
    const dir = await tmpdir()
    await fs.mkdir(path.join(dir, "specs"), { recursive: true })
    await fs.writeFile(path.join(dir, "specs/demo.md"), specApproved)

    const contract = await WorkflowReview.taskApprovalCheck(dir, "spec:demo:G1")
    expect(contract.status).toBe("aprovada")
  })

  test("execution_summary_write persists cumulative summary for current cycle", async () => {
    const dir = await tmpdir()
    const task_id = "brief-summary-02"
    await WorkflowReview.incrementCycle(dir, task_id)

    await WorkflowReview.writeExecutionSummary(dir, {
      task_id,
      completed: [{ item: "AC1", evidence: "test passed" }],
      incomplete: [],
      status: "complete",
    })

    const latest = await WorkflowReview.readLatestExecutionSummary(dir, task_id)
    expect(latest?.payload.status).toBe("complete")
    expect(latest?.payload.cycle).toBe(1)
  })

  test("review_checklist_write accepts verdict \"failed\", distinct from \"rejected\"", async () => {
    const dir = await tmpdir()
    const task_id = "brief-checklist-02"
    await WorkflowReview.incrementCycle(dir, task_id)

    const result = await WorkflowReview.writeReviewChecklist(dir, {
      task_id,
      gates: { execution_summary_complete: "fail" },
      criteria: [{ id: "AC1", status: "fail", evidence: "AC1 and AC2 contradict each other as written" }],
      verdict: "failed",
    })

    expect(result.payload.verdict).toBe("failed")

    const latest = await WorkflowReview.readLatestReviewChecklist(dir, task_id)
    expect(latest?.payload.verdict).toBe("failed")
  })

  test("execution_summary_write persists external_source on a completed item", async () => {
    const dir = await tmpdir()
    const task_id = "brief-summary-03"
    await WorkflowReview.incrementCycle(dir, task_id)

    await WorkflowReview.writeExecutionSummary(dir, {
      task_id,
      completed: [
        {
          item: "AC1",
          evidence: "third-party docs say this call is safe",
          external_source: "https://example.com/docs",
        },
      ],
      incomplete: [],
      status: "complete",
    })

    const latest = await WorkflowReview.readLatestExecutionSummary(dir, task_id)
    expect(latest?.payload.completed[0]?.external_source).toBe("https://example.com/docs")
  })
})

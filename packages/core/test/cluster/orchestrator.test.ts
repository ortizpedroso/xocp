import { describe, expect, test } from "bun:test"
import fs from "fs/promises"
import os from "os"
import path from "path"
import { DagOrchestrator } from "../../src/cluster/orchestrator"
import { DagStore } from "../../src/cluster/dag-store"

async function tmpDir(prefix: string): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix))
}

async function rmBestEffort(dir: string) {
  await fs.rm(dir, { recursive: true, force: true }).catch(() => {})
}

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

function briefB() {
  return `brief_id: brief-b
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
}

const BRIEF_C = `brief_id: brief-c
version: 1
task_summary: "rascunho de frontend"
status: rascunho
depends_on: []
files_expected_touched:
  - packages/app/src/main.tsx
`

describe("cluster/orchestrator DagOrchestrator", () => {
  test("loads only approved briefs, infers clusters and blocks depends_on", async () => {
    const dir = await tmpDir("dag-orch-")
    try {
      await writeBrief(dir, BRIEF_A)
      await writeBrief(dir, briefB())
      await writeBrief(dir, BRIEF_C)

      const orch = await DagOrchestrator.open(dir)
      const dispatcher = orch.getDispatcher()

      expect(dispatcher.getNode("brief-a")?.status).toBe("pending")
      expect(dispatcher.getNode("brief-b")?.status).toBe("blocked")
      expect(dispatcher.getNode("brief-c")).toBeUndefined()

      const wave0 = orch.readyWaves()[0]
      expect(wave0.map((b) => b.brief_id)).toEqual(["brief-a"])
      expect(dispatcher.getNode("brief-a")?.brief.domain_cluster).toBe("core")

      orch.save()
    } finally {
      await rmBestEffort(dir)
    }
  })

  test("applies Avaliador verdicts from disk and unblocks downstream", async () => {
    const dir = await tmpDir("dag-orch-")
    try {
      await writeBrief(dir, BRIEF_A)
      await writeBrief(dir, briefB())

      const orch = await DagOrchestrator.open(dir)
      await writeVerdict(dir, "brief-a", "approved")

      const { applied } = await orch.applyVerdicts()
      expect(applied).toBe(1)
      const dispatcher = orch.getDispatcher()
      expect(dispatcher.getNode("brief-a")?.status).toBe("completed")
      expect(dispatcher.getNode("brief-b")?.status).toBe("pending")
      expect(orch.readyWaves()[0].map((b) => b.brief_id)).toEqual(["brief-b"])
    } finally {
      await rmBestEffort(dir)
    }
  })

  test("redirects a rejected brief while an independent one proceeds", async () => {
    const dir = await tmpDir("dag-orch-")
    try {
      await writeBrief(dir, BRIEF_A)
      const briefA2 = BRIEF_A.replace("brief_id: brief-a", "brief_id: brief-c2").replace(
        "packages/core/src/db/schema.ts",
        "packages/server/src/api/independent.ts",
      )
      await writeBrief(dir, briefA2)

      const orch = await DagOrchestrator.open(dir)
      await writeVerdict(dir, "brief-a", "rejected")
      await orch.applyVerdicts()
      expect(orch.getDispatcher().getNode("brief-a")?.status).toBe("failed")
      expect(orch.getDispatcher().getNode("brief-c2")?.status).toBe("pending")
    } finally {
      await rmBestEffort(dir)
    }
  })

  test("reopens persisted state from dag.db after a crash-like restart", async () => {
    const dir = await tmpDir("dag-orch-")
    const store = new DagStore(dir)
    try {
      await writeBrief(dir, BRIEF_A)
      await writeBrief(dir, briefB())

      let orch = await DagOrchestrator.open(dir, { store })
      await writeVerdict(dir, "brief-a", "approved")
      await orch.applyVerdicts()

      orch = await DagOrchestrator.open(dir, { store })
      const dispatcher = orch.getDispatcher()
      expect(dispatcher.getNode("brief-a")?.status).toBe("completed")
      expect(dispatcher.getNode("brief-b")?.status).toBe("pending")
      expect(dispatcher.getExecutableBriefs().map((b) => b.brief_id)).toContain("brief-b")
    } finally {
      store.close()
      await rmBestEffort(dir)
    }
  })

  test("shouldRun override includes non-approved briefs", async () => {
    const dir = await tmpDir("dag-orch-")
    try {
      await writeBrief(dir, BRIEF_C)
      const orch = await DagOrchestrator.open(dir, {
        shouldRun: () => true,
      })
      expect(orch.getDispatcher().getNode("brief-c")).toBeDefined()
    } finally {
      await rmBestEffort(dir)
    }
  })
})
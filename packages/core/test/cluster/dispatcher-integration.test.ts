import { describe, expect, test } from "bun:test"
import fs from "fs/promises"
import os from "os"
import path from "path"
import { ClusterDispatcher } from "../../src/cluster/dispatcher"
import { DagStore } from "../../src/cluster/dag-store"
import { applyReviewVerdictsFromDisk } from "../../src/cluster/verdict"
import type { TechnicalBriefV2 } from "../../src/brief/types"

async function rmBestEffort(dir: string) {
  await fs.rm(dir, { recursive: true, force: true }).catch(() => {})
}

function brief(id: string, opts: Partial<TechnicalBriefV2> = {}): TechnicalBriefV2 {
  return {
    schema_version: "2.0",
    brief_id: id,
    task_id: `task-${id}`,
    domain_cluster: "core",
    depends_on: [],
    files_scope: {
      allow_modify: [`packages/core/${id}.ts`],
      allow_read_only: [],
      strictly_forbidden: [],
    },
    contracts: { exported_symbols: [], function_signatures: [] },
    verification_gates: { shell_checks: [], baseline_rules: [] },
    ...opts,
  }
}

describe("cluster/dispatcher integration cluster", () => {
  test("integration brief blocks until its dependencies approve, then runs", async () => {
    const a = brief("a")
    const int = brief("int", {
      domain_cluster: "integration",
      depends_on: ["a"],
      files_scope: {
        allow_modify: ["packages/protocol/src/contracts.ts"],
        allow_read_only: [],
        strictly_forbidden: [],
      },
    })

    const dispatcher = new ClusterDispatcher([a, int])
    expect(dispatcher.getNode("int")?.status).toBe("blocked")

    dispatcher.markRunning("a")
    dispatcher.markCompleted("a", true)

    const ready = dispatcher.getExecutableBriefs().map((b) => b.brief_id)
    expect(ready).toContain("int")

    const ctx = dispatcher.markRunning("int")
    expect(ctx.clusterId).toBe("integration")
    expect(ctx.delegationDepth).toBe(1)

    dispatcher.markCompleted("int", true)
    expect(dispatcher.isComplete()).toBe(true)
  })

  test("executeAll emits a synthesis report for the integration cluster", async () => {
    const a = brief("a")
    const int = brief("int", {
      domain_cluster: "integration",
      depends_on: ["a"],
      files_scope: {
        allow_modify: ["packages/protocol/src/contracts.ts"],
        allow_read_only: [],
        strictly_forbidden: [],
      },
    })
    const result = await new ClusterDispatcher([a, int]).executeAll(async () => true)
    expect(result.completedCount).toBe(2)
    expect(result.failedCount).toBe(0)
    expect(result.synthesisReports.integration.briefsHandled).toContain("int")
    expect(result.synthesisReports.integration.allApproved).toBe(true)
  })
})

describe("cluster/dispatcher applyVerdict", () => {
  const pair = () => {
    const a = brief("a")
    const be = brief("be", { depends_on: ["a"] })
    return { dispatcher: new ClusterDispatcher([a, be]) }
  }

  test("approved unblocks downstream depends_on", () => {
    const { dispatcher } = pair()
    expect(dispatcher.getNode("be")?.status).toBe("blocked")
    dispatcher.applyVerdict("a", "approved")
    expect(dispatcher.getNode("a")?.status).toBe("completed")
    expect(dispatcher.getNode("a")?.reviewVerdict).toBe("approved")
    expect(dispatcher.getExecutableBriefs().map((b) => b.brief_id)).toContain("be")
  })

  test("rejected fails the node and keeps downstream blocked", () => {
    const { dispatcher } = pair()
    dispatcher.applyVerdict("a", "rejected")
    expect(dispatcher.getNode("a")?.status).toBe("failed")
    expect(dispatcher.getNode("a")?.reviewVerdict).toBe("rejected")
    expect(dispatcher.getNode("be")?.status).toBe("blocked")
    expect(dispatcher.hasFailures()).toBe(true)
  })

  test("failed is terminal, node stops with no fix cycle", () => {
    const { dispatcher } = pair()
    dispatcher.applyVerdict("a", "failed")
    expect(dispatcher.getNode("a")?.status).toBe("failed")
    expect(dispatcher.getNode("a")?.reviewVerdict).toBe("failed")
    expect(dispatcher.getNode("a")?.error).toMatch(/escalated/)
  })
})

describe("cluster/dispatcher snapshot + DagStore round-trip", () => {
  test("toSnapshot/hydrate restores node states and completion", () => {
    const a = brief("a")
    const be = brief("be", { depends_on: ["a"] })

    const d1 = new ClusterDispatcher([a, be])
    d1.markRunning("a")
    d1.markCompleted("a", true)
    const snap = d1.toSnapshot()

    const d2 = new ClusterDispatcher([a, be], snap)
    expect(d2.getNode("a")?.status).toBe("completed")
    expect(d2.getExecutableBriefs().map((b) => b.brief_id)).toContain("be")
  })

  test("DagStore persists and reloads the full DAG state", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "dag-store-"))
    try {
      const a = brief("a")
      const be = brief("be", { depends_on: ["a"] })
      const d1 = new ClusterDispatcher([a, be])
      d1.markRunning("a")
      d1.markCompleted("a", true)

      const store = new DagStore(dir)
      store.save(d1.toSnapshot())

      const loaded = store.load()
      expect(loaded.nodes.length).toBe(2)
      expect(loaded.completedBriefIds).toContain("a")
      const statuses = new Map(loaded.nodes.map((n) => [n.brief_id, n.status]))
expect(statuses.get("a")).toBe("completed")
      expect(statuses.get("be")).toBe("pending")

      const d2 = new ClusterDispatcher([a, be], loaded)
      expect(d2.getExecutableBriefs().map((b) => b.brief_id)).toContain("be")

      store.close()
    } finally {
      await rmBestEffort(dir)
    }
  })
})

describe("cluster/dispatcher applyReviewVerdictsFromDisk", () => {
  test("reads the latest review_checklist per task and applies its verdict", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "dag-verdict-"))
    try {
      const a = brief("a")
      const be = brief("be", { depends_on: ["a"] })

      const reviewsDir = path.join(dir, ".opencode", "reviews", "task-a")
      await fs.mkdir(reviewsDir, { recursive: true })
      await Bun.write(
        path.join(reviewsDir, "cycle-1.json"),
        JSON.stringify({
          task_id: "task-a",
          cycle: 1,
          gates: { execution_summary_complete: "pass" },
          criteria: [{ id: "c1", status: "pass", evidence: "fixture" }],
          verdict: "approved",
          timestamp: new Date().toISOString(),
        }),
      )

      const dispatcher = new ClusterDispatcher([a, be])
      const { applied } = await applyReviewVerdictsFromDisk(dir, dispatcher)
      expect(applied).toBe(1)
      expect(dispatcher.getNode("a")?.status).toBe("completed")
      expect(dispatcher.getExecutableBriefs().map((b) => b.brief_id)).toContain("be")
    } finally {
      await rmBestEffort(dir)
    }
  })

  test("verdict 'failed' stops the node without unblocking downstream", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "dag-verdict-"))
    try {
      const a = brief("a")
      const be = brief("be", { depends_on: ["a"] })

      const reviewsDir = path.join(dir, ".opencode", "reviews", "task-a")
      await fs.mkdir(reviewsDir, { recursive: true })
      await Bun.write(
        path.join(reviewsDir, "cycle-1.json"),
        JSON.stringify({
          task_id: "task-a",
          cycle: 1,
          gates: { execution_summary_complete: "pass" },
          criteria: [{ id: "c1", status: "pass", evidence: "fixture" }],
          verdict: "failed",
          timestamp: new Date().toISOString(),
        }),
      )

      const dispatcher = new ClusterDispatcher([a, be])
      await applyReviewVerdictsFromDisk(dir, dispatcher)
      expect(dispatcher.getNode("a")?.status).toBe("failed")
      expect(dispatcher.getNode("be")?.status).toBe("blocked")
      expect(dispatcher.hasFailures()).toBe(true)
    } finally {
      await rmBestEffort(dir)
    }
  })
})

describe("cluster/dispatcher scope gate in executeAll", () => {
  test("overlapping briefs never run concurrently; independent ones do", async () => {
    const a = brief("a", {
      files_scope: {
        allow_modify: ["packages/schema/**"],
        allow_read_only: [],
        strictly_forbidden: [],
      },
    })
    const b = brief("b", {
      files_scope: {
        allow_modify: ["packages/schema/src/user.ts"],
        allow_read_only: [],
        strictly_forbidden: [],
      },
    })
    const c = brief("c", {
      files_scope: {
        allow_modify: ["packages/app/src/main.tsx"],
        allow_read_only: [],
        strictly_forbidden: [],
      },
    })

    let running = new Set<string>()
    let maxConcurrent = 0

    const dispatcher = new ClusterDispatcher([a, b, c])
    const result = await dispatcher.executeAll(async (br) => {
      running.add(br.brief_id)
      maxConcurrent = Math.max(maxConcurrent, running.size)
      await Bun.sleep(5)
      running.delete(br.brief_id)
      return true
    })

expect(result.completedCount).toBe(3)
    expect(result.failedCount).toBe(0)
    expect(maxConcurrent).toBe(2)
    expect(dispatcher.isComplete()).toBe(true)
  })

  test("a failing node does not stop independent branches; its downstream stays blocked", async () => {
    const a = brief("a")
    const be = brief("be", { depends_on: ["a"] })
    const c = brief("c")
    const d = brief("d")

    const dispatcher = new ClusterDispatcher([a, be, c, d])
    const result = await dispatcher.executeAll(async (br) => {
      if (br.brief_id === "a") return false
      return true
    })

    expect(result.completedCount).toBe(2)
    expect(result.failedCount).toBe(1)
    expect(dispatcher.getNode("a")?.status).toBe("failed")
    expect(dispatcher.getNode("be")?.status).toBe("blocked")
    expect(dispatcher.getNode("c")?.status).toBe("completed")
    expect(dispatcher.getNode("d")?.status).toBe("completed")
    expect(dispatcher.hasFailures()).toBe(true)
    expect(dispatcher.isComplete()).toBe(false)
  })
})

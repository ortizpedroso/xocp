import { describe, expect, test } from "bun:test"
import { ClusterDispatcher } from "../../src/cluster/dispatcher"
import type { TechnicalBriefV2 } from "../../src/brief/types"

describe("cluster/dispatcher DAG resolution", () => {
  const briefCore: TechnicalBriefV2 = {
    schema_version: "2.0",
    brief_id: "brief-core-schema",
    task_id: "task-core-01",
    domain_cluster: "core",
    depends_on: [],
    files_scope: {
      allow_modify: ["packages/core/src/db/schema.ts"],
      allow_read_only: [],
      strictly_forbidden: ["packages/app/src/main.tsx"],
    },
    contracts: {
      exported_symbols: ["UserTable"],
      function_signatures: [],
    },
    verification_gates: {
      shell_checks: ["bun test test/core/schema.test.ts"],
      baseline_rules: ["G-SEC-1"],
    },
  }

  const briefFrontendStatic: TechnicalBriefV2 = {
    schema_version: "2.0",
    brief_id: "brief-frontend-tokens",
    task_id: "task-fe-01",
    domain_cluster: "frontend",
    depends_on: [],
    files_scope: {
      allow_modify: ["packages/app/src/theme/tokens.ts"],
      allow_read_only: [],
      strictly_forbidden: [],
    },
    contracts: {
      exported_symbols: ["ColorTokens"],
      function_signatures: [],
    },
    verification_gates: {
      shell_checks: [],
      baseline_rules: ["G-UX-5"],
    },
  }

  const briefBackendEndpoint: TechnicalBriefV2 = {
    schema_version: "2.0",
    brief_id: "brief-backend-api",
    task_id: "task-be-01",
    domain_cluster: "backend",
    depends_on: ["brief-core-schema"], // Blocked until core completes
    files_scope: {
      allow_modify: ["packages/server/src/api/users.ts"],
      allow_read_only: ["packages/core/src/db/schema.ts"],
      strictly_forbidden: [],
    },
    contracts: {
      exported_symbols: ["handleUsersGet"],
      function_signatures: [],
    },
    verification_gates: {
      shell_checks: ["bun test test/api/users.test.ts"],
      baseline_rules: ["G-SEC-2"],
    },
  }

  test("independent tasks run in parallel, dependent tasks remain blocked until prerequisites pass", async () => {
    const dispatcher = new ClusterDispatcher([
      briefCore,
      briefFrontendStatic,
      briefBackendEndpoint,
    ])

    // Initially: briefCore and briefFrontendStatic have depends_on: [] -> executable immediately
    const initialReady = dispatcher.getExecutableBriefs()
    expect(initialReady.length).toBe(2)
    const initialIds = initialReady.map((b) => b.brief_id)
    expect(initialIds).toContain("brief-core-schema")
    expect(initialIds).toContain("brief-frontend-tokens")
    expect(initialIds).not.toContain("brief-backend-api")

    // Node state verification
    expect(dispatcher.getNode("brief-backend-api")?.status).toBe("blocked")

    // Worker contexts are created with depth = 1
    const workerCtxCore = dispatcher.markRunning("brief-core-schema")
    expect(workerCtxCore.delegationDepth).toBe(1)
    expect(workerCtxCore.clusterId).toBe("core")

    const workerCtxFE = dispatcher.markRunning("brief-frontend-tokens")
    expect(workerCtxFE.delegationDepth).toBe(1)
    expect(workerCtxFE.clusterId).toBe("frontend")

    // Mark Core completed & approved
    dispatcher.markCompleted("brief-core-schema", true)
    dispatcher.markCompleted("brief-frontend-tokens", true)

    // Now backend is unblocked automatically
    const nextReady = dispatcher.getExecutableBriefs()
    expect(nextReady.length).toBe(1)
    expect(nextReady[0].brief_id).toBe("brief-backend-api")

    const workerCtxBE = dispatcher.markRunning("brief-backend-api")
    expect(workerCtxBE.clusterId).toBe("backend")
    dispatcher.markCompleted("brief-backend-api", true)

    expect(dispatcher.isComplete()).toBe(true)
    expect(dispatcher.hasFailures()).toBe(false)
  })

  test("executeAll simulates complete DAG workflow with synthesis reports", async () => {
    const dispatcher = new ClusterDispatcher([
      briefCore,
      briefFrontendStatic,
      briefBackendEndpoint,
    ])

    const executionLog: string[] = []

    const result = await dispatcher.executeAll(async (brief, workerCtx) => {
      executionLog.push(`${workerCtx.clusterId}:${brief.brief_id}`)
      return true
    })

    expect(result.completedCount).toBe(3)
    expect(result.failedCount).toBe(0)
    expect(result.synthesisReports.core.allApproved).toBe(true)
    expect(result.synthesisReports.core.briefsHandled).toContain("brief-core-schema")
    expect(result.synthesisReports.backend.briefsHandled).toContain("brief-backend-api")
    expect(result.synthesisReports.frontend.briefsHandled).toContain("brief-frontend-tokens")

    // Verify ordering: core was executed before backend
    const coreIdx = executionLog.indexOf("core:brief-core-schema")
    const beIdx = executionLog.indexOf("backend:brief-backend-api")
    expect(coreIdx).toBeLessThan(beIdx)
  })
})

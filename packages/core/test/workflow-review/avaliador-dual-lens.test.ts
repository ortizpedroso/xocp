import { describe, expect, test } from "bun:test"
import { evaluateDualLens } from "../../src/workflow-review/avaliador"
import type { TechnicalBriefV2 } from "../../src/brief/types"

describe("workflow-review/avaliador Dual-Lens Verification", () => {
  const sampleBrief: TechnicalBriefV2 = {
    schema_version: "2.0",
    brief_id: "brief-auth-session-01",
    task_id: "task-auth-01",
    domain_cluster: "backend",
    depends_on: [],
    files_scope: {
      allow_modify: [
        "packages/server/src/auth/session.ts",
        "packages/server/src/auth/token.ts",
      ],
      allow_read_only: [
        "packages/core/src/types.ts",
      ],
      strictly_forbidden: [
        "packages/core/src/global.ts",
        "packages/server/src/keys.ts",
      ],
    },
    contracts: {
      exported_symbols: ["createSession", "verifyToken"],
      function_signatures: [],
    },
    verification_gates: {
      shell_checks: [
        "bun typecheck",
        "bun test test/auth/session.test.ts",
      ],
      baseline_rules: ["G-SEC-1", "G-SEC-2"],
    },
  }

  test("Lens 1: Rejection when tests fail (Evidence failure)", async () => {
    const diffFiles = [
      "packages/server/src/auth/session.ts",
    ]

    // Simulate shell test failure
    const shellRunner = async (cmd: string) => {
      if (cmd.includes("bun test")) {
        return { success: false, output: "AssertionError: expected 200 got 500" }
      }
      return { success: true, output: "Clean typecheck" }
    }

    const review = await evaluateDualLens({
      directory: "/app",
      brief: sampleBrief,
      diffFiles,
      shellRunner,
    })

    expect(review.verdict).toBe("rejected")
    expect(review.reason).toBe("INSUFFICIENT_EVIDENCE")
    expect(review.lensEvidence.passed).toBe(false)
    expect(review.lensEvidence.failures.length).toBe(1)
    expect(review.lensEvidence.failures[0]).toContain("bun test")
  })

  test("Lens 2: Rejection when out-of-scope or strictly forbidden files are touched (Impact failure)", async () => {
    // Tests pass, but git diff touches a strictly_forbidden file
    const diffWithForbidden = [
      "packages/server/src/auth/session.ts",
      "packages/server/src/keys.ts", // FORBIDDEN!
    ]

    const shellRunner = async () => ({ success: true, output: "Tests passed cleanly" })

    const reviewForbidden = await evaluateDualLens({
      directory: "/app",
      brief: sampleBrief,
      diffFiles: diffWithForbidden,
      shellRunner,
    })

    expect(reviewForbidden.verdict).toBe("rejected")
    expect(reviewForbidden.reason).toBe("UNACCEPTABLE_IMPACT")
    expect(reviewForbidden.lensEvidence.passed).toBe(true)
    expect(reviewForbidden.lensImpact.passed).toBe(false)
    expect(reviewForbidden.lensImpact.violations[0]).toContain("strictly forbidden")

    // Out-of-scope unmapped file modified
    const diffWithUnmapped = [
      "packages/server/src/auth/session.ts",
      "packages/app/src/random-file.ts", // UNMAPPED!
    ]

    const reviewUnmapped = await evaluateDualLens({
      directory: "/app",
      brief: sampleBrief,
      diffFiles: diffWithUnmapped,
      shellRunner,
    })

    expect(reviewUnmapped.verdict).toBe("rejected")
    expect(reviewUnmapped.reason).toBe("UNACCEPTABLE_IMPACT")
    expect(reviewUnmapped.lensImpact.violations[0]).toContain("out-of-scope")
  })

  test("Approval: Returns approved only when BOTH Lens 1 and Lens 2 pass with 100% compliance", async () => {
    const validDiff = [
      "packages/server/src/auth/session.ts",
      "packages/server/src/auth/token.ts",
    ]

    const shellRunner = async () => ({ success: true, output: "All checks passed 100%" })

    const review = await evaluateDualLens({
      directory: "/app",
      brief: sampleBrief,
      diffFiles: validDiff,
      shellRunner,
    })

    expect(review.verdict).toBe("approved")
    expect(review.reason).toBe("ALL_CRITERIA_MET")
    expect(review.lensEvidence.passed).toBe(true)
    expect(review.lensImpact.passed).toBe(true)
    expect(review.blindChecklist.unmappedModifications.length).toBe(0)
  })
})

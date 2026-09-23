import { describe, expect, test } from "bun:test"
import { evaluateDualLens, computeCumulativeDiffFiles } from "../../src/workflow-review/avaliador"
import type { TechnicalBriefV2 } from "../../src/brief/types"
import { $ } from "bun"
import fs from "fs/promises"
import path from "path"
import os from "os"

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

describe("workflow-review/avaliador anti-salami cumulative diff", () => {
  async function makeSalamiRepo() {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "avaliador-anti-salami-"))
    const git = (args: string) => $`git ${{ raw: args }}`.cwd(directory).quiet()
    await git("init -q -b main")
    await git("config user.email test@example.com")
    await git("config user.name test")
    await fs.writeFile(path.join(directory, "base.ts"), "export const base = 1\n")
    await git("add base.ts")
    await git("commit -q -m base")
    await git("checkout -q -b feature/task")

    // Cycle 1: touches an in-scope file, committed on its own.
    await fs.writeFile(path.join(directory, "in-scope.ts"), "export const inScope = 1\n")
    await git("add in-scope.ts")
    await git("commit -q -m cycle1")

    // Cycle 2: touches a second, out-of-scope file in a *separate* commit — a
    // per-commit diff would only see this one, hiding the cycle-1 change (salami slicing).
    await fs.writeFile(path.join(directory, "out-of-scope.ts"), "export const outOfScope = 1\n")
    await git("add out-of-scope.ts")
    await git("commit -q -m cycle2")

    return directory
  }

  test("computeCumulativeDiffFiles sees every cycle's changes against the base branch", async () => {
    const directory = await makeSalamiRepo()

    const cumulative = await computeCumulativeDiffFiles(directory, "main")
    expect(cumulative.sort()).toEqual(["in-scope.ts", "out-of-scope.ts"])

    // A diff scoped to only the latest commit would miss the cycle-1 file —
    // proving the bug this default closes.
    const lastCommitOnly = await computeCumulativeDiffFiles(directory, "HEAD~1")
    expect(lastCommitOnly).toEqual(["out-of-scope.ts"])
  })

  test("evaluateDualLens defaults to the cumulative diff when diffFiles is omitted", async () => {
    const directory = await makeSalamiRepo()

    const brief: TechnicalBriefV2 = {
      schema_version: "2.0",
      brief_id: "brief-anti-salami-01",
      task_id: "task-anti-salami-01",
      domain_cluster: "core",
      depends_on: [],
      files_scope: {
        allow_modify: ["in-scope.ts"],
        allow_read_only: [],
        strictly_forbidden: [],
      },
      contracts: { exported_symbols: [], function_signatures: [] },
      verification_gates: { shell_checks: [], baseline_rules: [] },
    }

    const review = await evaluateDualLens({
      directory,
      brief,
      baseBranch: "main",
      shellRunner: async () => ({ success: true, output: "ok" }),
    })

    // out-of-scope.ts only shows up because the default compares against the
    // full base-branch diff, not just the active cycle's commit.
    expect(review.lensImpact.modifiedFiles.sort()).toEqual(["in-scope.ts", "out-of-scope.ts"])
    expect(review.verdict).toBe("rejected")
    expect(review.reason).toBe("UNACCEPTABLE_IMPACT")
    expect(review.lensImpact.violations).toContain("Modified out-of-scope unmapped file: out-of-scope.ts")
  })
})

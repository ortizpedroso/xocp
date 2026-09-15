import type { TechnicalBriefV2 } from "../brief/types"
import { readContractStatus } from "./contract"
import { writeReviewChecklist, type ReviewGates, type ReviewCriterion } from "./review-checklist"

export type LensVerdict = "approved" | "rejected"

export interface LensEvidenceResult {
  passed: boolean
  commandOutputs: Array<{ command: string; success: boolean; output: string }>
  failures: string[]
}

export interface LensImpactResult {
  passed: boolean
  violations: string[]
  modifiedFiles: string[]
}

export interface DualLensReviewResult {
  verdict: "approved" | "rejected"
  reason?: "INSUFFICIENT_EVIDENCE" | "UNACCEPTABLE_IMPACT" | "ALL_CRITERIA_MET"
  lensEvidence: LensEvidenceResult
  lensImpact: LensImpactResult
  blindChecklist: {
    expectedModifications: string[]
    actualModifications: string[]
    unmappedModifications: string[]
  }
}

export interface DualLensRunnerOptions {
  directory: string
  brief: TechnicalBriefV2
  diffFiles: string[] // List of files modified in git diff
  shellRunner?: (command: string) => Promise<{ success: boolean; output: string }>
}

/**
 * The Dual-Lens Rigorous Avaliador
 * Operates under Zero-Trust policy:
 * - Lens 1: Evidence Panel (shell checks: typecheck, tests) -> Failure = INSUFFICIENT_EVIDENCE
 * - Lens 2: Impact Panel (scope violations, forbidden files) -> Failure = UNACCEPTABLE_IMPACT
 * - Blind Validation: Inspects diff independently of executor's claims
 * - Approved only if BOTH Lens 1 and Lens 2 pass with 100% compliance.
 */
export async function evaluateDualLens(options: DualLensRunnerOptions): Promise<DualLensReviewResult> {
  const { directory, brief, diffFiles } = options

  // 1. Blind Validation: analyze brief and diff independently
  const expectedModifications = [...brief.files_scope.allow_modify]
  const forbiddenFiles = new Set(brief.files_scope.strictly_forbidden)
  const allowedSet = new Set(brief.files_scope.allow_modify)

  const actualModifications = [...diffFiles]
  const unmappedModifications = diffFiles.filter(
    (file) => !allowedSet.has(file)
  )

  // 2. Lens 1: Evidence Panel (Deterministic shell verification)
  const commandOutputs: Array<{ command: string; success: boolean; output: string }> = []
  const evidenceFailures: string[] = []

  const runner = options.shellRunner || (async (cmd: string) => {
    try {
      const proc = Bun.spawnSync(["sh", "-c", cmd], { cwd: directory })
      const stdout = proc.stdout ? Buffer.from(proc.stdout).toString() : ""
      const stderr = proc.stderr ? Buffer.from(proc.stderr).toString() : ""
      const success = proc.exitCode === 0
      return { success, output: (stdout + "\n" + stderr).trim() }
    } catch (err: any) {
      return { success: false, output: err?.message || String(err) }
    }
  })

  // Execute shell checks from verification_gates
  for (const checkCmd of brief.verification_gates.shell_checks) {
    const res = await runner(checkCmd)
    commandOutputs.push({ command: checkCmd, success: res.success, output: res.output })
    if (!res.success) {
      evidenceFailures.push(`Command '${checkCmd}' failed: ${res.output.slice(0, 200)}`)
    }
  }

  const lensEvidence: LensEvidenceResult = {
    passed: evidenceFailures.length === 0,
    commandOutputs,
    failures: evidenceFailures,
  }

  // 3. Lens 2: Impact Panel (Check strictly_forbidden and scope boundaries)
  const impactViolations: string[] = []

  for (const file of diffFiles) {
    if (forbiddenFiles.has(file)) {
      impactViolations.push(`Modified strictly forbidden file: ${file}`)
    } else if (!allowedSet.has(file)) {
      impactViolations.push(`Modified out-of-scope unmapped file: ${file}`)
    }
  }

  const lensImpact: LensImpactResult = {
    passed: impactViolations.length === 0,
    violations: impactViolations,
    modifiedFiles: diffFiles,
  }

  // Determine Overall Verdict
  if (!lensEvidence.passed) {
    return {
      verdict: "rejected",
      reason: "INSUFFICIENT_EVIDENCE",
      lensEvidence,
      lensImpact,
      blindChecklist: {
        expectedModifications,
        actualModifications,
        unmappedModifications,
      },
    }
  }

  if (!lensImpact.passed) {
    return {
      verdict: "rejected",
      reason: "UNACCEPTABLE_IMPACT",
      lensEvidence,
      lensImpact,
      blindChecklist: {
        expectedModifications,
        actualModifications,
        unmappedModifications,
      },
    }
  }

  return {
    verdict: "approved",
    reason: "ALL_CRITERIA_MET",
    lensEvidence,
    lensImpact,
    blindChecklist: {
      expectedModifications,
      actualModifications,
      unmappedModifications,
    },
  }
}

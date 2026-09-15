import { describe, expect, test } from "bun:test"
import { validateTechnicalBriefV2, type TechnicalBriefV2 } from "../../src/brief/types"

describe("brief/types v2.0 schema", () => {
  test("validates compliant TechnicalBriefV2 structure", () => {
    const validBrief: TechnicalBriefV2 = {
      schema_version: "2.0",
      brief_id: "brief-pipeline-hardening-01",
      task_id: "task-pipe-01",
      domain_cluster: "core",
      depends_on: ["brief-pre-requisite-00"],
      files_scope: {
        allow_modify: ["packages/core/src/workflow-review/task-path.ts"],
        allow_read_only: ["packages/core/src/workflow-review/error.ts"],
        strictly_forbidden: ["packages/core/src/agent.ts"],
      },
      contracts: {
        exported_symbols: ["sanitizeTaskId", "SPEC_TASK_ID"],
        function_signatures: [
          {
            name: "sanitizeTaskId",
            signature: "(task_id: string): string",
            description: "Sanitizes task ID for Windows and POSIX filesystem safety",
          },
        ],
        error_invariant_codes: ["CycleLimitExceeded"],
      },
      verification_gates: {
        shell_checks: ["bun test test/workflow-review/task-path.test.ts"],
        baseline_rules: ["Rule 1: Strict Zero Drift", "Rule 2: Atomic SQLite Transactions"],
      },
      metadata: {
        author: "analista",
        spec_reference: "specs/xocp/baseline-global.md",
      },
    }

    const validated = validateTechnicalBriefV2(validBrief)
    expect(validated.schema_version).toBe("2.0")
    expect(validated.brief_id).toBe("brief-pipeline-hardening-01")
    expect(validated.domain_cluster).toBe("core")
    expect(validated.files_scope.allow_modify.length).toBe(1)
    expect(validated.contracts.function_signatures.length).toBe(1)
  })

  test("rejects invalid schema version or missing required contract fields", () => {
    expect(() =>
      validateTechnicalBriefV2({
        schema_version: "1.0",
        brief_id: "b1",
        task_id: "t1",
      })
    ).toThrow("schema_version")

    expect(() =>
      validateTechnicalBriefV2({
        schema_version: "2.0",
        brief_id: "b1",
        task_id: "t1",
        domain_cluster: "invalid_cluster",
      })
    ).toThrow("domain_cluster")
  })
})

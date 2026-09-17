import { describe, expect, test } from "bun:test"
import { patternsOverlap, selectNonOverlapping, scopeOverlap } from "../../src/cluster/scope-conflict"
import type { TechnicalBriefV2 } from "../../src/brief/types"

function brief(id: string, allowModify: string[]): TechnicalBriefV2 {
  return {
    schema_version: "2.0",
    brief_id: id,
    task_id: `task-${id}`,
    domain_cluster: "core",
    depends_on: [],
    files_scope: {
      allow_modify: allowModify,
      allow_read_only: [],
      strictly_forbidden: [],
    },
    contracts: { exported_symbols: [], function_signatures: [] },
    verification_gates: { shell_checks: [], baseline_rules: [] },
  }
}

describe("cluster/scope-conflict patternsOverlap", () => {
  test("identical patterns overlap", () => {
    expect(patternsOverlap("packages/core/**", "packages/core/**")).toBe(true)
  })

  test("literal ancestor overlaps its subtree", () => {
    expect(patternsOverlap("packages/core/**", "packages/core/src/db/schema.ts")).toBe(true)
    expect(patternsOverlap("packages/core", "packages/core/src/db/schema.ts")).toBe(true)
  })

  test("sibling directories never overlap", () => {
    expect(patternsOverlap("packages/core/**", "packages/app/**")).toBe(false)
    expect(patternsOverlap("packages/server/**", "packages/app/**")).toBe(false)
  })

  test("shared directory prefix from different root branches does not collide", () => {
    expect(patternsOverlap("packages/app/**", "packages/application/**")).toBe(false)
  })

  test("wildcard-first patterns only overlap when identical", () => {
    expect(patternsOverlap("**/api/**", "**/api/**")).toBe(true)
    expect(patternsOverlap("**/api/**", "**/routes/**")).toBe(false)
  })
})

describe("cluster/scope-conflict selectNonOverlapping", () => {
  test("independent briefs all dispatched in parallel", () => {
    const result = selectNonOverlapping([
      brief("a", ["packages/core/src/db/schema.ts"]),
      brief("b", ["packages/app/src/theme/tokens.ts"]),
      brief("c", ["packages/server/src/api/users.ts"]),
    ])
    expect(result.map((b) => b.brief_id).sort()).toEqual(["a", "b", "c"])
  })

  test("overlapping write scope serializes — one of the pair stays out of the wave", () => {
    const result = selectNonOverlapping([
      brief("a", ["packages/schema/**"]),
      brief("b", ["packages/schema/src/user.ts"]),
      brief("c", ["packages/app/src/main.tsx"]),
    ])
    const ids = result.map((b) => b.brief_id)
    expect(ids.length).toBe(2)
    expect(ids).toContain("c")
    // a and b conflict: only one of them can be in this wave
    expect(ids.filter((id) => id === "a" || id === "b").length).toBe(1)
  })

  test("integration brief overlapping a cluster is held back; non-overlapping goes parallel", () => {
    const integration = brief("int", ["packages/schema/src/user.ts"])
    const backend = brief("be", ["packages/schema/**"])
    const app = brief("app", ["packages/app/**"])
    const result = selectNonOverlapping([integration, backend, app])
    const ids = result.map((b) => b.brief_id)
    expect(ids).toContain("app")
    expect(ids.filter((id) => id === "int" || id === "be").length).toBe(1)
  })

  test("scopeOverlap only considers allow_modify (read-only never serializes)", () => {
    const a = brief("a", ["packages/protocol/src/contracts.ts"])
    const b = brief("b", ["packages/app/src/main.tsx"])
    b.files_scope.allow_read_only = ["packages/protocol/src/contracts.ts"]
    expect(scopeOverlap(a, b)).toBe(false)
  })
})
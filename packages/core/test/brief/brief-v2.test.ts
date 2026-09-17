import { describe, expect, test } from "bun:test"
import {
  inferDomainCluster,
  parseBriefYaml,
  toTechnicalBriefV2,
} from "../../src/brief/brief-v2"

const SAMPLE = `
brief_id: brief-oauth-backend-01
version: 1
task_summary: "Endpoint de callback OAuth"
status: aprovada
scope:
  included:
    - "Novo endpoint POST /api/auth/oauth/callback"
  excluded:
    - "UI do botão (brief-oauth-frontend-02)"
acceptance_criteria:
  - id: AC1
    description: "Endpoint troca um code válido por token"
    verifiable_by: "cd packages/opencode && bun test test/auth/oauth-callback.test.ts"
  - id: AC2
    description: "Endpoint rejeita state inválido"
    verifiable_by: "cd packages/opencode && bun test test/auth/oauth-callback.test.ts -t 'invalid state'"
constraints:
  - "Não persistir token em lugar nenhum neste brief"
depends_on: []
files_expected_touched:
  - "packages/opencode/src/server/routes/instance/httpapi/handlers/auth.ts"
  - "packages/opencode/test/auth/oauth-callback.test.ts"
risk_notes:
  - "Confirmar padrão OAuth existente"
created_by: analista
created_at: "2026-08-31T12:00:00Z"
history:
  - version: 1
    change: "criação inicial"
    by: analista
`

describe("brief/brief-v2 parseBriefYaml", () => {
  test("parses the workflow-pipeline section-4 template", () => {
    const brief = parseBriefYaml(SAMPLE, "/tmp/brief-a.yaml")
    expect(brief.brief_id).toBe("brief-oauth-backend-01")
    expect(brief.version).toBe(1)
    expect(brief.status).toBe("aprovada")
    expect(brief.acceptance_criteria?.length).toBe(2)
    expect(brief.acceptance_criteria?.[0].verifiable_by).toContain("oauth-callback")
    expect(brief.files_expected_touched?.length).toBe(2)
    expect(brief.depends_on).toEqual([])
    expect(brief.history?.[0].change).toContain("criação")
  })

  test("throws when brief_id is missing", () => {
    expect(() => parseBriefYaml("version: 1\n", "/tmp/brief-b.yaml")).toThrow(/brief_id/)
  })

  test("throws on malformed YAML", () => {
    expect(() => parseBriefYaml(": : :\n  bad", "/tmp/brief-c.yaml")).toThrow(/Invalid brief YAML/)
  })
})

describe("brief/brief-v2 inferDomainCluster", () => {
  test.each([
    [["packages/core/src/db/schema.ts"], "core"],
    [["packages/app/src/theme/tokens.ts"], "frontend"],
    [["packages/server/src/api/users.ts"], "backend"],
    [["packages/protocol/src/contracts.ts"], "integration"],
  ] as const)("%s -> %s", (files, expected) => {
    expect(inferDomainCluster([...files])).toBe(expected)
  })

  test("two distinct clusters make it an integration brief", () => {
    expect(
      inferDomainCluster(["packages/app/src/main.tsx", "packages/core/src/db/schema.ts"]),
    ).toBe("integration")
  })

  test("unmatched files default to core", () => {
    expect(inferDomainCluster(["some/unknown/module.ts"])).toBe("core")
  })

  test("explicit domain_cluster overrides inference", () => {
    expect(inferDomainCluster(["packages/app/src/main.tsx"], "core")).toBe("core")
    expect(inferDomainCluster([], "frontend")).toBe("frontend")
  })
})

describe("brief/brief-v2 toTechnicalBriefV2", () => {
  test("maps contract fields, task_id = brief_id, and infers cluster", () => {
    const v2 = toTechnicalBriefV2(parseBriefYaml(SAMPLE, "/tmp/brief-a.yaml"))
    expect(v2.schema_version).toBe("2.0")
    expect(v2.brief_id).toBe("brief-oauth-backend-01")
    expect(v2.task_id).toBe("brief-oauth-backend-01")
    expect(v2.domain_cluster).toBe("backend")
    expect(v2.depends_on).toEqual([])
    expect(v2.files_scope.allow_modify).toEqual([
      "packages/opencode/src/server/routes/instance/httpapi/handlers/auth.ts",
      "packages/opencode/test/auth/oauth-callback.test.ts",
    ])
    expect(v2.verification_gates.shell_checks.length).toBe(2)
    expect(v2.verification_gates.shell_checks[0]).toContain("bun test")
    expect(v2.metadata?.author).toBe("analista")
  })

  test("validates against the TechnicalBriefV2 contract", () => {
    const v2 = toTechnicalBriefV2(parseBriefYaml(SAMPLE, "/tmp/brief-a.yaml"))
    expect(v2).toBeDefined()
    expect(Array.isArray(v2.contracts.exported_symbols)).toBe(true)
    expect(Array.isArray(v2.verification_gates.baseline_rules)).toBe(true)
  })
})
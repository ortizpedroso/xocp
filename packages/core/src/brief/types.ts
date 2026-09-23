export type DomainCluster = "backend" | "frontend" | "core" | "integration"

export interface FilesScope {
  allow_modify: string[]
  allow_read_only: string[]
  strictly_forbidden: string[]
}

export interface ContractSignature {
  name: string
  signature: string
  description?: string
}

export interface VerificationGates {
  shell_checks: string[]
  baseline_rules: string[]
}

export interface TechnicalBriefV2 {
  schema_version: "2.0"
  brief_id: string
  task_id: string
  domain_cluster: DomainCluster
  depends_on: string[]
  files_scope: FilesScope
  contracts: {
    exported_symbols: string[]
    function_signatures: ContractSignature[]
    api_payloads?: Array<{ endpoint: string; request?: unknown; response?: unknown }>
    error_invariant_codes?: string[]
  }
  verification_gates: VerificationGates
  metadata?: {
    created_at?: string
    author?: string
    spec_reference?: string
  }
}

export function validateTechnicalBriefV2(brief: unknown): TechnicalBriefV2 {
  if (!brief || typeof brief !== "object") {
    throw new Error("Invalid TechnicalBrief: must be an object")
  }

  const b = brief as Partial<TechnicalBriefV2>

  if (b.schema_version !== "2.0") {
    throw new Error(`Invalid schema_version: expected '2.0', got '${b.schema_version}'`)
  }

  if (!b.brief_id || typeof b.brief_id !== "string") {
    throw new Error("Missing or invalid brief_id")
  }

  if (!b.task_id || typeof b.task_id !== "string") {
    throw new Error("Missing or invalid task_id")
  }

  const validClusters = ["backend", "frontend", "core", "integration"]
  if (!b.domain_cluster || !validClusters.includes(b.domain_cluster)) {
    throw new Error(`Invalid domain_cluster: must be one of ${validClusters.join(", ")}`)
  }

  if (!Array.isArray(b.depends_on)) {
    throw new Error("Invalid depends_on: must be an array of prerequisite brief IDs")
  }

  if (!b.files_scope || typeof b.files_scope !== "object") {
    throw new Error("Missing files_scope")
  }

  const { allow_modify, allow_read_only, strictly_forbidden } = b.files_scope
  if (!Array.isArray(allow_modify) || !Array.isArray(allow_read_only) || !Array.isArray(strictly_forbidden)) {
    throw new Error("files_scope must contain allow_modify, allow_read_only, and strictly_forbidden arrays")
  }

  if (!b.contracts || typeof b.contracts !== "object") {
    throw new Error("Missing contracts specification")
  }

  if (!Array.isArray(b.contracts.exported_symbols) || !Array.isArray(b.contracts.function_signatures)) {
    throw new Error("contracts must define exported_symbols and function_signatures arrays")
  }

  if (!b.verification_gates || typeof b.verification_gates !== "object") {
    throw new Error("Missing verification_gates")
  }

  if (!Array.isArray(b.verification_gates.shell_checks) || !Array.isArray(b.verification_gates.baseline_rules)) {
    throw new Error("verification_gates must define shell_checks and baseline_rules arrays")
  }

  return b as TechnicalBriefV2
}

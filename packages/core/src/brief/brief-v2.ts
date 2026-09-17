import matter from "gray-matter"
import path from "path"
import { minimatch } from "minimatch"
import { DOMAIN_CLUSTERS, type DomainClusterId } from "../cluster/types"
import { validateTechnicalBriefV2, type TechnicalBriefV2 } from "./types"

/**
 * Loader bridging the real pipeline Brief (`.opencode/briefs/*.yaml`, schema of
 * workflow-pipeline.md section 4) into the `TechnicalBriefV2` contract that
 * ClusterDispatcher orchestrates. The real Brief has no `domain_cluster` — the
 * cluster is inferred from `files_expected_touched` against
 * `DOMAIN_CLUSTERS[].filePatterns`; a brief touching ≥2 distinct clusters is an
 * integration (cross-boundary) brief, the only one allowed to cross boundaries.
 */

export const BRIEF_STATUS = ["rascunho", "aguardando_aprovacao", "aprovada", "em_revisao"] as const
export type BriefStatus = (typeof BRIEF_STATUS)[number]

export interface PipelineBriefV2 {
  brief_id: string
  version: number
  task_summary?: string
  status?: BriefStatus
  domain_cluster?: string
  scope?: {
    included?: string[]
    excluded?: string[]
  }
  acceptance_criteria?: Array<{
    id?: string
    description?: string
    verifiable_by?: string
  }>
  constraints?: string[]
  depends_on?: string[]
  files_expected_touched?: string[]
  risk_notes?: string[]
  created_by?: string
  created_at?: string
  history?: Array<{
    version?: number
    change?: string
    by?: string
  }>
}

export function parseBriefYaml(content: string, filePath: string): PipelineBriefV2 {
  let parsed: ReturnType<typeof matter>
  try {
    // gray-matter parses YAML frontmatter between --- delimiters; briefs are
    // plain YAML without them, so we wrap the content (same yaml engine the
    // repo already uses for spec frontmatter).
    parsed = matter(`---\n${content}\n---`)
  } catch (error) {
    throw new Error(`Invalid brief YAML at ${filePath}: ${error instanceof Error ? error.message : String(error)}`)
  }

  const data = (parsed.data ?? {}) as Partial<PipelineBriefV2>
  if (!data.brief_id || typeof data.brief_id !== "string") {
    throw new Error(`Missing or invalid brief_id at ${filePath}`)
  }
  return data as PipelineBriefV2
}

export function inferDomainCluster(
  files: string[],
  explicitCluster?: string,
): DomainClusterId {
  const explicit = explicitCluster?.trim().toLowerCase()
  if (explicit && explicit in DOMAIN_CLUSTERS) {
    return explicit as DomainClusterId
  }

  const matched = new Set<DomainClusterId>()
  for (const file of files ?? []) {
    for (const cluster of Object.values(DOMAIN_CLUSTERS)) {
      if (cluster.filePatterns.some((pattern) => minimatch(file, pattern))) {
        matched.add(cluster.id)
      }
    }
  }
  if (matched.size >= 2) return "integration"
  if (matched.size === 1) return [...matched][0]
  return "core"
}

export function toTechnicalBriefV2(brief: PipelineBriefV2): TechnicalBriefV2 {
  const allowModify = [...new Set((brief.files_expected_touched ?? []).filter(Boolean))]
  const shellChecks = (brief.acceptance_criteria ?? [])
    .map((ac) => ac.verifiable_by)
    .filter((v): v is string => Boolean(v))

  const v2: TechnicalBriefV2 = {
    schema_version: "2.0",
    brief_id: brief.brief_id,
    task_id: brief.brief_id,
    domain_cluster: inferDomainCluster(brief.files_expected_touched ?? [], brief.domain_cluster),
    depends_on: brief.depends_on ?? [],
    files_scope: {
      allow_modify: allowModify,
      allow_read_only: [],
      strictly_forbidden: [],
    },
    contracts: { exported_symbols: [], function_signatures: [] },
    verification_gates: { shell_checks: shellChecks, baseline_rules: [] },
    metadata: {
      created_at: brief.created_at,
      author: brief.created_by,
    },
  }
  return validateTechnicalBriefV2(v2)
}

export async function loadPipelineBriefs(directory: string): Promise<PipelineBriefV2[]> {
  const dir = path.join(directory, ".opencode", "briefs")
  const glob = new Bun.Glob("*.yaml")
  let files: string[] = []
  try {
    files = await Array.fromAsync(glob.scan({ cwd: dir, onlyFiles: true }))
  } catch {
    return []
  }

  const briefs: PipelineBriefV2[] = []
  for (const file of files.sort()) {
    const filePath = path.join(dir, file)
    const content = await Bun.file(filePath).text()
    briefs.push(parseBriefYaml(content, filePath))
  }
  return briefs
}
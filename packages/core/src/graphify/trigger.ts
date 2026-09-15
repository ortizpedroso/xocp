import path from "path"
import { readCommunities, type CommunityEntry } from "./graph-file"
import { which } from "../util/which"

export interface TriageIntent {
  category?: "research" | "documentation" | "script" | "refactor" | "feature" | "bugfix" | string
  action?: "DIVIDIR" | "FLUXO_NORMAL" | string
  target_files?: string[]
  is_multi_module?: boolean
  prompt?: string
}

const MANIFEST_FILES = ["package.json", "Cargo.toml", "go.mod", "pyproject.toml"]

/**
 * Heuristic Trigger for Graphify:
 * - Bypass Rule: Returns false for tasks categorized as pure research, markdown documentation (.md), or isolated script execution.
 * - Trigger Rule: Returns true if workspace contains dependency manifests AND task involves multi-module refactoring or cluster splitting (DIVIDIR).
 */
export async function shouldTriggerGraphify(
  workspaceDir: string,
  intent: TriageIntent
): Promise<boolean> {
  // 1. Check Bypass Rules
  if (intent.category === "research" || intent.category === "documentation" || intent.category === "script") {
    return false
  }

  // If prompt explicitly mentions pure markdown / docs research
  if (intent.target_files && intent.target_files.length > 0) {
    const allMarkdownOrScripts = intent.target_files.every(
      f => f.endsWith(".md") || f.endsWith(".txt") || f.endsWith(".sh")
    )
    if (allMarkdownOrScripts && intent.action !== "DIVIDIR") {
      return false
    }
  }

  // 2. Check for Manifest Files in workspace
  let hasManifest = false
  for (const manifest of MANIFEST_FILES) {
    const manifestPath = path.join(workspaceDir, manifest)
    if (await Bun.file(manifestPath).exists()) {
      hasManifest = true
      break
    }
  }

  if (!hasManifest) {
    return false
  }

  // 3. Trigger Rule: Multi-module refactoring or DIVIDIR
  const isMultiModuleOrDividir =
    intent.action === "DIVIDIR" ||
    intent.is_multi_module === true ||
    intent.category === "refactor"

  return isMultiModuleOrDividir
}

export interface GraphifyTriggerResult {
  triggered: boolean
  warning?: string
  communities?: CommunityEntry[]
}

export async function executeGraphifyTriage(
  workspaceDir: string,
  intent: TriageIntent
): Promise<GraphifyTriggerResult> {
  const shouldTrigger = await shouldTriggerGraphify(workspaceDir, intent)
  if (!shouldTrigger) {
    return { triggered: false }
  }

  // Check if uv binary is available
  if (which("uv") === null) {
    return {
      triggered: false,
      warning: "Graphify.UvNotFound: 'uv' executable not found in PATH. Graphify background mapping skipped gracefully with session warning.",
    }
  }

  return {
    triggered: true,
  }
}

export { readCommunities }

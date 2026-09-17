import { readLatestReviewChecklist } from "../workflow-review/review-checklist"
import type { ClusterDispatcher } from "./dispatcher"

/**
 * Production bridge: snapshots the latest Avaliador verdict (review_checklist
 * on disk, keyed by task_id) back into the DAG.
 *
 * - "approved"  → markCompleted(approved) → downstream `depends_on` unblocks.
 * - "rejected"  → node fails; downstream stays blocked (gauntlet/re-plan path).
 * - "failed"    → node stops; criterion incoherent, escalated to human — no fix
 *   cycle will retry it via the normal gauntlet.
 *
 * Nodes that already completed are left untouched (idempotent on re-runs).
 */
export async function applyReviewVerdictsFromDisk(
  directory: string,
  dispatcher: ClusterDispatcher,
): Promise<{ applied: number }> {
  let applied = 0
  for (const node of dispatcher.getAllNodes()) {
    if (node.status === "completed") continue
    const latest = await readLatestReviewChecklist(directory, node.brief.task_id)
    if (!latest) continue
    dispatcher.applyVerdict(node.brief.brief_id, latest.payload.verdict)
    applied++
  }
  return { applied }
}
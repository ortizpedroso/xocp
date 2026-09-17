import type { TechnicalBriefV2 } from "../brief/types"
import { DOMAIN_CLUSTERS, type DomainClusterId, type WorkerContext, type ClusterSynthesisReport } from "./types"
import { selectNonOverlapping } from "./scope-conflict"

export interface DispatchNode {
  brief: TechnicalBriefV2
  status: "pending" | "running" | "completed" | "failed" | "blocked"
  error?: string
  reviewVerdict?: "approved" | "rejected" | "failed"
}

export interface DAGExecutionOptions {
  workerExecutor?: (node: DispatchNode) => Promise<{
    filesTouched: string[]
    contracts: string[]
    assertionsPassed: number
    approved: boolean
  }>
}

export interface DagSnapshot {
  nodes: Array<{
    brief_id: string
    status: DispatchNode["status"]
    error?: string
    reviewVerdict?: DispatchNode["reviewVerdict"]
  }>
  completedBriefIds: string[]
}

export class ClusterDispatcher {
  private nodes = new Map<string, DispatchNode>()
  private completedBriefIds = new Set<string>()

  constructor(briefs: TechnicalBriefV2[], snapshot?: DagSnapshot) {
    for (const brief of briefs) {
      this.nodes.set(brief.brief_id, {
        brief,
        status: brief.depends_on.length === 0 ? "pending" : "blocked",
      })
    }
    this.refreshBlockedStatus()
    if (snapshot) {
      this.hydrate(snapshot)
    }
  }

  private hydrate(snapshot: DagSnapshot) {
    for (const entry of snapshot.nodes) {
      const node = this.nodes.get(entry.brief_id)
      if (!node) continue
      node.status = entry.status
      node.error = entry.error
      node.reviewVerdict = entry.reviewVerdict
      if (entry.status === "completed") {
        this.completedBriefIds.add(entry.brief_id)
      }
    }
    this.refreshBlockedStatus()
  }

  public toSnapshot(): DagSnapshot {
    return {
      nodes: [...this.nodes.entries()].map(([brief_id, node]) => ({
        brief_id,
        status: node.status,
        error: node.error,
        reviewVerdict: node.reviewVerdict,
      })),
      completedBriefIds: [...this.completedBriefIds],
    }
  }

  /**
   * Returns list of brief IDs that are ready to run (i.e. depends_on are all approved/completed).
   */
  public getExecutableBriefs(): TechnicalBriefV2[] {
    const ready: TechnicalBriefV2[] = []
    for (const [_, node] of this.nodes.entries()) {
      if (node.status === "pending") {
        const canRun = node.brief.depends_on.every((dep) => this.completedBriefIds.has(dep))
        if (canRun) {
          ready.push(node.brief)
        }
      }
    }
    return ready
  }

  public markRunning(briefId: string): WorkerContext {
    const node = this.nodes.get(briefId)
    if (!node) throw new Error(`Brief ${briefId} not found in DAG`)
    node.status = "running"

    const clusterId = (node.brief.domain_cluster as DomainClusterId) || "core"
    return {
      workerId: `worker-${clusterId}-${briefId}-${Date.now()}`,
      clusterId,
      briefId,
      taskId: node.brief.task_id,
      status: "running",
      delegationDepth: 1, // Core Security Rule: strictly constrained to 1
      assignedFiles: node.brief.files_scope,
    }
  }

  public markCompleted(briefId: string, approved: boolean = true) {
    const node = this.nodes.get(briefId)
    if (!node) throw new Error(`Brief ${briefId} not found in DAG`)

    if (approved) {
      node.status = "completed"
      node.reviewVerdict = "approved"
      this.completedBriefIds.add(briefId)
      this.refreshBlockedStatus()
    } else {
      node.status = "failed"
      node.reviewVerdict = "rejected"
    }
  }

  /**
   * Applies an Avaliador verdict for a node by brief_id.
   * - "approved": markCompleted(true) — unblocks everything that depends_on this brief.
   * - "rejected": markCompleted(false) — node fails; downstream stays blocked.
   * - "failed": the Spec/Brief criterion itself is incoherent (avaliador verdict "failed").
   *   The node is stopped and never retried by the gauntlet.
   */
  public applyVerdict(briefId: string, verdict: "approved" | "rejected" | "failed") {
    const node = this.nodes.get(briefId)
    if (!node) throw new Error(`Brief ${briefId} not found in DAG`)

    if (verdict === "approved") {
      this.markCompleted(briefId, true)
      return
    }
    if (verdict === "rejected") {
      this.markCompleted(briefId, false)
      return
    }
    node.status = "failed"
    node.reviewVerdict = "failed"
    node.error = "Verdict 'failed': the Brief criterion is incoherent — escalated, no fix cycle"
  }

  public isComplete(): boolean {
    for (const [_, node] of this.nodes.entries()) {
      if (node.status !== "completed") return false
    }
    return true
  }

  public hasFailures(): boolean {
    for (const [_, node] of this.nodes.entries()) {
      if (node.status === "failed") return true
    }
    return false
  }

  public getNode(briefId: string): DispatchNode | undefined {
    return this.nodes.get(briefId)
  }

  public getAllNodes(): DispatchNode[] {
    return Array.from(this.nodes.values())
  }

  private refreshBlockedStatus() {
    for (const [_, node] of this.nodes.entries()) {
      if (node.status === "blocked") {
        const canRun = node.brief.depends_on.every((dep) => this.completedBriefIds.has(dep))
        if (canRun) {
          node.status = "pending"
        }
      }
    }
  }

  /**
   * Executes the DAG until every unblockable node has been processed.
   * Tasks with depends_on: [] run simultaneously (bounded by the scope gate).
   * A failure in one node NEVER stops independent branches — only its own
   * downstream (nodes with `depends_on` on the failed node stay blocked).
   */
  public async executeAll(
    executor: (brief: TechnicalBriefV2, workerCtx: WorkerContext) => Promise<boolean>
  ): Promise<{
    completedCount: number
    failedCount: number
    synthesisReports: Record<DomainClusterId, ClusterSynthesisReport>
  }> {
    const reports = {} as Record<DomainClusterId, ClusterSynthesisReport>
    for (const id of Object.keys(DOMAIN_CLUSTERS) as DomainClusterId[]) {
      reports[id] = {
        clusterId: id,
        briefsHandled: [],
        filesTouched: [],
        exportedContracts: [],
        testAssertionsPassed: 0,
        allApproved: true,
        timestamp: new Date().toISOString(),
      }
    }

    while (true) {
      const readyBriefs = this.getExecutableBriefs()
      if (readyBriefs.length === 0) {
        break
      }

      // Dispatch-time scope gate: never run two briefs whose allow_modify overlaps
      // in the same parallel wave (write-write conflict). The integration cluster is
      // only parallel with a cluster it does NOT overlap. Leftover overlapping briefs
      // stay pending for the next wave. If every ready brief conflicts, run one alone
      // to guarantee progress.
      let wave = selectNonOverlapping(readyBriefs)
      if (wave.length === 0) {
        wave = [readyBriefs[0]]
      }

      // Execute wave concurrently in isolated worker contexts
      await Promise.all(
        wave.map(async (brief) => {
          const workerCtx = this.markRunning(brief.brief_id)
          const clusterId = workerCtx.clusterId

          try {
            const approved = await executor(brief, workerCtx)
            this.markCompleted(brief.brief_id, approved)

            // Aggregate synthesis report without modifying code directly
            const report = reports[clusterId]
            report.briefsHandled.push(brief.brief_id)
            report.filesTouched.push(...brief.files_scope.allow_modify)
            report.exportedContracts.push(...brief.contracts.exported_symbols)
            if (!approved) {
              report.allApproved = false
            }
          } catch (err) {
            this.markCompleted(brief.brief_id, false)
            reports[clusterId].allApproved = false
          }
        })
      )
    }

    let completedCount = 0
    let failedCount = 0
    for (const [_, node] of this.nodes.entries()) {
      if (node.status === "completed") completedCount++
      if (node.status === "failed") failedCount++
    }

    return {
      completedCount,
      failedCount,
      synthesisReports: reports,
    }
  }
}

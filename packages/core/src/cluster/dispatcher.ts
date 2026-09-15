import type { TechnicalBriefV2 } from "../brief/types"
import { DOMAIN_CLUSTERS, type DomainClusterId, type WorkerContext, type ClusterSynthesisReport } from "./types"

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

export class ClusterDispatcher {
  private nodes = new Map<string, DispatchNode>()
  private completedBriefIds = new Set<string>()

  constructor(briefs: TechnicalBriefV2[]) {
    for (const brief of briefs) {
      this.nodes.set(brief.brief_id, {
        brief,
        status: brief.depends_on.length === 0 ? "pending" : "blocked",
      })
    }
    this.refreshBlockedStatus()
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
   * Executes the DAG until all unblocked tasks are processed or saturation/failure occurs.
   * Tasks with depends_on: [] run simultaneously.
   */
  public async executeAll(
    executor: (brief: TechnicalBriefV2, workerCtx: WorkerContext) => Promise<boolean>
  ): Promise<{
    completedCount: number
    failedCount: number
    synthesisReports: Record<DomainClusterId, ClusterSynthesisReport>
  }> {
    const reports: Record<DomainClusterId, ClusterSynthesisReport> = {
      core: {
        clusterId: "core",
        briefsHandled: [],
        filesTouched: [],
        exportedContracts: [],
        testAssertionsPassed: 0,
        allApproved: true,
        timestamp: new Date().toISOString(),
      },
      backend: {
        clusterId: "backend",
        briefsHandled: [],
        filesTouched: [],
        exportedContracts: [],
        testAssertionsPassed: 0,
        allApproved: true,
        timestamp: new Date().toISOString(),
      },
      frontend: {
        clusterId: "frontend",
        briefsHandled: [],
        filesTouched: [],
        exportedContracts: [],
        testAssertionsPassed: 0,
        allApproved: true,
        timestamp: new Date().toISOString(),
      },
    }

    let progressMade = true
    while (progressMade) {
      const readyBriefs = this.getExecutableBriefs()
      if (readyBriefs.length === 0) {
        break
      }

      // Execute ready briefs concurrently in isolated worker contexts
      await Promise.all(
        readyBriefs.map(async (brief) => {
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

      progressMade = !this.hasFailures() && !this.isComplete()
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

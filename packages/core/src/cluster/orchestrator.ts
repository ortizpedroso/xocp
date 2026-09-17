import type { TechnicalBriefV2 } from "../brief/types"
import { loadPipelineBriefs, toTechnicalBriefV2, type PipelineBriefV2 } from "../brief/brief-v2"
import type { WorkerContext } from "./types"
import { ClusterDispatcher } from "./dispatcher"
import { DagStore } from "./dag-store"
import { selectNonOverlapping } from "./scope-conflict"
import { applyReviewVerdictsFromDisk } from "./verdict"

export interface OrchestratorOptions {
  store?: DagStore
  /** Defaults to running only briefs whose `status` is `aprovada`. */
  shouldRun?: (brief: PipelineBriefV2) => boolean
}

const isApproved = (brief: PipelineBriefV2) => brief.status === "aprovada"

/**
 * Runtime-facing engine. Loads the real briefs from `.opencode/briefs/*.yaml`
 * and maps them to TechnicalBriefV2, hydrating from the durable DAG store.
 * Verdict application is explicit via `applyVerdicts()` (a pure read — `status`
 * — must never mutate the DAG). The opencode/plugin runtime only needs to ask
 * `readyWaves()` and drive one executor (task) per brief in a wave, then call
 * `applyVerdicts()` after the Avaliador writes a review_checklist.
 */
export class DagOrchestrator {
  private constructor(
    private readonly directory: string,
    private readonly dispatcherState: ClusterDispatcher,
    private readonly store: DagStore,
  ) {}

  static async open(directory: string, options: OrchestratorOptions = {}): Promise<DagOrchestrator> {
    const store = options.store ?? new DagStore(directory)
    const snapshot = store.load()
    const allBriefs = await loadPipelineBriefs(directory)
    const shouldRun = options.shouldRun ?? isApproved
    const eligible = allBriefs.filter(shouldRun)

    const dispatcher = new ClusterDispatcher(eligible.map(toTechnicalBriefV2), snapshot)

    const orchestrator = new DagOrchestrator(directory, dispatcher, store)
    orchestrator.save()
    return orchestrator
  }

  getDispatcher(): ClusterDispatcher {
    return this.dispatcherState
  }

  readyBriefs(): TechnicalBriefV2[] {
    return this.dispatcherState.getExecutableBriefs()
  }

  /**
   * Produces ordered waves of executable briefs. Each wave is safe to run in
   * parallel (no allow_modify overlap between members); consecutive waves must
   * run after the previous one's verdicts are applied.
   */
  readyWaves(): TechnicalBriefV2[][] {
    const waves: TechnicalBriefV2[][] = []
    let remaining = this.dispatcherState.getExecutableBriefs()
    while (remaining.length > 0) {
      const wave = selectNonOverlapping(remaining)
      if (wave.length === 0) {
        waves.push([remaining[0]])
        break
      }
      waves.push(wave)
      const picked = new Set(wave.map((b) => b.brief_id))
      remaining = remaining.filter((b) => !picked.has(b.brief_id))
    }
    return waves
  }

  markRunning(briefId: string): WorkerContext {
    const ctx = this.dispatcherState.markRunning(briefId)
    this.save()
    return ctx
  }

  /** Applies the latest review_checklist verdict per node from disk and persists. */
  async applyVerdicts(): Promise<{ applied: number }> {
    const result = await applyReviewVerdictsFromDisk(this.directory, this.dispatcherState)
    this.save()
    return result
  }

  save(): void {
    this.store.save(this.dispatcherState.toSnapshot())
  }
}
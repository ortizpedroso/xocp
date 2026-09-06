import path from "path"
import { Schema } from "effect"
import { readCycle } from "./cycle-tracker"
import { InvalidGates } from "./error"
import { reviewsRelativeDir, taskKind } from "./task-path"

export const GateResult = Schema.Literals(["pass", "fail"])

export const ReviewCriterion = Schema.Struct({
  id: Schema.String,
  status: GateResult,
  evidence: Schema.String,
})

export const ReviewGates = Schema.Struct({
  spec_updated: Schema.optional(GateResult),
  norm_sources_verified: Schema.optional(GateResult),
  execution_summary_complete: GateResult,
})

export const ReviewVerdict = Schema.Literals(["approved", "rejected"])

export const ReviewChecklist = Schema.Struct({
  task_id: Schema.String,
  cycle: Schema.Int,
  gates: ReviewGates,
  criteria: Schema.Array(ReviewCriterion),
  verdict: ReviewVerdict,
  timestamp: Schema.String,
})

export type ReviewChecklist = Schema.Schema.Type<typeof ReviewChecklist>

export type ReviewChecklistInput = {
  task_id: string
  gates: Schema.Schema.Type<typeof ReviewGates>
  criteria: Array<Schema.Schema.Type<typeof ReviewCriterion>>
  verdict: Schema.Schema.Type<typeof ReviewVerdict>
  timestamp?: string
}

function validateGates(task_id: string, gates: Schema.Schema.Type<typeof ReviewGates>) {
  const isSpec = taskKind(task_id) === "spec"
  const hasSpecUpdated = gates.spec_updated !== undefined
  const hasNormVerified = gates.norm_sources_verified !== undefined

  if (isSpec) {
    if (!hasSpecUpdated || !hasNormVerified) {
      throw new InvalidGates({
        task_id,
        message: "Spec tasks must include spec_updated and norm_sources_verified gates",
      })
    }
    return
  }

  if (hasSpecUpdated || hasNormVerified) {
    throw new InvalidGates({
      task_id,
      message: "Brief tasks without an associated Spec must omit spec_updated and norm_sources_verified gates",
    })
  }
}

function cyclePath(directory: string, task_id: string, cycle: number) {
  return path.join(directory, reviewsRelativeDir(task_id), `cycle-${cycle}.json`)
}

export async function writeReviewChecklist(directory: string, input: ReviewChecklistInput) {
  validateGates(input.task_id, input.gates)

  const cycle = await readCycle(directory, input.task_id)
  if (cycle === 0) {
    throw new Error(`No active cycle for task_id "${input.task_id}" — call cycle_tracker first`)
  }

  const payload: ReviewChecklist = {
    task_id: input.task_id,
    cycle,
    gates: input.gates,
    criteria: input.criteria,
    verdict: input.verdict,
    timestamp: input.timestamp ?? new Date().toISOString(),
  }

  const relativePath = path.join(reviewsRelativeDir(input.task_id), `cycle-${cycle}.json`)
  await Bun.write(cyclePath(directory, input.task_id, cycle), `${JSON.stringify(payload, null, 2)}\n`)
  return { cycle, relativePath, payload }
}

export async function readLatestReviewChecklist(directory: string, task_id: string) {
  const dir = path.join(directory, reviewsRelativeDir(task_id))
  const glob = new Bun.Glob("cycle-*.json")
  let files: string[] = []
  try {
    files = await Array.fromAsync(glob.scan({ cwd: dir, onlyFiles: true }))
  } catch {
    return undefined
  }
  if (files.length === 0) return undefined

  const latest = files
    .map((file) => ({ file, cycle: Number.parseInt(file.match(/^cycle-(\d+)\.json$/)?.[1] ?? "0", 10) }))
    .toSorted((a, b) => b.cycle - a.cycle)[0]

  const content = await Bun.file(path.join(dir, latest.file)).text()
  const decoded = Schema.decodeUnknownSync(ReviewChecklist)(JSON.parse(content))
  return { relativePath: path.join(reviewsRelativeDir(task_id), latest.file), payload: decoded }
}

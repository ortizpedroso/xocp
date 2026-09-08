import path from "path"
import { Schema } from "effect"
import { CompleteWithIncomplete } from "./error"
import { readCycle } from "./cycle-tracker"
import { reviewsRelativeDir } from "./task-path"

export const IncompleteCategory = Schema.Literals(["duvida_humana", "correcao_manual_necessaria"])

export const IncompleteItem = Schema.Struct({
  item: Schema.String,
  reason: Schema.String,
  category: IncompleteCategory,
})

export const CompletedItem = Schema.Struct({
  item: Schema.String,
  evidence: Schema.String,
  // URL of an external source (web, third-party docs) the conclusion came from.
  // Distinct from evidence verified in the repo's own code/tests — the Avaliador
  // must independently confirm items that carry this before treating them as verified.
  external_source: Schema.optional(Schema.String),
})

export const ExecutionSummaryStatus = Schema.Literals(["complete", "incomplete"])

export const ExecutionSummary = Schema.Struct({
  task_id: Schema.String,
  cycle: Schema.Int,
  completed: Schema.Array(CompletedItem),
  incomplete: Schema.Array(IncompleteItem),
  status: ExecutionSummaryStatus,
})

export type ExecutionSummary = Schema.Schema.Type<typeof ExecutionSummary>

export type ExecutionSummaryInput = {
  task_id: string
  completed: Array<Schema.Schema.Type<typeof CompletedItem>>
  incomplete: Array<Schema.Schema.Type<typeof IncompleteItem>>
  status: Schema.Schema.Type<typeof ExecutionSummaryStatus>
}

function executionPath(directory: string, task_id: string, cycle: number) {
  return path.join(directory, reviewsRelativeDir(task_id), `execution-${cycle}.json`)
}

export async function writeExecutionSummary(directory: string, input: ExecutionSummaryInput) {
  if (input.status === "complete" && input.incomplete.length > 0) {
    throw new CompleteWithIncomplete({ incompleteCount: input.incomplete.length })
  }

  const cycle = await readCycle(directory, input.task_id)
  if (cycle === 0) {
    throw new Error(`No active cycle for task_id "${input.task_id}" — call cycle_tracker first`)
  }

  const payload: ExecutionSummary = {
    task_id: input.task_id,
    cycle,
    completed: input.completed,
    incomplete: input.incomplete,
    status: input.status,
  }

  const relativePath = path.join(reviewsRelativeDir(input.task_id), `execution-${cycle}.json`)
  await Bun.write(executionPath(directory, input.task_id, cycle), `${JSON.stringify(payload, null, 2)}\n`)
  return { cycle, relativePath, payload }
}

export async function readLatestExecutionSummary(directory: string, task_id: string) {
  const dir = path.join(directory, reviewsRelativeDir(task_id))
  const glob = new Bun.Glob("execution-*.json")
  let files: string[] = []
  try {
    files = await Array.fromAsync(glob.scan({ cwd: dir, onlyFiles: true }))
  } catch {
    return undefined
  }
  if (files.length === 0) return undefined

  const latest = files
    .map((file) => ({ file, cycle: Number.parseInt(file.match(/^execution-(\d+)\.json$/)?.[1] ?? "0", 10) }))
    .toSorted((a, b) => b.cycle - a.cycle)[0]

  const content = await Bun.file(path.join(dir, latest.file)).text()
  const decoded = Schema.decodeUnknownSync(ExecutionSummary)(JSON.parse(content))
  return { relativePath: path.join(reviewsRelativeDir(task_id), latest.file), payload: decoded }
}

import path from "path"
import { Schema } from "effect"
import { InconsistentOverall } from "./error"
import { readCycle } from "./cycle-tracker"
import { reviewsRelativeDir } from "./task-path"

export const BaselineAuditItemStatus = Schema.Literals(["pass", "fail", "not_applicable"])

export const BaselineAuditItem = Schema.Struct({
  id: Schema.String,
  status: BaselineAuditItemStatus,
  evidence: Schema.String,
})

export const BaselineAuditOverall = Schema.Literals(["pass", "fail"])

export const BaselineAudit = Schema.Struct({
  task_id: Schema.String,
  cycle: Schema.Int,
  items: Schema.Array(BaselineAuditItem),
  overall: BaselineAuditOverall,
})

export type BaselineAudit = Schema.Schema.Type<typeof BaselineAudit>

export type BaselineAuditInput = {
  task_id: string
  items: Array<Schema.Schema.Type<typeof BaselineAuditItem>>
  overall: Schema.Schema.Type<typeof BaselineAuditOverall>
}

function validateOverall(task_id: string, input: BaselineAuditInput) {
  const hasFail = input.items.some((item) => item.status === "fail")
  if (hasFail && input.overall === "pass") {
    throw new InconsistentOverall({
      task_id,
      message: 'overall cannot be "pass" while at least one item has status "fail"',
    })
  }
}

function baselinePath(directory: string, task_id: string, cycle: number) {
  return path.join(directory, reviewsRelativeDir(task_id), `baseline-${cycle}.json`)
}

export async function writeBaselineAudit(directory: string, input: BaselineAuditInput) {
  validateOverall(input.task_id, input)

  const cycle = await readCycle(directory, input.task_id)
  if (cycle === 0) {
    throw new Error(`No active cycle for task_id "${input.task_id}" — call cycle_tracker first`)
  }

  const payload: BaselineAudit = {
    task_id: input.task_id,
    cycle,
    items: input.items,
    overall: input.overall,
  }

  const relativePath = path.join(reviewsRelativeDir(input.task_id), `baseline-${cycle}.json`)
  await Bun.write(baselinePath(directory, input.task_id, cycle), `${JSON.stringify(payload, null, 2)}\n`)
  return { cycle, relativePath, payload }
}

export async function readLatestBaselineAudit(directory: string, task_id: string) {
  const dir = path.join(directory, reviewsRelativeDir(task_id))
  const glob = new Bun.Glob("baseline-*.json")
  let files: string[] = []
  try {
    files = await Array.fromAsync(glob.scan({ cwd: dir, onlyFiles: true }))
  } catch {
    return undefined
  }
  if (files.length === 0) return undefined

  const latest = files
    .map((file) => ({ file, cycle: Number.parseInt(file.match(/^baseline-(\d+)\.json$/)?.[1] ?? "0", 10) }))
    .toSorted((a, b) => b.cycle - a.cycle)[0]

  const content = await Bun.file(path.join(dir, latest.file)).text()
  const decoded = Schema.decodeUnknownSync(BaselineAudit)(JSON.parse(content))
  return { relativePath: path.join(reviewsRelativeDir(task_id), latest.file), payload: decoded }
}

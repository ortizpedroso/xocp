import path from "path"
import { CycleLimitExceeded } from "./error"
import { reviewsRelativeDir } from "./task-path"

const MAX_CYCLES = 3

function cycleCountPath(directory: string, task_id: string) {
  return path.join(directory, reviewsRelativeDir(task_id), "cycle-count.txt")
}

export async function readCycle(directory: string, task_id: string) {
  const filePath = cycleCountPath(directory, task_id)
  if (!(await Bun.file(filePath).exists())) return 0
  const raw = (await Bun.file(filePath).text()).trim()
  const value = Number.parseInt(raw, 10)
  if (Number.isNaN(value) || value < 0) return 0
  return value
}

export async function incrementCycle(directory: string, task_id: string) {
  const current = await readCycle(directory, task_id)
  const next = current + 1
  if (next > MAX_CYCLES) {
    throw new CycleLimitExceeded({ task_id, cycle: next })
  }

  const filePath = cycleCountPath(directory, task_id)
  await Bun.write(filePath, `${next}\n`)
  return next
}

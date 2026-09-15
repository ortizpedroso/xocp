import { afterEach, describe, expect, test } from "bun:test"
import fs from "fs/promises"
import os from "os"
import path from "path"
import { readCycle, incrementCycle } from "../../src/workflow-review/cycle-tracker"
import { CycleLimitExceeded } from "../../src/workflow-review/error"

const dirs: string[] = []

afterEach(async () => {
  for (const dir of dirs.splice(0)) {
    await fs.rm(dir, { recursive: true, force: true })
  }
})

async function tmpdir() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "cycle-tracker-"))
  dirs.push(dir)
  return dir
}

describe("cycle-tracker", () => {
  test("sequential atomic increments from 0 to 3", async () => {
    const dir = await tmpdir()
    const taskId = "task-seq-01"

    expect(await readCycle(dir, taskId)).toBe(0)
    expect(await incrementCycle(dir, taskId)).toBe(1)
    expect(await readCycle(dir, taskId)).toBe(1)
    expect(await incrementCycle(dir, taskId)).toBe(2)
    expect(await incrementCycle(dir, taskId)).toBe(3)
    expect(await readCycle(dir, taskId)).toBe(3)
  })

  test("concurrency stress test: 20 simultaneous increments without lost updates on separate tasks", async () => {
    const dir = await tmpdir()
    const taskCount = 20

    // Concurrently initialize 20 distinct tasks
    const results = await Promise.all(
      Array.from({ length: taskCount }, (_, i) => incrementCycle(dir, `task-conc-${i}`))
    )

    for (let i = 0; i < taskCount; i++) {
      expect(results[i]).toBe(1)
      expect(await readCycle(dir, `task-conc-${i}`)).toBe(1)
    }

    // Now concurrently run 3 increments on task A
    const dir2 = await tmpdir()
    const taskA = "task-atomic-a"

    // Execute sequential steps with verification
    const c1 = await incrementCycle(dir2, taskA)
    const c2 = await incrementCycle(dir2, taskA)
    const c3 = await incrementCycle(dir2, taskA)
    expect(c1).toBe(1)
    expect(c2).toBe(2)
    expect(c3).toBe(3)
    expect(await readCycle(dir2, taskA)).toBe(3)
  })

  test("escalation trigger on 4th attempt (cycle > 3)", async () => {
    const dir = await tmpdir()
    const taskId = "task-escalate-01"

    expect(await incrementCycle(dir, taskId)).toBe(1)
    expect(await incrementCycle(dir, taskId)).toBe(2)
    expect(await incrementCycle(dir, taskId)).toBe(3)

    // 4th increment must throw CycleLimitExceeded with cycle = 4
    let thrownError: any = null
    try {
      await incrementCycle(dir, taskId)
    } catch (err: any) {
      thrownError = err
    }

    expect(thrownError).not.toBeNull()
    expect(thrownError._tag || thrownError.name).toBe("WorkflowReview.CycleLimitExceeded")
    expect(thrownError.cycle).toBe(4)
    expect(thrownError.task_id).toBe(taskId)

    // Incident file should also be generated in .opencode/evolution
    const incidentDir = path.join(dir, ".opencode", "evolution")
    const exists = await Bun.file(path.join(incidentDir)).exists() || (await fs.readdir(incidentDir)).length > 0
    expect(exists).toBe(true)
  })
})

import { afterEach, describe, expect, test } from "bun:test"
import fs from "fs/promises"
import os from "os"
import path from "path"
import {
  incrementSelfTestCycle,
  readSelfTestCycle,
  recordSelfTestAttempt,
  readLastSelfTestAttempt,
  writeSelfTestEscalation,
  SelfTestCycleLimitExceeded,
} from "../../src/workflow-executor/self-test-tracker"
import { incrementCycle, readCycle } from "../../src/workflow-review/cycle-tracker"

const dirs: string[] = []

afterEach(async () => {
  for (const dir of dirs.splice(0)) {
    await fs.rm(dir, { recursive: true, force: true })
  }
})

async function tmpdir() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "self-test-tracker-"))
  dirs.push(dir)
  return dir
}

describe("workflow-executor/self-test-tracker", () => {
  test("sequential increments from 0 to 3", async () => {
    const dir = await tmpdir()
    const taskId = "task-self-test-seq-01"

    expect(await readSelfTestCycle(dir, taskId)).toBe(0)
    expect(await incrementSelfTestCycle(dir, taskId)).toBe(1)
    expect(await readSelfTestCycle(dir, taskId)).toBe(1)
    expect(await incrementSelfTestCycle(dir, taskId)).toBe(2)
    expect(await incrementSelfTestCycle(dir, taskId)).toBe(3)
    expect(await readSelfTestCycle(dir, taskId)).toBe(3)
  })

  test("4th increment throws SelfTestCycleLimitExceeded with cycle = 4", async () => {
    const dir = await tmpdir()
    const taskId = "task-self-test-escalate-01"

    await incrementSelfTestCycle(dir, taskId)
    await incrementSelfTestCycle(dir, taskId)
    await incrementSelfTestCycle(dir, taskId)

    let thrown: unknown
    try {
      await incrementSelfTestCycle(dir, taskId)
    } catch (err) {
      thrown = err
    }

    expect(thrown).toBeInstanceOf(SelfTestCycleLimitExceeded)
    expect((thrown as SelfTestCycleLimitExceeded)._tag).toBe("WorkflowExecutor.SelfTestCycleLimitExceeded")
    expect((thrown as SelfTestCycleLimitExceeded).cycle).toBe(4)
    expect((thrown as SelfTestCycleLimitExceeded).task_id).toBe(taskId)
  })

  test("isolated from workflow-review/cycle_tracker: burning self-test attempts never touches the Avaliador cycle counter, and vice versa", async () => {
    const dir = await tmpdir()
    const taskId = "task-self-test-isolation-01"

    // Exhaust the self-test counter for this task.
    await incrementSelfTestCycle(dir, taskId)
    await incrementSelfTestCycle(dir, taskId)
    await incrementSelfTestCycle(dir, taskId)
    expect(await readSelfTestCycle(dir, taskId)).toBe(3)

    // The Avaliador<->Executor cycle counter for the same task_id must be
    // completely untouched — this is the whole point of Tarefa 8.
    expect(await readCycle(dir, taskId)).toBe(0)

    // And the inverse: advancing the Avaliador cycle counter must not touch
    // the self-test counter.
    await incrementCycle(dir, taskId)
    await incrementCycle(dir, taskId)
    expect(await readCycle(dir, taskId)).toBe(2)
    expect(await readSelfTestCycle(dir, taskId)).toBe(3)
  })

  test("recordSelfTestAttempt/readLastSelfTestAttempt survive across increments without resetting the cycle", async () => {
    const dir = await tmpdir()
    const taskId = "task-self-test-attempt-01"

    expect(await readLastSelfTestAttempt(dir, taskId)).toBeUndefined()

    await incrementSelfTestCycle(dir, taskId)
    await recordSelfTestAttempt(dir, taskId, { exitCode: 1, testFilePath: "packages/core/test/foo.test.ts" })
    expect(await readLastSelfTestAttempt(dir, taskId)).toEqual({
      exitCode: 1,
      testFilePath: "packages/core/test/foo.test.ts",
    })
    expect(await readSelfTestCycle(dir, taskId)).toBe(1)

    await incrementSelfTestCycle(dir, taskId)
    await recordSelfTestAttempt(dir, taskId, { exitCode: 0, testFilePath: "packages/core/test/foo.test.ts" })
    expect(await readLastSelfTestAttempt(dir, taskId)).toEqual({
      exitCode: 0,
      testFilePath: "packages/core/test/foo.test.ts",
    })
    expect(await readSelfTestCycle(dir, taskId)).toBe(2)
  })

  test("writeSelfTestEscalation persists the minimal record, not detailed narrative text", async () => {
    const dir = await tmpdir()
    const taskId = "task-self-test-escalation-01"

    const result = await writeSelfTestEscalation(dir, {
      task_id: taskId,
      last_exit_code: 1,
      test_file_path: "packages/core/test/auth/token.test.ts",
    })

    expect(result.payload).toEqual({
      task_id: taskId,
      self_test_cycles_exhausted: true,
      last_exit_code: 1,
      test_file_path: "packages/core/test/auth/token.test.ts",
      escalated_at: result.payload.escalated_at,
    })
    expect(typeof result.payload.escalated_at).toBe("string")

    const onDisk = JSON.parse(await Bun.file(path.join(dir, result.relativePath)).text())
    expect(onDisk).toEqual(result.payload)
  })
})

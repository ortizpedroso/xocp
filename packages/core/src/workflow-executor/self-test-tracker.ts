import fs from "fs/promises"
import path from "path"
import { Database } from "bun:sqlite"
import { Schema } from "effect"
import { reviewsRelativeDir } from "../workflow-review/task-path"

// Reviewer Blindness: this counter is strictly internal to workflow-executor's
// pre-flight self-test loop (self-test.ts). It is isolated from
// workflow-review/cycle-tracker.ts (the Avaliador<->Executor cycle counter) on
// purpose — burning self-test attempts must never consume the Avaliador's
// cycle budget, and the Avaliador must never learn this counter exists.
const MAX_SELF_TEST_CYCLES = 3

export class SelfTestCycleLimitExceeded extends Schema.TaggedErrorClass<SelfTestCycleLimitExceeded>()(
  "WorkflowExecutor.SelfTestCycleLimitExceeded",
  {
    task_id: Schema.String,
    cycle: Schema.Int,
  },
) {}

const dbCache = new Map<string, Database>()

function getSelfTestDb(directory: string): Database {
  const dbDir = path.join(directory, ".opencode")
  const dbPath = path.join(dbDir, "self-test-cycles.db")

  let db = dbCache.get(dbPath)
  if (!db) {
    try {
      require("fs").mkdirSync(dbDir, { recursive: true })
    } catch {}

    db = new Database(dbPath, { create: true })
    db.exec("PRAGMA journal_mode = WAL;")
    db.exec(`
      CREATE TABLE IF NOT EXISTS self_test_cycles (
        task_id TEXT PRIMARY KEY,
        cycle INTEGER NOT NULL,
        last_exit_code INTEGER,
        last_test_file_path TEXT,
        updated_at TEXT NOT NULL
      );
    `)
    dbCache.set(dbPath, db)
  }
  return db
}

export async function readSelfTestCycle(directory: string, task_id: string): Promise<number> {
  const db = getSelfTestDb(directory)
  const row = db.prepare("SELECT cycle FROM self_test_cycles WHERE task_id = ?").get(task_id) as {
    cycle: number
  } | null
  return row?.cycle ?? 0
}

// Persists the outcome of the most recent `runExecutorSelfTest` run for this
// task, so that if the NEXT increment is the one that exhausts the budget,
// the escalation record can be built from the last real attempt instead of
// relying on the model to carry the exit code across tool calls correctly.
export async function recordSelfTestAttempt(
  directory: string,
  task_id: string,
  input: { exitCode: number; testFilePath: string },
): Promise<void> {
  const db = getSelfTestDb(directory)
  db.prepare(
    `
    INSERT INTO self_test_cycles (task_id, cycle, last_exit_code, last_test_file_path, updated_at)
    VALUES (?, 0, ?, ?, ?)
    ON CONFLICT(task_id) DO UPDATE SET
      last_exit_code = excluded.last_exit_code,
      last_test_file_path = excluded.last_test_file_path,
      updated_at = excluded.updated_at
  `,
  ).run(task_id, input.exitCode, input.testFilePath, new Date().toISOString())
}

export async function readLastSelfTestAttempt(
  directory: string,
  task_id: string,
): Promise<{ exitCode: number; testFilePath: string } | undefined> {
  const db = getSelfTestDb(directory)
  const row = db
    .prepare("SELECT last_exit_code, last_test_file_path FROM self_test_cycles WHERE task_id = ?")
    .get(task_id) as { last_exit_code: number | null; last_test_file_path: string | null } | null
  if (!row || row.last_exit_code === null || row.last_test_file_path === null) return undefined
  return { exitCode: row.last_exit_code, testFilePath: row.last_test_file_path }
}

export async function incrementSelfTestCycle(directory: string, task_id: string): Promise<number> {
  const db = getSelfTestDb(directory)

  const incrementTx = db.transaction((tid: string) => {
    const existing = db.prepare("SELECT cycle FROM self_test_cycles WHERE task_id = ?").get(tid) as {
      cycle: number
    } | null
    const next = (existing?.cycle ?? 0) + 1
    db.prepare(
      `
      INSERT INTO self_test_cycles (task_id, cycle, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(task_id) DO UPDATE SET cycle = excluded.cycle, updated_at = excluded.updated_at
    `,
    ).run(tid, next, new Date().toISOString())
    return next
  })

  const next = incrementTx.immediate(task_id)

  if (next > MAX_SELF_TEST_CYCLES) {
    throw new SelfTestCycleLimitExceeded({ task_id, cycle: next })
  }

  return next
}

// Minimal durable marker that the self-test loop was exhausted — deliberately
// NOT the detailed failure narrative. The detailed "onde/por que/o que
// tentei/o que fazer" text goes to the human via `ask` in the same turn, not
// into this file: this record only needs to answer "did this happen" for
// anyone auditing the task later, not carry the story.
export interface SelfTestEscalationInput {
  task_id: string
  last_exit_code: number
  test_file_path: string
}

export interface SelfTestEscalation extends SelfTestEscalationInput {
  self_test_cycles_exhausted: true
  escalated_at: string
}

export async function writeSelfTestEscalation(directory: string, input: SelfTestEscalationInput) {
  const payload: SelfTestEscalation = {
    task_id: input.task_id,
    self_test_cycles_exhausted: true,
    last_exit_code: input.last_exit_code,
    test_file_path: input.test_file_path,
    escalated_at: new Date().toISOString(),
  }

  const relativePath = path.join(reviewsRelativeDir(input.task_id), "self-test-escalation.json")
  const filePath = path.join(directory, relativePath)
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await Bun.write(filePath, `${JSON.stringify(payload, null, 2)}\n`)
  return { relativePath, payload }
}

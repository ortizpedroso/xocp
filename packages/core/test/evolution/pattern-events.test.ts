import { afterEach, describe, expect, test } from "bun:test"
import fs from "fs/promises"
import os from "os"
import path from "path"
import { Database } from "bun:sqlite"
import {
  recordPatternEvent,
  recordTaskCompletion,
  countCompletedTasks,
  queryRecurringCategories,
  buildRecurrenceReport,
} from "../../src/evolution/pattern-events"

const dirs: string[] = []

afterEach(async () => {
  for (const dir of dirs.splice(0)) {
    await fs.rm(dir, { recursive: true, force: true })
  }
})

async function tmpdir() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "pattern-events-"))
  dirs.push(dir)
  return dir
}

async function rawDb(directory: string): Promise<Database> {
  const dbDir = path.join(directory, ".opencode")
  await fs.mkdir(dbDir, { recursive: true })
  const db = new Database(path.join(dbDir, "pattern-events.db"), { create: true })
  db.exec(`
    CREATE TABLE IF NOT EXISTS pattern_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id TEXT NOT NULL,
      category_id TEXT NOT NULL,
      source TEXT NOT NULL,
      cycle INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );
  `)
  db.exec(`
    CREATE TABLE IF NOT EXISTS task_completions (
      task_id TEXT PRIMARY KEY,
      completed_at TEXT NOT NULL
    );
  `)
  return db
}

describe("evolution/pattern-events", () => {
  test("recordTaskCompletion is cumulative and dedupes the same task_id", async () => {
    const dir = await tmpdir()
    expect(await recordTaskCompletion(dir, "brief-a")).toBe(1)
    expect(await recordTaskCompletion(dir, "brief-b")).toBe(2)
    expect(await recordTaskCompletion(dir, "brief-a")).toBe(2) // re-completing brief-a doesn't double count
    expect(countCompletedTasks(dir)).toBe(2)
  })

  test("a category recurring across 3 DISTINCT tasks is flagged", async () => {
    const dir = await tmpdir()
    for (const task_id of ["brief-1", "brief-2", "brief-3"]) {
      await recordTaskCompletion(dir, task_id)
      await recordPatternEvent(dir, { task_id, category_id: "G-SEC-2", source: "baseline_auditor", cycle: 1 })
    }

    const recurring = queryRecurringCategories(dir)
    expect(recurring).toHaveLength(1)
    expect(recurring[0]).toMatchObject({ category_id: "G-SEC-2", source: "baseline_auditor", distinctTasks: 3 })
  })

  test("3 retry-cycles inside the SAME task do NOT count as recurrence (distinct-task requirement)", async () => {
    const dir = await tmpdir()
    await recordTaskCompletion(dir, "brief-retry")
    await recordPatternEvent(dir, { task_id: "brief-retry", category_id: "AC1", source: "review_checklist", cycle: 1 })
    await recordPatternEvent(dir, { task_id: "brief-retry", category_id: "AC1", source: "review_checklist", cycle: 2 })
    await recordPatternEvent(dir, { task_id: "brief-retry", category_id: "AC1", source: "review_checklist", cycle: 3 })

    expect(queryRecurringCategories(dir)).toHaveLength(0)
  })

  test("different sources with the same category_id are tracked separately", async () => {
    const dir = await tmpdir()
    for (const task_id of ["t1", "t2", "t3"]) {
      await recordTaskCompletion(dir, task_id)
      await recordPatternEvent(dir, { task_id, category_id: "AC1", source: "review_checklist", cycle: 1 })
    }
    // Only 2 distinct tasks for the baseline_auditor source — must not qualify.
    for (const task_id of ["t4", "t5"]) {
      await recordTaskCompletion(dir, task_id)
      await recordPatternEvent(dir, { task_id, category_id: "AC1", source: "baseline_auditor", cycle: 1 })
    }

    const recurring = queryRecurringCategories(dir)
    expect(recurring).toHaveLength(1)
    expect(recurring[0].source).toBe("review_checklist")
  })

  test("window: events tied to tasks older than the most recent 20 completions are excluded", async () => {
    const dir = await tmpdir()
    const db = await rawDb(dir)

    // Seed 23 completed tasks, oldest first, explicit ascending timestamps.
    for (let i = 0; i < 23; i++) {
      const taskId = `task-${i}`
      const ts = new Date(Date.now() - (23 - i) * 60_000).toISOString()
      db.prepare(`INSERT INTO task_completions (task_id, completed_at) VALUES (?, ?)`).run(taskId, ts)
      // The 3 oldest tasks (task-0, task-1, task-2) share category "STALE" —
      // they fall outside the most-recent-20 window and must not count.
      if (i < 3) {
        db.prepare(
          `INSERT INTO pattern_events (task_id, category_id, source, cycle, created_at) VALUES (?, 'STALE', 'baseline_auditor', 1, ?)`,
        ).run(taskId, ts)
      }
    }

    expect(countCompletedTasks(dir)).toBe(23)
    const recurring = queryRecurringCategories(dir)
    expect(recurring.find((r) => r.category_id === "STALE")).toBeUndefined()
  })

  test("window: events older than 30 days are excluded even with fewer than 20 completions", async () => {
    const dir = await tmpdir()
    const db = await rawDb(dir)

    const oldTs = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString()
    for (const taskId of ["old-1", "old-2", "old-3"]) {
      db.prepare(`INSERT INTO task_completions (task_id, completed_at) VALUES (?, ?)`).run(taskId, oldTs)
      db.prepare(
        `INSERT INTO pattern_events (task_id, category_id, source, cycle, created_at) VALUES (?, 'OLD-RULE', 'baseline_auditor', 1, ?)`,
      ).run(taskId, oldTs)
    }

    expect(countCompletedTasks(dir)).toBe(3)
    expect(queryRecurringCategories(dir)).toHaveLength(0)
  })

  test("buildRecurrenceReport separates erro recorrente from the documented rotina recorrente limitation", async () => {
    const dir = await tmpdir()
    for (const task_id of ["r1", "r2", "r3"]) {
      await recordTaskCompletion(dir, task_id)
      await recordPatternEvent(dir, { task_id, category_id: "G-SEC-1", source: "baseline_auditor", cycle: 1 })
    }

    const report = buildRecurrenceReport(dir)
    expect(report.completedTasks).toBe(3)
    expect(report.erroRecorrente).toHaveLength(1)
    expect(report.erroRecorrente[0].category_id).toBe("G-SEC-1")
    expect(report.rotinaRecorrente.items).toEqual([])
    expect(report.rotinaRecorrente.limitation.length).toBeGreaterThan(0)
  })
})

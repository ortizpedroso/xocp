import path from "path"
import { Database } from "bun:sqlite"

// Recurrence tracking for the pattern-auditor subagent (Tarefa 10). Same
// bun:sqlite style as workflow-review/cycle-tracker.ts and
// workflow-executor/self-test-tracker.ts — a separate DB file, not reusing
// either of those two tables, so recurrence bookkeeping never interferes
// with the Avaliador's or the Executor's own cycle counters.

export type PatternEventSource = "review_checklist" | "baseline_auditor" | "self_test_escalation" | "executor_rotina"

const RECURRENCE_THRESHOLD = 3
// The 3 fixed, auto-recorded error sources. Kept explicit (rather than
// "everything except executor_rotina") so a future source must opt in
// instead of silently leaking into the error recurrence count.
const ERROR_SOURCES: PatternEventSource[] = ["review_checklist", "baseline_auditor", "self_test_escalation"]
// Routines don't fail loudly like errors — a routine shows up only because
// the executor chosen to label it, so a higher bar than the error threshold
// filters forced/false-positive labeling. 5 distinct tasks = candidate.
export const ROTINA_RECURRENCE_THRESHOLD = 5
const WINDOW_TASKS = 20
const WINDOW_DAYS = 30
export const REPORT_EVERY_N_COMPLETIONS = 10

const dbCache = new Map<string, Database>()

function getDb(directory: string): Database {
  const dbDir = path.join(directory, ".opencode")
  const dbPath = path.join(dbDir, "pattern-events.db")

  let db = dbCache.get(dbPath)
  if (!db) {
    try {
      require("fs").mkdirSync(dbDir, { recursive: true })
    } catch {}

    db = new Database(dbPath, { create: true })
    db.exec("PRAGMA journal_mode = WAL;")
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
    dbCache.set(dbPath, db)
  }
  return db
}

export async function recordPatternEvent(
  directory: string,
  input: { task_id: string; category_id: string; source: PatternEventSource; cycle: number },
): Promise<void> {
  const db = getDb(directory)
  db.prepare(
    `INSERT INTO pattern_events (task_id, category_id, source, cycle, created_at) VALUES (?, ?, ?, ?, ?)`,
  ).run(input.task_id, input.category_id, input.source, input.cycle, new Date().toISOString())
}

// Records task_id as completed (Avaliador approved it) at most once — no
// pre-existing cumulative "tasks completed" counter was found anywhere in
// the codebase (checked: no tasksCompleted/completed_count persisted
// outside ClusterDispatcher's in-memory, single-run, never-persisted
// bookkeeping at cluster/dispatcher.ts:67 — not reusable across sessions),
// so this table is the first one and is deliberately minimal.
export async function recordTaskCompletion(directory: string, task_id: string): Promise<number> {
  const db = getDb(directory)
  db.prepare(`INSERT INTO task_completions (task_id, completed_at) VALUES (?, ?) ON CONFLICT(task_id) DO NOTHING`).run(
    task_id,
    new Date().toISOString(),
  )
  return countCompletedTasks(directory)
}

export function countCompletedTasks(directory: string): number {
  const db = getDb(directory)
  const row = db.prepare(`SELECT COUNT(*) as n FROM task_completions`).get() as { n: number }
  return row.n
}

export interface RecurringCategory {
  category_id: string
  source: PatternEventSource
  distinctTasks: number
  occurrences: number
  task_ids: string[]
}

// Window = whichever of "last 20 completed tasks" / "last 30 days" is hit
// FIRST counting backward from now — i.e. the shorter (more recent) of the
// two cutoffs. With fewer than 20 completions ever recorded, only the
// 30-day cutoff applies.
function windowStartISO(directory: string): string {
  const db = getDb(directory)
  const cutoffByDays = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString()

  const recentTasks = db
    .prepare(`SELECT completed_at FROM task_completions ORDER BY completed_at DESC LIMIT ?`)
    .all(WINDOW_TASKS) as { completed_at: string }[]

  if (recentTasks.length < WINDOW_TASKS) return cutoffByDays

  const oldestOfTheTwenty = recentTasks[recentTasks.length - 1].completed_at
  return oldestOfTheTwenty > cutoffByDays ? oldestOfTheTwenty : cutoffByDays
}

// "Rotina recorrente" counts the same routine label across ≥5 DISTINCT
// tasks in the window. Routines are signals the workflow-executor chooses
// to label (source "executor_rotina"), so the threshold lives above the
// error threshold (3): a labeled routine is a weaker signal than a hard
// failing criterion and must clear a higher bar before being called a
// candidate. The event itself is recorded via `recordPatternEvent` with
// source "executor_rotina" and category_id = rotina_id — no new table needed.
export function queryRecurringRoutines(directory: string): RecurringCategory[] {
  return queryRecurring(directory, { sources: ["executor_rotina"], threshold: ROTINA_RECURRENCE_THRESHOLD })
}

// Same window semantics as the error recurrence, but without the minimum
// threshold — lets the record_rotina_event tool report live progress toward
// ROTINA_RECURRENCE_THRESHOLD ("n/5 tarefas distintas com esta rotina").
export function routineProgress(
  directory: string,
  rotina_id: string,
): { distinctTasks: number; occurrences: number } {
  const db = getDb(directory)
  const start = windowStartISO(directory)
  const rows = db
    .prepare(
      `SELECT task_id FROM pattern_events
       WHERE created_at >= ? AND source = 'executor_rotina' AND category_id = ?`,
    )
    .all(start, rotina_id) as { task_id: string }[]
  const distinctTasks = new Set(rows.map((row) => row.task_id)).size
  return { distinctTasks, occurrences: rows.length }
}

// "Erro recorrente" only — the same criterion/rule ID failing across ≥3
// DISTINCT tasks (not ≥3 retry-cycles within a single task: that's already
// what cycle_tracker's own per-task retry loop handles, and counting
// same-task retries here would make an ordinary 2-cycle correction inside
// one task look like a project-wide pattern). This is a judgment call the
// original request left open ("3 ocorrências do mesmo critério") — decided
// in favor of distinct-task count because that's the signal actually
// actionable as "candidato a virar regra nova no baseline", documented
// here and in agent-architecture.md.
export function queryRecurringCategories(directory: string): RecurringCategory[] {
  return queryRecurring(directory, { sources: ERROR_SOURCES, threshold: RECURRENCE_THRESHOLD })
}

function queryRecurring(
  directory: string,
  options: { sources?: PatternEventSource[]; threshold: number },
): RecurringCategory[] {
  const db = getDb(directory)
  const start = windowStartISO(directory)

  const rows = db
    .prepare(`SELECT category_id, source, task_id FROM pattern_events WHERE created_at >= ? ORDER BY category_id`)
    .all(start) as { category_id: string; source: PatternEventSource; task_id: string }[]

  const grouped = new Map<string, RecurringCategory>()
  for (const row of rows) {
    if (options.sources && !options.sources.includes(row.source)) continue
    const key = `${row.source}:${row.category_id}`
    let entry = grouped.get(key)
    if (!entry) {
      entry = { category_id: row.category_id, source: row.source, distinctTasks: 0, occurrences: 0, task_ids: [] }
      grouped.set(key, entry)
    }
    entry.occurrences++
    if (!entry.task_ids.includes(row.task_id)) {
      entry.task_ids.push(row.task_id)
      entry.distinctTasks++
    }
  }

  return [...grouped.values()]
    .filter((entry) => entry.distinctTasks >= options.threshold)
    .toSorted((a, b) => b.distinctTasks - a.distinctTasks)
}

export interface RecurrenceReport {
  completedTasks: number
  windowStart: string
  erroRecorrente: RecurringCategory[]
  rotinaRecorrente: RecurringCategory[]
}

// "Erro recorrente" comes entirely from the 3 fixed, auto-recorded event
// sources (review_checklist, baseline_auditor, self_test_escalation).
// "Rotina recorrente" comes from the workflow-executor's own labels
// (source "executor_rotina") — a human-decided candidate to become a new
// tool/skill, reported but never auto-implemented by the pattern-auditor.
export function buildRecurrenceReport(directory: string): RecurrenceReport {
  return {
    completedTasks: countCompletedTasks(directory),
    windowStart: windowStartISO(directory),
    erroRecorrente: queryRecurringCategories(directory),
    rotinaRecorrente: queryRecurringRoutines(directory),
  }
}

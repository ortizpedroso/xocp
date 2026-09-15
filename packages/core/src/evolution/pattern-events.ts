import path from "path"
import { Database } from "bun:sqlite"

// Recurrence tracking for the pattern-auditor subagent (Tarefa 10). Same
// bun:sqlite style as workflow-review/cycle-tracker.ts and
// workflow-executor/self-test-tracker.ts — a separate DB file, not reusing
// either of those two tables, so recurrence bookkeeping never interferes
// with the Avaliador's or the Executor's own cycle counters.

export type PatternEventSource = "review_checklist" | "baseline_auditor" | "self_test_escalation"

const RECURRENCE_THRESHOLD = 3
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
  const db = getDb(directory)
  const start = windowStartISO(directory)

  const rows = db
    .prepare(`SELECT category_id, source, task_id FROM pattern_events WHERE created_at >= ? ORDER BY category_id`)
    .all(start) as { category_id: string; source: PatternEventSource; task_id: string }[]

  const grouped = new Map<string, RecurringCategory>()
  for (const row of rows) {
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
    .filter((entry) => entry.distinctTasks >= RECURRENCE_THRESHOLD)
    .toSorted((a, b) => b.distinctTasks - a.distinctTasks)
}

export interface RecurrenceReport {
  completedTasks: number
  windowStart: string
  erroRecorrente: RecurringCategory[]
  rotinaRecorrente: {
    items: never[]
    limitation: string
  }
}

// "Rotina recorrente" (same kind of manual work repeating across unrelated
// tasks with no rejection involved — candidate for a new tool/skill) needs a
// signal this codebase doesn't emit anywhere yet: nothing records which
// files/actions an Executor touched per Brief in a form comparable across
// unrelated tasks (files_expected_touched is Analista's estimate, not a
// record of what actually happened). Inventing a fuzzy similarity heuristic
// to force this category to have content would produce noise, not signal —
// per Tarefa 10's own instruction, documented here as a known limitation of
// this first version instead. "Erro recorrente" has no such gap: it's built
// entirely from the 3 fixed, already-ID'd event sources.
export function buildRecurrenceReport(directory: string): RecurrenceReport {
  return {
    completedTasks: countCompletedTasks(directory),
    windowStart: windowStartISO(directory),
    erroRecorrente: queryRecurringCategories(directory),
    rotinaRecorrente: {
      items: [],
      limitation:
        "Sem dado suficiente nesta primeira versão: nenhuma fonte existente registra o que o Executor efetivamente tocou por Brief de forma comparável entre tarefas não relacionadas (files_expected_touched é a estimativa do Analista, não um registro do que rodou). Ver specs/xocp/agent-architecture.md.",
    },
  }
}

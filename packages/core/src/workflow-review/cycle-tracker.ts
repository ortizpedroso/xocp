import fs from "fs/promises"
import path from "path"
import { Database } from "bun:sqlite"
import { CycleLimitExceeded, CycleLimitExceededError } from "./error"
import { reviewsRelativeDir, sanitizeTaskId } from "./task-path"
import { recordIncident } from "../evolution/incident"

const MAX_CYCLES = 3

const dbCache = new Map<string, Database>()

function getCyclesDb(directory: string): Database {
  const dbDir = path.join(directory, ".opencode")
  const dbPath = path.join(dbDir, "workflow-cycles.db")

  let db = dbCache.get(dbPath)
  if (!db) {
    // Ensure directory exists synchronously/immediately
    try {
      require("fs").mkdirSync(dbDir, { recursive: true })
    } catch {}

    db = new Database(dbPath, { create: true })
    db.exec("PRAGMA journal_mode = WAL;")
    db.exec(`
      CREATE TABLE IF NOT EXISTS task_cycles (
        task_id TEXT PRIMARY KEY,
        cycle INTEGER NOT NULL,
        updated_at TEXT NOT NULL
      );
    `)
    dbCache.set(dbPath, db)
  }
  return db
}

function legacyCycleCountPath(directory: string, task_id: string) {
  return path.join(directory, reviewsRelativeDir(task_id), "cycle-count.txt")
}

export async function readCycle(directory: string, task_id: string): Promise<number> {
  const db = getCyclesDb(directory)
  const stmt = db.prepare("SELECT cycle FROM task_cycles WHERE task_id = ?")
  const row = stmt.get(task_id) as { cycle: number } | null

  if (row && typeof row.cycle === "number") {
    return row.cycle
  }

  // Fallback to reading legacy cycle-count.txt file if present
  const filePath = legacyCycleCountPath(directory, task_id)
  if (await Bun.file(filePath).exists()) {
    const raw = (await Bun.file(filePath).text()).trim()
    const val = Number.parseInt(raw, 10)
    if (!Number.isNaN(val) && val >= 0) {
      // Sync into SQLite
      db.prepare(`
        INSERT INTO task_cycles (task_id, cycle, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(task_id) DO UPDATE SET cycle = excluded.cycle, updated_at = excluded.updated_at
      `).run(task_id, val, new Date().toISOString())
      return val
    }
  }

  return 0
}

export async function incrementCycle(directory: string, task_id: string): Promise<number> {
  const db = getCyclesDb(directory)

  // Use atomic transaction with BEGIN IMMEDIATE
  const incrementTx = db.transaction((tid: string) => {
    const selectStmt = db.prepare("SELECT cycle FROM task_cycles WHERE task_id = ?")
    const existing = selectStmt.get(tid) as { cycle: number } | null

    let current = 0
    if (existing && typeof existing.cycle === "number") {
      current = existing.cycle
    } else {
      // Check legacy file synchronously if not in DB yet
      const legacyPath = legacyCycleCountPath(directory, tid)
      try {
        if (require("fs").existsSync(legacyPath)) {
          const raw = require("fs").readFileSync(legacyPath, "utf-8").trim()
          const val = Number.parseInt(raw, 10)
          if (!Number.isNaN(val) && val >= 0) current = val
        }
      } catch {}
    }

    const next = current + 1
    const upsertStmt = db.prepare(`
      INSERT INTO task_cycles (task_id, cycle, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(task_id) DO UPDATE SET cycle = excluded.cycle, updated_at = excluded.updated_at
    `)
    upsertStmt.run(tid, next, new Date().toISOString())

    return next
  })

  const next = incrementTx.immediate(task_id)

  // Also sync to legacy cycle-count.txt for review backwards compatibility
  try {
    const legacyPath = legacyCycleCountPath(directory, task_id)
    await fs.mkdir(path.dirname(legacyPath), { recursive: true })
    await Bun.write(legacyPath, `${next}\n`)
  } catch {}

  if (next > MAX_CYCLES) {
    // Log evolution incident when cycle threshold is breached
    try {
      await recordIncident(directory, {
        task_id,
        cycles_used: next,
        root_cause_category: "cycle_threshold_reached",
        symptom: `Cycle limit exceeded for task ${task_id}: cycle ${next} > ${MAX_CYCLES}`,
        context_snapshot: {
          task_id,
          max_cycles: MAX_CYCLES,
          current_cycle: next,
        },
      })
    } catch {}

    throw new CycleLimitExceeded({ task_id, cycle: next })
  }

  return next
}

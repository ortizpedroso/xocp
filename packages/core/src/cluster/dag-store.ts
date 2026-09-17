import path from "path"
import { Database } from "bun:sqlite"
import type { DagSnapshot } from "./dispatcher"

/**
 * Durable DAG store. Persists node states + completedBriefIds into SQLite
 * (WAL mode), mirrored from cycle-tracker.ts. The in-memory ClusterDispatcher
 * remains the source of truth during a run; DagStore.save() snapshots it after
 * each transition so a crash/session restart can rehydrate via
 * `ClusterDispatcher.fromSnapshot(...)` reading `.opencode/dag.db`.
 */

const dbCache = new Map<string, Database>()

function getDagDb(directory: string): Database {
  const dbDir = path.join(directory, ".opencode")
  const dbPath = path.join(dbDir, "dag.db")

  let db = dbCache.get(dbPath)
  if (!db) {
    try {
      require("fs").mkdirSync(dbDir, { recursive: true })
    } catch {}

    db = new Database(dbPath, { create: true })
    db.exec("PRAGMA journal_mode = WAL;")
    db.exec(`
      CREATE TABLE IF NOT EXISTS dag_nodes (
        brief_id TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        error TEXT,
        review_verdict TEXT,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS dag_completed (
        brief_id TEXT PRIMARY KEY,
        updated_at TEXT NOT NULL
      );
    `)
    dbCache.set(dbPath, db)
  }
  return db
}

export class DagStore {
  constructor(private readonly directory: string) {}

  close(): void {
    const dbPath = path.join(this.directory, ".opencode", "dag.db")
    const db = dbCache.get(dbPath)
    if (db) {
      try {
        db.close()
      } catch {}
      dbCache.delete(dbPath)
    }
  }

  save(snapshot: DagSnapshot): void {
    const db = getDagDb(this.directory)
    const tx = db.transaction((snap: DagSnapshot) => {
      db.prepare("DELETE FROM dag_nodes").run()
      db.prepare("DELETE FROM dag_completed").run()

      const upsertNode = db.prepare(`
        INSERT INTO dag_nodes (brief_id, status, error, review_verdict, updated_at)
        VALUES (?, ?, ?, ?, ?)
      `)
      for (const n of snap.nodes) {
        upsertNode.run(n.brief_id, n.status, n.error ?? null, n.reviewVerdict ?? null, new Date().toISOString())
      }

      const upsertCompleted = db.prepare(`
        INSERT INTO dag_completed (brief_id, updated_at)
        VALUES (?, ?)
      `)
      for (const id of snap.completedBriefIds) {
        upsertCompleted.run(id, new Date().toISOString())
      }
    })
    tx.immediate(snapshot)
  }

  load(): DagSnapshot {
    const db = getDagDb(this.directory)
    const nodes = db
      .prepare("SELECT brief_id, status, error, review_verdict FROM dag_nodes ORDER BY brief_id")
      .all() as Array<{
      brief_id: string
      status: DagSnapshot["nodes"][number]["status"]
      error: string | null
      review_verdict: DagSnapshot["nodes"][number]["reviewVerdict"] | null
    }>
    const completed = db
      .prepare("SELECT brief_id FROM dag_completed ORDER BY brief_id")
      .all() as Array<{ brief_id: string }>

    return {
      nodes: nodes.map((n) => ({
        brief_id: n.brief_id,
        status: n.status,
        error: n.error ?? undefined,
        reviewVerdict: n.review_verdict ?? undefined,
      })),
      completedBriefIds: completed.map((c) => c.brief_id),
    }
  }
}
import fs from "fs/promises"
import path from "path"
import { Database } from "bun:sqlite"

export interface SourceDocument {
  id: string
  title: string
  kind: "html" | "markdown" | "pdf" | "image" | "text"
  content: string
  path?: string
  metadata?: Record<string, unknown>
  created_at: string
}

export interface SourceSearchResult {
  id: string
  title: string
  kind: string
  snippet: string
  score: number
  path?: string
  created_at: string
}

const dbCache = new Map<string, Database>()

export function getSourcesDb(directory: string): Database {
  const dbDir = path.join(directory, ".opencode")
  const dbPath = path.join(dbDir, "sources.db")

  let db = dbCache.get(dbPath)
  if (!db) {
    try {
      require("fs").mkdirSync(dbDir, { recursive: true })
    } catch {}

    db = new Database(dbPath, { create: true })
    db.exec("PRAGMA journal_mode = WAL;")

    // Create main table and FTS5 virtual table
    db.exec(`
      CREATE TABLE IF NOT EXISTS sources (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        kind TEXT NOT NULL,
        content TEXT NOT NULL,
        path TEXT,
        metadata TEXT,
        created_at TEXT NOT NULL
      );

      CREATE VIRTUAL TABLE IF NOT EXISTS sources_fts USING fts5(
        id UNINDEXED,
        title,
        content,
        tokenize = 'porter unicode61'
      );
    `)

    dbCache.set(dbPath, db)
  }
  return db
}

export async function ingestSource(
  directory: string,
  source: {
    id: string
    title: string
    kind: "html" | "markdown" | "pdf" | "image" | "text"
    content: string
    path?: string
    metadata?: Record<string, unknown>
  }
): Promise<SourceDocument> {
  const sourcesDir = path.join(directory, ".opencode", "sources")
  await fs.mkdir(sourcesDir, { recursive: true })

  const created_at = new Date().toISOString()
  const doc: SourceDocument = {
    ...source,
    created_at,
  }

  // Save raw file in .opencode/sources/
  const fileExtension = source.kind === "markdown" ? "md" : source.kind === "html" ? "html" : "txt"
  const rawFilePath = path.join(sourcesDir, `${source.id}.${fileExtension}`)
  await Bun.write(rawFilePath, source.content)
  doc.path = rawFilePath

  const db = getSourcesDb(directory)

  const insertTx = db.transaction(() => {
    // Delete existing entry if upserting
    db.prepare("DELETE FROM sources WHERE id = ?").run(doc.id)
    db.prepare("DELETE FROM sources_fts WHERE id = ?").run(doc.id)

    db.prepare(`
      INSERT INTO sources (id, title, kind, content, path, metadata, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      doc.id,
      doc.title,
      doc.kind,
      doc.content,
      doc.path ?? null,
      doc.metadata ? JSON.stringify(doc.metadata) : null,
      doc.created_at
    )

    db.prepare(`
      INSERT INTO sources_fts (id, title, content)
      VALUES (?, ?, ?)
    `).run(doc.id, doc.title, doc.content)
  })

  insertTx.immediate()

  return doc
}

export function listSources(directory: string): Array<Omit<SourceDocument, "content">> {
  const db = getSourcesDb(directory)
  const rows = db.prepare(`
    SELECT id, title, kind, path, metadata, created_at
    FROM sources
    ORDER BY created_at DESC
  `).all() as Array<{
    id: string
    title: string
    kind: "html" | "markdown" | "pdf" | "image" | "text"
    path: string | null
    metadata: string | null
    created_at: string
  }>

  return rows.map(r => ({
    id: r.id,
    title: r.title,
    kind: r.kind,
    path: r.path || undefined,
    metadata: r.metadata ? JSON.parse(r.metadata) : undefined,
    created_at: r.created_at,
  }))
}

export function querySources(
  directory: string,
  query: string,
  source_id?: string
): SourceSearchResult[] {
  const db = getSourcesDb(directory)

  // Sanitize FTS5 query token: escape special FTS characters
  const cleanQuery = query
    .replace(/["*+\-^:()]/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(term => `"${term}"*`)
    .join(" AND ")

  if (!cleanQuery) return []

  if (source_id) {
    const rows = db.prepare(`
      SELECT 
        s.id,
        s.title,
        s.kind,
        s.path,
        s.created_at,
        snippet(sources_fts, 2, '<b>', '</b>', '...', 25) AS snippet,
        bm25(sources_fts) AS rank
      FROM sources_fts
      JOIN sources s ON s.id = sources_fts.id
      WHERE sources_fts MATCH ? AND s.id = ?
      ORDER BY rank
      LIMIT 20
    `).all(cleanQuery, source_id) as Array<{
      id: string
      title: string
      kind: string
      path: string | null
      created_at: string
      snippet: string
      rank: number
    }>

    return rows.map(r => ({
      id: r.id,
      title: r.title,
      kind: r.kind,
      snippet: r.snippet,
      score: r.rank,
      path: r.path || undefined,
      created_at: r.created_at,
    }))
  }

  const rows = db.prepare(`
    SELECT 
      s.id,
      s.title,
      s.kind,
      s.path,
      s.created_at,
      snippet(sources_fts, 2, '<b>', '</b>', '...', 25) AS snippet,
      bm25(sources_fts) AS rank
    FROM sources_fts
    JOIN sources s ON s.id = sources_fts.id
    WHERE sources_fts MATCH ?
    ORDER BY rank
    LIMIT 20
  `).all(cleanQuery) as Array<{
    id: string
    title: string
    kind: string
    path: string | null
    created_at: string
    snippet: string
    rank: number
  }>

  return rows.map(r => ({
    id: r.id,
    title: r.title,
    kind: r.kind,
    snippet: r.snippet,
    score: r.rank,
    path: r.path || undefined,
    created_at: r.created_at,
  }))
}

/**
 * Strict Permission Boundary:
 * - elicitador and analista: ALLOWED to query sources
 * - workflow-executor and avaliador: STRICTLY BLOCKED from accessing source tools
 */
export const ALLOWED_SOURCES_AGENTS = new Set(["elicitador", "analista"])
export const BLOCKED_SOURCES_AGENTS = new Set(["workflow-executor", "avaliador"])

export class SourcesPermissionDeniedError extends Error {
  constructor(public readonly agentId: string) {
    super(
      `Agent '${agentId}' is forbidden from accessing research sources. Only 'elicitador' and 'analista' are permitted.`
    )
    this.name = "SourcesPermissionDeniedError"
  }
}

export function canAccessSources(agentId: string): boolean {
  if (BLOCKED_SOURCES_AGENTS.has(agentId)) return false
  return ALLOWED_SOURCES_AGENTS.has(agentId)
}

export function assertCanAccessSources(agentId: string): void {
  if (!canAccessSources(agentId)) {
    throw new SourcesPermissionDeniedError(agentId)
  }
}

export async function sources_list(
  directory: string,
  agentId: string
): Promise<Array<Omit<SourceDocument, "content">>> {
  assertCanAccessSources(agentId)
  return listSources(directory)
}

export async function sources_query(
  directory: string,
  agentId: string,
  query: string,
  source_id?: string
): Promise<SourceSearchResult[]> {
  assertCanAccessSources(agentId)
  return querySources(directory, query, source_id)
}

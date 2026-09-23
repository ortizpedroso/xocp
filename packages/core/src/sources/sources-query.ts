import { getSourcesDb } from "./index"

export interface SourceChunk {
  chunk_id: string
  source_id: string
  heading: string
  content: string
  score: number
  relevanceReason?: string
}

/**
 * User-Intent Query Filter
 * Queries SQLite FTS5 (BM25) while strictly ranking and filtering results against the explicit
 * intent of the user prompt/objective, suppressing off-topic document sections.
 */
export function querySourcesByIntent(
  directory: string,
  userObjective: string,
  searchTerms?: string
): SourceChunk[] {
  const db = getSourcesDb(directory)

  // Ensure table exists in case query runs first
  db.exec(`
    CREATE TABLE IF NOT EXISTS source_chunks (
      chunk_id TEXT PRIMARY KEY,
      source_id TEXT NOT NULL,
      heading TEXT NOT NULL,
      content TEXT NOT NULL
    );
    CREATE VIRTUAL TABLE IF NOT EXISTS source_chunks_fts USING fts5(
      chunk_id UNINDEXED,
      source_id UNINDEXED,
      heading,
      content,
      tokenize = 'porter unicode61'
    );
  `)

  // Extract core keywords from user objective and search terms
  const combined = `${userObjective} ${searchTerms || ""}`
  const stopWords = new Set([
    "the", "and", "a", "an", "in", "on", "at", "to", "for", "of", "with", "by", "from",
    "is", "are", "was", "were", "be", "this", "that", "it", "as", "or", "how", "what", "why",
    "de", "do", "da", "para", "com", "em", "um", "uma", "por", "que", "como", "sobre"
  ])

  const terms = combined
    .toLowerCase()
    .replace(/[^a-z0-9_\-\s]/g, " ")
    .split(/\s+/)
    .filter(t => t.length > 2 && !stopWords.has(t))

  if (terms.length === 0) {
    return []
  }

  // Build FTS5 query token
  const ftsQuery = Array.from(new Set(terms))
    .slice(0, 8)
    .map(t => `"${t}"*`)
    .join(" OR ")

  const rows = db.prepare(`
    SELECT 
      sc.chunk_id,
      sc.source_id,
      sc.heading,
      sc.content,
      bm25(source_chunks_fts) AS rank
    FROM source_chunks_fts
    JOIN source_chunks sc ON sc.chunk_id = source_chunks_fts.chunk_id
    WHERE source_chunks_fts MATCH ?
    ORDER BY rank
    LIMIT 25
  `).all(ftsQuery) as Array<{
    chunk_id: string
    source_id: string
    heading: string
    content: string
    rank: number
  }>

  // Objective Intent Filtering:
  // Score chunks by match with the user's explicit objective keywords.
  // Suppress chunks that have 0 term overlaps with the user objective keywords.
  const objectiveKeywords = userObjective
    .toLowerCase()
    .replace(/[^a-z0-9_\-\s]/g, " ")
    .split(/\s+/)
    .filter(t => t.length > 2 && !stopWords.has(t))

  const intentFiltered: SourceChunk[] = []

  for (const row of rows) {
    const textLower = (row.heading + " " + row.content).toLowerCase()
    let intentMatchCount = 0

    for (const kw of objectiveKeywords) {
      if (textLower.includes(kw)) {
        intentMatchCount++
      }
    }

    // Suppress off-topic chunks (at least 1 objective keyword match is required if keywords exist)
    if (objectiveKeywords.length > 0 && intentMatchCount === 0) {
      continue
    }

    intentFiltered.push({
      chunk_id: row.chunk_id,
      source_id: row.source_id,
      heading: row.heading,
      content: row.content,
      score: row.rank - (intentMatchCount * 0.5), // Lower BM25 rank score is better
      relevanceReason: `Matches ${intentMatchCount} intent keyword(s)`,
    })
  }

  // Sort by weighted score
  intentFiltered.sort((a, b) => a.score - b.score)

  return intentFiltered.slice(0, 15)
}

import fs from "fs/promises"
import path from "path"
import { getSourcesDb } from "./index"
import { transformHtmlToMarkdown } from "./transformers/html-transformer"
import { transformPdfTextToMarkdown } from "./transformers/pdf-transformer"
import { parseBinaryPdfToMarkdown } from "./transformers/pdf-binary"
import { transformTranscriptToMarkdown, type TranscriptSegment } from "./transformers/transcript-transformer"
import { transformSnippetToMarkdown } from "./transformers/code-transformer"

export type SourceType = "url" | "pdf" | "html" | "transcript" | "snippet"

export interface NormalizedSourceMetadata {
  source_id: string
  title: string
  source_type: SourceType
  original_uri: string
  ingested_at: string
  summary: string
  key_entities: string[]
}

export interface NormalizedSourceDocument {
  metadata: NormalizedSourceMetadata
  markdown: string
  rawContent?: string
  normalizedPath: string
  rawPath: string
}

export interface IngestSourceInput {
  source_id?: string
  title?: string
  source_type: SourceType
  original_uri?: string
  raw_content?: string
  raw_buffer?: ArrayBuffer | Uint8Array | Buffer
  language?: string
  summary?: string
  key_entities?: string[]
  transcript_segments?: TranscriptSegment[]
}

/**
 * Persists normalized document to .opencode/sources/normalized/<source_id>.md
 * with strict YAML frontmatter.
 */
export function buildNormalizedMarkdown(metadata: NormalizedSourceMetadata, contentMarkdown: string): string {
  const frontmatter = [
    "---",
    `source_id: "${metadata.source_id}"`,
    `title: "${metadata.title.replace(/"/g, '\\"')}"`,
    `source_type: "${metadata.source_type}"`,
    `original_uri: "${metadata.original_uri}"`,
    `ingested_at: "${metadata.ingested_at}"`,
    `summary: "${metadata.summary.replace(/"/g, '\\"')}"`,
    `key_entities: [${metadata.key_entities.map(e => `"${e.replace(/"/g, '\\"')}"`).join(", ")}]`,
    "---",
    "",
    contentMarkdown.trim(),
  ].join("\n")

  return frontmatter
}

/**
 * Normalizes any external input into Markdown, saves raw and normalized files,
 * and indexes both document and semantic heading-aware chunks into SQLite FTS5.
 */
export async function ingestAndNormalizeSource(
  directory: string,
  input: IngestSourceInput
): Promise<NormalizedSourceDocument> {
  const sourcesDir = path.join(directory, ".opencode", "sources")
  const normalizedDir = path.join(sourcesDir, "normalized")
  await fs.mkdir(normalizedDir, { recursive: true })

  const source_id = input.source_id || `source-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const ingested_at = new Date().toISOString()
  const original_uri = input.original_uri || "local://user-input"

  let title = input.title || "Untitled Source"
  let contentMarkdown = ""

  // Transform based on source_type
  switch (input.source_type) {
    case "html":
    case "url": {
      const res = transformHtmlToMarkdown(input.raw_content || "")
      title = input.title || res.title
      contentMarkdown = res.markdown
      break
    }
    case "pdf": {
      if (input.raw_buffer) {
        const res = await parseBinaryPdfToMarkdown(input.raw_buffer, input.title)
        title = input.title || res.title
        contentMarkdown = res.markdown
      } else {
        const res = transformPdfTextToMarkdown(input.raw_content || "", input.title)
        title = input.title || res.title
        contentMarkdown = res.markdown
      }
      break
    }
    case "transcript": {
      const segments = input.transcript_segments || [
        { timestamp: "00:00", text: input.raw_content || "" },
      ]
      const res = transformTranscriptToMarkdown(
        { title: input.title || "Media Transcript", videoUrlOrId: original_uri },
        segments
      )
      title = input.title || res.title
      contentMarkdown = res.markdown
      break
    }
    case "snippet": {
      const res = transformSnippetToMarkdown({
        title: input.title || "Code Snippet",
        code: input.raw_content || "",
        language: input.language || "ts",
        description: input.summary,
      })
      title = res.title
      contentMarkdown = res.markdown
      break
    }
    default:
      contentMarkdown = input.raw_content || ""
  }

  // Derive brief summary if not provided
  const derivedSummary = input.summary || contentMarkdown.slice(0, 180).replace(/[\r\n#*`]+/g, " ").trim()
  const derivedEntities = input.key_entities || extractSimpleEntities(title + " " + contentMarkdown)

  const metadata: NormalizedSourceMetadata = {
    source_id,
    title,
    source_type: input.source_type,
    original_uri,
    ingested_at,
    summary: derivedSummary,
    key_entities: derivedEntities,
  }

  const normalizedMarkdown = buildNormalizedMarkdown(metadata, contentMarkdown)

  // Save raw file
  const rawExt = input.source_type === "html" ? "html" : input.source_type === "pdf" ? (input.raw_buffer ? "pdf" : "pdf.txt") : "raw.txt"
  const rawPath = path.join(sourcesDir, `${source_id}.${rawExt}`)
  if (input.raw_buffer) {
    await Bun.write(rawPath, input.raw_buffer)
  } else {
    await Bun.write(rawPath, input.raw_content || "")
  }

  // Save normalized markdown file
  const normalizedPath = path.join(normalizedDir, `${source_id}.md`)
  await Bun.write(normalizedPath, normalizedMarkdown)

  // Index into SQLite (both catalog and FTS5)
  const db = getSourcesDb(directory)

  // Ensure chunk index table exists
  db.exec(`
    CREATE TABLE IF NOT EXISTS source_chunks (
      chunk_id TEXT PRIMARY KEY,
      source_id TEXT NOT NULL,
      heading TEXT NOT NULL,
      content TEXT NOT NULL,
      FOREIGN KEY(source_id) REFERENCES sources(id)
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS source_chunks_fts USING fts5(
      chunk_id UNINDEXED,
      source_id UNINDEXED,
      heading,
      content,
      tokenize = 'porter unicode61'
    );
  `)

  // Parse semantic chunks around headings (#, ##, ###)
  const chunks = chunkMarkdownByHeadings(source_id, contentMarkdown)

  const tx = db.transaction(() => {
    // 1. Delete previous entries if upserting
    db.prepare("DELETE FROM sources WHERE id = ?").run(source_id)
    db.prepare("DELETE FROM sources_fts WHERE id = ?").run(source_id)
    db.prepare("DELETE FROM source_chunks WHERE source_id = ?").run(source_id)
    db.prepare("DELETE FROM source_chunks_fts WHERE source_id = ?").run(source_id)

    // 2. Insert main document
    db.prepare(`
      INSERT INTO sources (id, title, kind, content, path, metadata, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      source_id,
      title,
      input.source_type,
      normalizedMarkdown,
      normalizedPath,
      JSON.stringify(metadata),
      ingested_at
    )

    db.prepare(`
      INSERT INTO sources_fts (id, title, content)
      VALUES (?, ?, ?)
    `).run(source_id, title, normalizedMarkdown)

    // 3. Insert chunks into source_chunks and source_chunks_fts
    for (const ch of chunks) {
      db.prepare(`
        INSERT INTO source_chunks (chunk_id, source_id, heading, content)
        VALUES (?, ?, ?, ?)
      `).run(ch.chunk_id, ch.source_id, ch.heading, ch.content)

      db.prepare(`
        INSERT INTO source_chunks_fts (chunk_id, source_id, heading, content)
        VALUES (?, ?, ?, ?)
      `).run(ch.chunk_id, ch.source_id, ch.heading, ch.content)
    }
  })

  tx.immediate()

  return {
    metadata,
    markdown: normalizedMarkdown,
    normalizedPath,
    rawPath,
  }
}

/**
 * Semantic Heading-Aware Chunking:
 * Splits around Markdown headings (#, ##, ###), keeping functions, tables, and paragraphs intact.
 */
export function chunkMarkdownByHeadings(source_id: string, markdown: string): Array<{
  chunk_id: string
  source_id: string
  heading: string
  content: string
}> {
  const lines = markdown.split("\n")
  const chunks: Array<{ chunk_id: string; source_id: string; heading: string; content: string }> = []

  let currentHeading = "Overview"
  let currentLines: string[] = []
  let chunkIndex = 0

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const headingMatch = line.match(/^(#{1,4})\s+(.+)$/)

    if (headingMatch) {
      if (currentLines.length > 0) {
        const text = currentLines.join("\n").trim()
        if (text) {
          chunks.push({
            chunk_id: `${source_id}-c${chunkIndex++}`,
            source_id,
            heading: currentHeading,
            content: text,
          })
        }
        currentLines = []
      }
      currentHeading = headingMatch[2].trim()
    }
    currentLines.push(line)
  }

  if (currentLines.length > 0) {
    const text = currentLines.join("\n").trim()
    if (text) {
      chunks.push({
        chunk_id: `${source_id}-c${chunkIndex++}`,
        source_id,
        heading: currentHeading,
        content: text,
      })
    }
  }

  return chunks
}

function extractSimpleEntities(text: string): string[] {
  const words = text.match(/\b[A-Z][a-zA-Z0-9_]{2,}\b/g) || []
  const unique = Array.from(new Set(words)).slice(0, 10)
  return unique
}

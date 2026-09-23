import fs from "fs/promises"
import path from "path"
import { getSourcesDb } from "./index"
import { ingestAndNormalizeSource, type IngestSourceInput } from "./ingest"
import { querySourcesByIntent } from "./sources-query"
import { crawlYouTubeTranscript, extractYouTubeVideoId } from "./transformers/youtube-crawler"

export interface SourcesRouterOptions {
  workspaceDir: string
}

/**
 * Sources API Request Handlers
 * - POST /api/sources/ingest: Multipart/JSON handler routing raw inputs through transformers into normalized storage + FTS5
 * - GET /api/sources/list: Returns JSON list of all active sources (id, title, source_type, summary, ingested_at)
 * - DELETE /api/sources/:id: Removes raw file, normalized file, and purges entries from .opencode/sources.db
 * - POST /api/sources/query: Intent-filtered search endpoint
 */
export class SourcesRouter {
  constructor(private workspaceDir: string) {}

  public async handleRequest(req: Request): Promise<Response> {
    const url = new URL(req.url)
    const pathname = url.pathname

    try {
      if (req.method === "POST" && pathname === "/api/sources/ingest") {
        return await this.handleIngest(req)
      }

      if (req.method === "GET" && pathname === "/api/sources/list") {
        return await this.handleList()
      }

      if (req.method === "POST" && pathname === "/api/sources/query") {
        return await this.handleQuery(req)
      }

      const deleteMatch = pathname.match(/^\/api\/sources\/([^/]+)$/)
      if (req.method === "DELETE" && deleteMatch) {
        return await this.handleDelete(deleteMatch[1])
      }

      return new Response(JSON.stringify({ error: "Endpoint not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      })
    } catch (err: any) {
      return new Response(
        JSON.stringify({ error: err?.message || String(err) }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      )
    }
  }

  private async handleIngest(req: Request): Promise<Response> {
    const contentType = req.headers.get("content-type") || ""

    let input: IngestSourceInput

    if (contentType.includes("application/json")) {
      input = (await req.json()) as IngestSourceInput

      // Check if original_uri or raw_content is a YouTube URL
      const candidateUrl = input.original_uri || (input.raw_content && input.raw_content.startsWith("http") ? input.raw_content : "")
      if (candidateUrl && extractYouTubeVideoId(candidateUrl)) {
        const ytResult = await crawlYouTubeTranscript(candidateUrl)
        input.source_type = "transcript"
        input.title = input.title || ytResult.title
        input.raw_content = ytResult.markdown
        input.original_uri = candidateUrl
      }
    } else if (contentType.includes("multipart/form-data") || contentType.includes("application/x-www-form-urlencoded")) {
      const formData = await req.formData()
      const rawFile = formData.get("file")
      let rawContent = ""
      let rawBuffer: ArrayBuffer | undefined

      let detectedType: any = formData.get("source_type") || "html"
      let fileName = ""

      if (rawFile && typeof rawFile === "object") {
        fileName = (rawFile as any).name || ""
        const mimeType = (rawFile as any).type || ""

        if (mimeType.includes("pdf") || fileName.toLowerCase().endsWith(".pdf")) {
          detectedType = "pdf"
          rawBuffer = await (rawFile as any).arrayBuffer()
        } else if ("text" in rawFile) {
          rawContent = await (rawFile as any).text()
        }
      } else {
        rawContent = String(formData.get("raw_content") || "")
      }

      const originalUri = (formData.get("original_uri") as string) || undefined
      const candidateUrl = originalUri || (rawContent && rawContent.startsWith("http") ? rawContent : "")

      if (candidateUrl && extractYouTubeVideoId(candidateUrl)) {
        const ytResult = await crawlYouTubeTranscript(candidateUrl)
        detectedType = "transcript"
        rawContent = ytResult.markdown
      }

      input = {
        title: (formData.get("title") as string) || (fileName ? fileName.replace(/\.[^/.]+$/, "") : undefined),
        source_type: detectedType,
        original_uri: originalUri || (fileName ? `file://${fileName}` : undefined),
        raw_content: rawContent,
        raw_buffer: rawBuffer,
        language: (formData.get("language") as string) || undefined,
        summary: (formData.get("summary") as string) || undefined,
      }
    } else {
      const text = await req.text()
      // Check if text is a YouTube URL
      if (text.startsWith("http") && extractYouTubeVideoId(text)) {
        const ytResult = await crawlYouTubeTranscript(text)
        input = {
          title: ytResult.title,
          source_type: "transcript",
          original_uri: text,
          raw_content: ytResult.markdown,
        }
      } else {
        input = {
          source_type: "snippet",
          raw_content: text,
        }
      }
    }

    if (!input.raw_content && !input.raw_buffer) {
      return new Response(JSON.stringify({ error: "raw_content or binary file is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      })
    }

    const result = await ingestAndNormalizeSource(this.workspaceDir, input)

    return new Response(JSON.stringify({ success: true, document: result }), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    })
  }

  private async handleList(): Promise<Response> {
    const db = getSourcesDb(this.workspaceDir)
    const rows = db.prepare(`
      SELECT id, title, kind, path, metadata, created_at
      FROM sources
      ORDER BY created_at DESC
    `).all() as Array<{
      id: string
      title: string
      kind: string
      path: string | null
      metadata: string | null
      created_at: string
    }>

    const items = rows.map((r) => {
      let meta: any = {}
      try {
        if (r.metadata) meta = JSON.parse(r.metadata)
      } catch {}

      return {
        id: r.id,
        title: r.title,
        source_type: r.kind,
        summary: meta.summary || "",
        ingested_at: r.created_at,
        path: r.path,
      }
    })

    return new Response(JSON.stringify({ sources: items }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })
  }

  private async handleDelete(sourceId: string): Promise<Response> {
    const db = getSourcesDb(this.workspaceDir)

    // Find paths before delete
    const row = db.prepare("SELECT path FROM sources WHERE id = ?").get(sourceId) as { path?: string } | undefined

    const deleteTx = db.transaction(() => {
      db.prepare("DELETE FROM sources WHERE id = ?").run(sourceId)
      db.prepare("DELETE FROM sources_fts WHERE id = ?").run(sourceId)
      db.prepare("DELETE FROM source_chunks WHERE source_id = ?").run(sourceId)
      db.prepare("DELETE FROM source_chunks_fts WHERE source_id = ?").run(sourceId)
    })
    deleteTx.immediate()

    // Delete files if present
    const sourcesDir = path.join(this.workspaceDir, ".opencode", "sources")
    const normalizedFile = path.join(sourcesDir, "normalized", `${sourceId}.md`)

    try { await fs.unlink(normalizedFile) } catch {}
    if (row?.path) {
      try { await fs.unlink(row.path) } catch {}
    }

    return new Response(JSON.stringify({ success: true, deleted_id: sourceId }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })
  }

  private async handleQuery(req: Request): Promise<Response> {
    const body = (await req.json()) as { userObjective: string; searchTerms?: string }
    if (!body.userObjective) {
      return new Response(JSON.stringify({ error: "userObjective is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      })
    }

    const chunks = querySourcesByIntent(this.workspaceDir, body.userObjective, body.searchTerms)
    return new Response(JSON.stringify({ chunks }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })
  }
}

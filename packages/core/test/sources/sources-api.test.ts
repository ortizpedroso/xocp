import { describe, expect, test, beforeEach } from "bun:test"
import path from "path"
import fs from "fs/promises"
import { SourcesRouter } from "../../src/sources/router"

describe("sources/router HTTP API endpoints", () => {
  const testDir = path.join(__dirname, "../fixtures/api-sources-" + Date.now())
  let router: SourcesRouter

  beforeEach(async () => {
    await fs.mkdir(testDir, { recursive: true })
    router = new SourcesRouter(testDir)
  })

  test("Tests POST /api/sources/ingest, GET /api/sources/list, and DELETE /api/sources/:id", async () => {
    // 1. Ingest via JSON
    const ingestReq = new Request("http://localhost:4096/api/sources/ingest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source_id: "src-api-test-01",
        title: "API Architecture Notes",
        source_type: "snippet",
        language: "typescript",
        summary: "Controller and routes patterns",
        raw_content: "export const handleRoute = () => { return 'ok'; }",
      }),
    })

    const ingestRes = await router.handleRequest(ingestReq)
    expect(ingestRes.status).toBe(201)
    const ingestJson = (await ingestRes.json()) as {
      success: boolean
      document: { metadata: { source_id: string } }
    }
    expect(ingestJson.success).toBe(true)
    expect(ingestJson.document.metadata.source_id).toBe("src-api-test-01")

    // 2. List sources
    const listReq = new Request("http://localhost:4096/api/sources/list", {
      method: "GET",
    })
    const listRes = await router.handleRequest(listReq)
    expect(listRes.status).toBe(200)
    const listJson = (await listRes.json()) as { sources: Array<{ id: string; title: string }> }
    expect(Array.isArray(listJson.sources)).toBe(true)
    expect(listJson.sources.length).toBe(1)
    expect(listJson.sources[0].id).toBe("src-api-test-01")
    expect(listJson.sources[0].title).toBe("API Architecture Notes")

    // 3. Query sources endpoint
    const queryReq = new Request("http://localhost:4096/api/sources/query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userObjective: "API routes and controllers",
      }),
    })
    const queryRes = await router.handleRequest(queryReq)
    expect(queryRes.status).toBe(200)
    const queryJson = (await queryRes.json()) as { chunks: unknown[] }
    expect(Array.isArray(queryJson.chunks)).toBe(true)

    // 4. Delete source
    const deleteReq = new Request("http://localhost:4096/api/sources/src-api-test-01", {
      method: "DELETE",
    })
    const deleteRes = await router.handleRequest(deleteReq)
    expect(deleteRes.status).toBe(200)
    const deleteJson = (await deleteRes.json()) as { success: boolean; deleted_id: string }
    expect(deleteJson.success).toBe(true)
    expect(deleteJson.deleted_id).toBe("src-api-test-01")

    // Verify list is now empty
    const listAgainRes = await router.handleRequest(listReq)
    const listAgainJson = (await listAgainRes.json()) as { sources: Array<{ id: string; title: string }> }
    expect(listAgainJson.sources.length).toBe(0)
  })
})

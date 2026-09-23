import { afterEach, describe, expect, test } from "bun:test"
import fs from "fs/promises"
import os from "os"
import path from "path"
import { ingestSource, listSources, querySources } from "../../src/sources"

const dirs: string[] = []

afterEach(async () => {
  for (const dir of dirs.splice(0)) {
    await fs.rm(dir, { recursive: true, force: true })
  }
})

async function tmpdir() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "sources-fts-"))
  dirs.push(dir)
  return dir
}

describe("sources-fts", () => {
  test("ingests raw documents and indexes with FTS5 BM25 search without LLM embeddings", async () => {
    const dir = await tmpdir()

    // Ingest 3 reference research documents
    await ingestSource(dir, {
      id: "doc-arch-01",
      title: "XOCP Pipeline Architecture RFC",
      kind: "markdown",
      content: "This document describes the 5-agent pipeline architecture using Effect-TS and Bun.",
      metadata: { author: "Agent Lead", tags: ["architecture", "pipeline"] },
    })

    await ingestSource(dir, {
      id: "doc-sec-02",
      title: "Zero Trust Security Baseline",
      kind: "markdown",
      content: "Security invariants mandate token authentication, input validation and SSRF defenses.",
      metadata: { category: "security" },
    })

    await ingestSource(dir, {
      id: "doc-db-03",
      title: "SQLite Atomic Concurrency Model",
      kind: "text",
      content: "Bun sqlite transactions with BEGIN IMMEDIATE guarantee zero lost updates in high concurrency.",
      metadata: { category: "storage" },
    })

    // List sources
    const list = listSources(dir)
    expect(list.length).toBe(3)
    expect(list.map(d => d.id)).toContain("doc-arch-01")

    // Query for architecture keyword
    const archResults = querySources(dir, "pipeline architecture")
    expect(archResults.length).toBeGreaterThan(0)
    expect(archResults[0].id).toBe("doc-arch-01")
    expect(archResults[0].snippet).toContain("pipeline")
    expect(archResults[0].snippet).toContain("architecture")

    // Query for sqlite concurrency keyword
    const dbResults = querySources(dir, "sqlite concurrency")
    expect(dbResults.length).toBeGreaterThan(0)
    expect(dbResults[0].id).toBe("doc-db-03")

    // Scoped query by source_id
    const scopedResults = querySources(dir, "security", "doc-sec-02")
    expect(scopedResults.length).toBe(1)
    expect(scopedResults[0].id).toBe("doc-sec-02")

    const emptyScope = querySources(dir, "security", "doc-arch-01")
    expect(emptyScope.length).toBe(0)
  })

  test("permission boundary: elicitador and analista allowed, executor and avaliador blocked", async () => {
    const dir = await tmpdir()
    await ingestSource(dir, {
      id: "doc-test",
      title: "Test doc",
      kind: "text",
      content: "Important test source",
    })

    const { sources_list, sources_query, canAccessSources } = await import("../../src/sources")

    // Elicitador & Analista allowed
    expect(canAccessSources("elicitador")).toBe(true)
    expect(canAccessSources("analista")).toBe(true)

    const elicitadorList = await sources_list(dir, "elicitador")
    expect(elicitadorList.length).toBe(1)

    const analistaQuery = await sources_query(dir, "analista", "Important")
    expect(analistaQuery.length).toBe(1)

    // Executor & Avaliador strictly blocked
    expect(canAccessSources("workflow-executor")).toBe(false)
    expect(canAccessSources("avaliador")).toBe(false)

    await expect(sources_list(dir, "workflow-executor")).rejects.toThrow("forbidden")
    await expect(sources_query(dir, "avaliador", "Important")).rejects.toThrow("forbidden")
  })
})

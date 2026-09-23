import { describe, expect, test, beforeEach } from "bun:test"
import path from "path"
import fs from "fs/promises"
import { ingestAndNormalizeSource } from "../../src/sources/ingest"
import { querySourcesByIntent } from "../../src/sources/sources-query"

describe("sources/sources-query intent-aligned query filter", () => {
  const testDir = path.join(__dirname, "../fixtures/intent-sources-" + Date.now())

  beforeEach(async () => {
    await fs.mkdir(testDir, { recursive: true })
  })

  test("Validates that querySourcesByIntent filters out off-topic chunks and returns Markdown matching the user objective", async () => {
    // 1. Ingest an on-topic source: SQLite migrations and schema design
    await ingestAndNormalizeSource(testDir, {
      source_id: "src-sql-doc",
      title: "SQLite Migration Best Practices",
      source_type: "html",
      raw_content: `
        <html>
          <body>
            <h1>SQLite Migration Protocols</h1>
            <p>Database schemas require atomic migrations using BEGIN IMMEDIATE transactions to prevent locking collisions.</p>
            <h2>Indexing and WAL</h2>
            <p>Always enable PRAGMA journal_mode = WAL for concurrent reader and writer isolation.</p>
          </body>
        </html>
      `,
    })

    // 2. Ingest an off-topic source: React CSS flexbox centering recipes
    await ingestAndNormalizeSource(testDir, {
      source_id: "src-css-doc",
      title: "CSS Flexbox Centering",
      source_type: "snippet",
      language: "css",
      summary: "Recipes for centering divs with flexbox",
      raw_content: `
        .container {
          display: flex;
          align-items: center;
          justify-content: center;
          height: 100vh;
        }
      `,
    })

    // User objective specifically targets database migrations
    const results = querySourcesByIntent(
      testDir,
      "Implement atomic database schema migrations in SQLite with WAL mode"
    )

    expect(results.length).toBeGreaterThan(0)
    // First result must be the SQLite document, not the CSS one
    expect(results[0].source_id).toBe("src-sql-doc")
    expect(results[0].content.toLowerCase()).toContain("sqlite")

    // The CSS document should be suppressed because it has no overlap with the user objective
    const hasCssDoc = results.some(r => r.source_id === "src-css-doc")
    expect(hasCssDoc).toBe(false)
  })
})

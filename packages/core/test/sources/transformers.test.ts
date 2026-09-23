import { describe, expect, test } from "bun:test"
import { transformHtmlToMarkdown } from "../../src/sources/transformers/html-transformer"
import { transformPdfTextToMarkdown } from "../../src/sources/transformers/pdf-transformer"
import { transformTranscriptToMarkdown } from "../../src/sources/transformers/transcript-transformer"
import { transformSnippetToMarkdown } from "../../src/sources/transformers/code-transformer"
import { buildNormalizedMarkdown } from "../../src/sources/ingest"

describe("sources/transformers deterministic normalizers", () => {
  test("Validates HTML cleaning (ensures zero <script>/<style> tags; asserts clean Markdown output)", () => {
    const rawHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Architecture Guide</title>
          <style>body { font-size: 14px; } .cookie { display: none; }</style>
          <script>console.log("tracking pixel");</script>
        </head>
        <body>
          <header><p>Site Header</p></header>
          <nav><a href="/home">Home</a></nav>
          <h1>Core Architecture Overview</h1>
          <p>This is the <strong>primary</strong> specification for our system.</p>
          <h2>Data Flow</h2>
          <table>
            <tr><th>Component</th><th>Role</th></tr>
            <tr><td>Dispatcher</td><td>DAG Coordinator</td></tr>
          </table>
          <pre><code class="language-typescript">const ready = true;</code></pre>
          <footer><p>Copyright 2026</p></footer>
        </body>
      </html>
    `

    const result = transformHtmlToMarkdown(rawHtml)

    expect(result.title).toBe("Architecture Guide")
    expect(result.markdown).not.toContain("<script>")
    expect(result.markdown).not.toContain("<style>")
    expect(result.markdown).not.toContain("<header>")
    expect(result.markdown).not.toContain("<footer>")
    expect(result.markdown).not.toContain("<nav>")

    // Checks clean markdown headings and elements
    expect(result.markdown).toContain("# Core Architecture Overview")
    expect(result.markdown).toContain("**primary** specification")
    expect(result.markdown).toContain("## Data Flow")
    expect(result.markdown).toContain("| Component | Role |")
    expect(result.markdown).toContain("```typescript")
    expect(result.markdown).toContain("const ready = true;")
  })

  test("Validates PDF line unwrapping and page number artifact stripping", () => {
    const rawPdf = `
      XOCP Distributed Orchestration
      Page 1 of 12
      The cluster dispatcher processes independent tasks simultan-
      eously without cross-talk between ephemeral worker contexts.
      2 / 12
      Confidential
      Dependent tasks are strictly unblocked once prerequisites
      pass verification.
    `

    const result = transformPdfTextToMarkdown(rawPdf, "PDF Title")

    expect(result.title).toBe("XOCP Distributed Orchestration")
    expect(result.markdown).not.toContain("Page 1 of 12")
    expect(result.markdown).not.toContain("2 / 12")
    expect(result.markdown).not.toContain("Confidential")

    // Checks that hyphenated line wrap was joined
    expect(result.markdown).toContain("simultaneously without cross-talk")
    expect(result.markdown).toContain("Dependent tasks are strictly unblocked once prerequisites pass verification.")
  })

  test("Validates transcript timestamp segmentation", () => {
    const metadata = {
      title: "Cluster Deep Dive",
      channel: "Core Eng",
      videoUrlOrId: "https://youtu.be/xocp123",
    }
    const segments = [
      { timestamp: "00:15", text: "Welcome to the session.", speaker: "Alice" },
      { timestamp: "00:45", text: "Today we discuss the Avaliador gate.", speaker: "Alice" },
      { timestamp: "01:20", text: "The gate enforces Lens 1 and Lens 2.", speaker: "Bob" },
    ]

    const result = transformTranscriptToMarkdown(metadata, segments)

    expect(result.title).toBe("Cluster Deep Dive")
    expect(result.markdown).toContain("# Cluster Deep Dive")
    expect(result.markdown).toContain("## [00:15] Discussion")
    expect(result.markdown).toContain("**Alice:** Welcome to the session.")
    expect(result.markdown).toContain("**Bob:** The gate enforces Lens 1 and Lens 2.")
  })

  test("Validates snippet code fencing and YAML frontmatter generation", () => {
    const snippetRes = transformSnippetToMarkdown({
      title: "SQLite Token Store",
      code: "export function getToken(): string { return 'token'; }",
      language: "typescript",
      description: "Helper for token retrieval",
    })

    expect(snippetRes.markdown).toContain("# SQLite Token Store")
    expect(snippetRes.markdown).toContain("Helper for token retrieval")
    expect(snippetRes.markdown).toContain("```typescript")
    expect(snippetRes.markdown).toContain("export function getToken()")

    // Test frontmatter builder
    const metadata = {
      source_id: "src-snippet-01",
      title: "SQLite Token Store",
      source_type: "snippet" as const,
      original_uri: "local://snippet",
      ingested_at: "2026-09-13T12:00:00.000Z",
      summary: "Helper for token retrieval",
      key_entities: ["TokenStore", "SQLite"],
    }

    const frontmatterDoc = buildNormalizedMarkdown(metadata, snippetRes.markdown)

    expect(frontmatterDoc).toContain('source_id: "src-snippet-01"')
    expect(frontmatterDoc).toContain('source_type: "snippet"')
    expect(frontmatterDoc).toContain('key_entities: ["TokenStore", "SQLite"]')
    expect(frontmatterDoc).toContain("---")
    expect(frontmatterDoc).toContain("# SQLite Token Store")
  })
})

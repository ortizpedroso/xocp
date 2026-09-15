import { describe, expect, test } from "bun:test"
import { parseBinaryPdfToMarkdown } from "../../src/sources/transformers/pdf-binary"

describe("sources/transformers/pdf-binary Native PDF Parser", () => {
  test("Decodes a synthetic text PDF buffer using unpdf and normalizes to clean Markdown", async () => {
    // Minimal valid PDF binary structure containing text object
    const minimalPdfText = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>
endobj
4 0 obj
<< /Length 77 >>
stream
BT
/F1 12 Tf
72 712 Td
(System Architecture Specification) Tj
0 -20 Td
(This is paragraph one.) Tj
ET
endstream
endobj
5 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000244 00000 n 
0000000372 00000 n 
trailer
<< /Size 6 /Root 1 0 R >>
startxref
449
%%EOF`

    const buffer = Buffer.from(minimalPdfText, "utf-8")
    const result = await parseBinaryPdfToMarkdown(buffer, "Architecture Document")

    expect(result).toBeDefined()
    expect(result.title).toBe("System Architecture Specification")
    expect(result.markdown).toContain("paragraph one")
    expect(result.totalPages).toBeGreaterThanOrEqual(1)
  })

  test("Gracefully handles empty or non-selectable PDF buffers without throwing unhandled exceptions", async () => {
    // PDF with empty page contents
    const emptyPdfText = `%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >> endobj
xref
0 4
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
trailer << /Size 4 /Root 1 0 R >>
startxref
190
%%EOF`

    const emptyBuffer = Buffer.from(emptyPdfText, "utf-8")
    const result = await parseBinaryPdfToMarkdown(emptyBuffer, "Scanned Document")

    expect(result.title).toBe("Scanned Document")
    expect(result.markdown).toContain("Scanned Document")
    expect(result.markdown).toContain("No selectable text")
  })
})

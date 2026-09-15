import { extractText } from "unpdf"
import { transformPdfTextToMarkdown } from "./pdf-transformer"

export interface BinaryPdfExtractResult {
  title: string
  markdown: string
  rawText: string
  totalPages: number
}

/**
 * Binary PDF Native Parser
 * - Accepts raw ArrayBuffer, Uint8Array, or Buffer
 * - Decodes text across all pages via unpdf
 * - Normalizes output using pdf-transformer.ts
 * - Gracefully handles scanned/empty documents with a fallback message
 */
export async function parseBinaryPdfToMarkdown(
  data: ArrayBuffer | Uint8Array | Buffer,
  fallbackTitle: string = "PDF Document"
): Promise<BinaryPdfExtractResult> {
  try {
    let uint8: Uint8Array
    if (Buffer.isBuffer(data)) {
      uint8 = new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
    } else if (data instanceof Uint8Array) {
      uint8 = new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
    } else {
      uint8 = new Uint8Array(data)
    }

    const { text, totalPages } = await extractText(uint8, { mergePages: true })

    const rawText = Array.isArray(text) ? text.join("\n\n") : (text || "")

    if (!rawText || !rawText.trim()) {
      return {
        title: fallbackTitle,
        markdown: `# ${fallbackTitle}\n\n*[Notice: No selectable text could be extracted from this PDF document. It may contain scanned image pages.]*`,
        rawText: "",
        totalPages: totalPages || 0,
      }
    }

    const { title, markdown } = transformPdfTextToMarkdown(rawText, fallbackTitle)

    return {
      title,
      markdown,
      rawText,
      totalPages: totalPages || 1,
    }
  } catch (error: any) {
    // Non-fatal fallback for corrupt or password-protected PDFs
    return {
      title: fallbackTitle,
      markdown: `# ${fallbackTitle}\n\n*[Notice: PDF parsing failed: ${error?.message || String(error)}]*`,
      rawText: "",
      totalPages: 0,
    }
  }
}

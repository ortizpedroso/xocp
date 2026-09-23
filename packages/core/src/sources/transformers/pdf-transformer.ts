/**
 * PDF Document Normalizer
 * - Strips running headers, footers, page numbering artifacts (e.g. Page 1 of 12, -- 1 --)
 * - Unifies broken line wraps into coherent paragraphs
 * - Extracts structured tables and text into clean Markdown
 */
export function transformPdfTextToMarkdown(
  rawPdfText: string,
  titleFallback: string = "PDF Document"
): { title: string; markdown: string } {
  const lines = rawPdfText.split(/\r?\n/)

  const filteredLines: string[] = []
  let detectedTitle = titleFallback
  let titleFound = false

  // Regex patterns for page numbers, running headers/footers
  const pageNumberPattern = /^(?:page\s+\d+(\s+of\s+\d+)?|\d+\s*\/\s*\d+|[-—–]\s*\d+\s*[-—–]|\d+)$/i
  const headerFooterArtifactPattern = /^(?:confidential|draft|internal use only|all rights reserved|copyright\s+©.*)$/i

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim()

    // Skip empty lines in raw filter, handle paragraph spacing later
    if (!trimmed) {
      filteredLines.push("")
      continue
    }

    // Skip page numbers and headers/footers
    if (pageNumberPattern.test(trimmed) || headerFooterArtifactPattern.test(trimmed)) {
      continue
    }

    // Detect first prominent heading as title if not set
    if (!titleFound && trimmed.length > 3 && trimmed.length < 80 && !trimmed.endsWith(".")) {
      detectedTitle = trimmed
      titleFound = true
      continue
    }

    filteredLines.push(trimmed)
  }

  // Unify broken line wraps:
  // If line does NOT end with sentence terminator (. ! ? : or heading #) and next line begins with lowercase or normal word, join them.
  const paragraphs: string[] = []
  let currentPara = ""

  for (let i = 0; i < filteredLines.length; i++) {
    const line = filteredLines[i]

    if (!line) {
      if (currentPara) {
        paragraphs.push(currentPara.trim())
        currentPara = ""
      }
      continue
    }

    // Check if line looks like a Markdown table row or list item or heading
    if (line.startsWith("|") || line.startsWith("#") || line.startsWith("- ") || line.startsWith("* ") || /^\d+\.\s/.test(line)) {
      if (currentPara) {
        paragraphs.push(currentPara.trim())
        currentPara = ""
      }
      paragraphs.push(line)
      continue
    }

    if (!currentPara) {
      currentPara = line
    } else {
      // Check if previous line ended with hyphen (word split across lines: e.g. "concur-")
      if (currentPara.endsWith("-")) {
        currentPara = currentPara.slice(0, -1) + line
      } else {
        currentPara += " " + line
      }
    }
  }

  if (currentPara) {
    paragraphs.push(currentPara.trim())
  }

  const markdown = paragraphs.join("\n\n").trim()

  return {
    title: detectedTitle,
    markdown,
  }
}

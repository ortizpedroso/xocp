/**
 * HTML & Web Article Normalizer
 * - Strips <script>, <style>, <nav>, <footer>, header boilerplate, cookies, SVG paths, ads
 * - Converts semantic article content into clean GitHub Flavored Markdown (GFM) headings (#, ##), lists, code blocks, tables
 */
export function transformHtmlToMarkdown(htmlContent: string): { title: string; markdown: string } {
  let clean = htmlContent

  // Extract <title> if present
  const titleMatch = clean.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  const rawTitle = titleMatch ? titleMatch[1].replace(/[\r\n\t]+/g, " ").trim() : "Untitled Web Source"

  // 1. Strip scripts, styles, svg, forms, nav, footer, header, ads, iframes
  clean = clean.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
  clean = clean.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
  clean = clean.replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, "")
  clean = clean.replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, "")
  clean = clean.replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, "")
  clean = clean.replace(/<header\b[^<]*(?:(?!<\/header>)<[^<]*)*<\/header>/gi, "")
  clean = clean.replace(/<form\b[^<]*(?:(?!<\/form>)<[^<]*)*<\/form>/gi, "")
  clean = clean.replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, "")
  clean = clean.replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, "")

  // Remove common cookie/ad classes or attributes
  clean = clean.replace(/<div[^>]*(?:cookie|advertisement|banner|ad-box)[^>]*>[\s\S]*?<\/div>/gi, "")

  // 2. Headings (h1 -> #, h2 -> ##, etc.)
  clean = clean.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, (_, text) => `\n\n# ${stripTags(text).trim()}\n\n`)
  clean = clean.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, (_, text) => `\n\n## ${stripTags(text).trim()}\n\n`)
  clean = clean.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, (_, text) => `\n\n### ${stripTags(text).trim()}\n\n`)
  clean = clean.replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, (_, text) => `\n\n#### ${stripTags(text).trim()}\n\n`)
  clean = clean.replace(/<h5[^>]*>([\s\S]*?)<\/h5>/gi, (_, text) => `\n\n##### ${stripTags(text).trim()}\n\n`)
  clean = clean.replace(/<h6[^>]*>([\s\S]*?)<\/h6>/gi, (_, text) => `\n\n###### ${stripTags(text).trim()}\n\n`)

  // 3. Pre & Code blocks
  clean = clean.replace(/<pre[^>]*><code(?:[^>]*class="[^"]*language-([^"\s]+)[^"]*")?[^>]*>([\s\S]*?)<\/code><\/pre>/gi, (_, lang, code) => {
    const l = lang || ""
    return `\n\n\`\`\`${l}\n${decodeHtmlEntities(stripTags(code)).trim()}\n\`\`\`\n\n`
  })
  clean = clean.replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, (_, code) => {
    return `\n\n\`\`\`\n${decodeHtmlEntities(stripTags(code)).trim()}\n\`\`\`\n\n`
  })
  clean = clean.replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, (_, code) => `\`${decodeHtmlEntities(stripTags(code))}\``)

  // 4. Tables
  clean = clean.replace(/<table[^>]*>([\s\S]*?)<\/table>/gi, (_, tableContent) => {
    return "\n\n" + convertHtmlTableToMarkdown(tableContent).trim() + "\n\n"
  })

  // 5. Lists
  clean = clean.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_, item) => `\n- ${stripTags(item).trim()}`)
  clean = clean.replace(/<\/?(?:ul|ol)[^>]*>/gi, "\n")

  // 6. Blockquotes
  clean = clean.replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, (_, text) => `\n> ${stripTags(text).trim()}\n`)

  // 7. Inline formatting (strong, b, em, i, a) - process before stripping paragraphs
  // Note: match <strong> and standalone <b> tags without accidentally matching <body>
  clean = clean.replace(/<strong[^>]*>([\s\S]*?)<\/strong>/gi, (_, text) => `**${stripTags(text).trim()}**`)
  clean = clean.replace(/<b(?:\s+[^>]*)?>([\s\S]*?)<\/b>/gi, (_, text) => `**${stripTags(text).trim()}**`)
  clean = clean.replace(/<em[^>]*>([\s\S]*?)<\/em>/gi, (_, text) => `*${stripTags(text).trim()}*`)
  clean = clean.replace(/<i(?:\s+[^>]*)?>([\s\S]*?)<\/i>/gi, (_, text) => `*${stripTags(text).trim()}*`)
  clean = clean.replace(/<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (_, href, text) => `[${stripTags(text).trim()}](${href})`)

  // 8. Paragraphs and line breaks
  clean = clean.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, (_, text) => `\n\n${text.trim()}\n\n`)
  clean = clean.replace(/<br\s*\/?>/gi, "\n")

  // 9. Strip remaining HTML tags and decode entities
  clean = stripTags(clean)
  clean = decodeHtmlEntities(clean)

  // Normalize excessive newlines and whitespace
  const lines = clean
    .split("\n")
    .map(line => line.trimEnd())
  const normalized = lines
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()

  return {
    title: rawTitle,
    markdown: normalized,
  }
}

function stripTags(str: string): string {
  return str.replace(/<[^>]+>/g, "")
}

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
}

function convertHtmlTableToMarkdown(tableHtml: string): string {
  const rows: string[][] = []
  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi
  let rowMatch: RegExpExecArray | null

  while ((rowMatch = rowRegex.exec(tableHtml)) !== null) {
    const cells: string[] = []
    const cellRegex = /<(?:th|td)[^>]*>([\s\S]*?)<\/(?:th|td)>/gi
    let cellMatch: RegExpExecArray | null
    while ((cellMatch = cellRegex.exec(rowMatch[1])) !== null) {
      cells.push(stripTags(cellMatch[1]).replace(/[\r\n\t]+/g, " ").trim())
    }
    if (cells.length > 0) {
      rows.push(cells)
    }
  }

  if (rows.length === 0) return ""

  const colCount = Math.max(...rows.map(r => r.length))
  const paddedRows = rows.map(r => {
    while (r.length < colCount) r.push("")
    return r
  })

  const header = paddedRows[0]
  const separator = new Array(colCount).fill("---")
  const dataRows = paddedRows.slice(1)

  const mdLines = [
    `| ${header.join(" | ")} |`,
    `| ${separator.join(" | ")} |`,
    ...dataRows.map(r => `| ${r.join(" | ")} |`),
  ]

  return mdLines.join("\n")
}

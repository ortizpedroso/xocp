export type SupportedLanguage =
  | "tsx"
  | "ts"
  | "html"
  | "css"
  | "py"
  | "php"
  | "json"
  | "yaml"
  | "sql"
  | "bash"
  | "markdown"
  | "text"

/**
 * Code & Text Snippet Normalizer
 * Formats pasted raw code into fenced Markdown codeblocks with declared language tags
 */
export function transformSnippetToMarkdown(options: {
  title: string
  code: string
  language?: SupportedLanguage | string
  description?: string
}): { title: string; markdown: string } {
  const { title, code, language = "ts", description } = options

  const langTag = language.toLowerCase()
  const contentParts: string[] = []

  contentParts.push(`# ${title}`)

  if (description && description.trim()) {
    contentParts.push(description.trim())
  }

  contentParts.push(`\`\`\`${langTag}\n${code.trim()}\n\`\`\``)

  return {
    title,
    markdown: contentParts.join("\n\n").trim(),
  }
}

import { Option, Schema } from "effect"
import { ConfigMarkdown } from "../config/markdown"
import { FrontmatterParseError } from "./error"

export const Status = Schema.Literals(["rascunho", "aguardando_aprovacao", "aprovada", "em_revisao"])

export type Status = Schema.Schema.Type<typeof Status>

function decodeStatus(value: unknown) {
  return Schema.decodeUnknownOption(Status)(value)
}

export function readSpecStatus(content: string, filePath: string) {
  let parsed: ReturnType<typeof ConfigMarkdown.parse>
  try {
    parsed = ConfigMarkdown.parse(content)
  } catch (error) {
    throw new FrontmatterParseError({
      path: filePath,
      message: error instanceof Error ? error.message : String(error),
    })
  }

  if (!parsed.data || typeof parsed.data !== "object" || Object.keys(parsed.data).length === 0) {
    throw new FrontmatterParseError({
      path: filePath,
      message: "Spec file is missing YAML frontmatter",
    })
  }

  const status = decodeStatus(parsed.data.status)
  if (Option.isNone(status)) {
    throw new FrontmatterParseError({
      path: filePath,
      message: `Invalid or missing status in frontmatter: ${String(parsed.data.status)}`,
    })
  }

  return status.value
}

export function readBriefStatus(content: string, filePath: string) {
  const match = content.match(/^status:\s*(\S+)/m)
  if (!match) {
    throw new FrontmatterParseError({
      path: filePath,
      message: "Brief YAML is missing status field",
    })
  }

  const status = decodeStatus(match[1])
  if (Option.isNone(status)) {
    throw new FrontmatterParseError({
      path: filePath,
      message: `Invalid status value: ${match[1]}`,
    })
  }

  return status.value
}

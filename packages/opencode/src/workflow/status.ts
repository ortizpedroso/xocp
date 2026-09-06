import matter from "gray-matter"
import { Option, Schema } from "effect"

export const Status = Schema.Literals([
  "rascunho",
  "aguardando_aprovacao",
  "aprovada",
  "em_revisao",
])

export type Status = Schema.Schema.Type<typeof Status>

export function decodeStatus(value: unknown) {
  return Schema.decodeUnknownOption(Status)(value)
}

export function readSpecStatus(content: string) {
  const parsed = matter(content)
  return Option.getOrUndefined(decodeStatus(parsed.data.status))
}

export function writeSpecStatus(content: string, status: Status) {
  const parsed = matter(content)
  return matter.stringify(parsed.content, { ...parsed.data, status })
}

export function readBriefStatus(content: string) {
  const match = content.match(/^status:\s*(\S+)/m)
  if (!match) return undefined
  return Option.getOrUndefined(decodeStatus(match[1]))
}

export function writeBriefStatus(content: string, status: Status) {
  if (/^status:\s*.+$/m.test(content)) {
    return content.replace(/^status:\s*.+$/m, `status: ${status}`)
  }

  if (/^brief_id:/m.test(content)) {
    return content.replace(/^(brief_id:.*\n)/m, `$1status: ${status}\n`)
  }

  return `status: ${status}\n${content}`
}

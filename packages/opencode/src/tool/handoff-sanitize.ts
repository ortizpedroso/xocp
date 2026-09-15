const MAX_DURABLE_HANDOFF_CHARS = 2000

export function sanitizeHandoffSummary(raw: string): string {
  let s = raw.replace(/\*[^*]+\*/g, "").trim()
  s = s.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "")
  s = s.replace(/\b(actually|genuinely|honestly)\b/gi, "")
  s = s.replace(/\n{3,}/g, "\n\n").trim()
  if (s.length > MAX_DURABLE_HANDOFF_CHARS) s = s.slice(0, MAX_DURABLE_HANDOFF_CHARS - 3) + "..."
  return s
}

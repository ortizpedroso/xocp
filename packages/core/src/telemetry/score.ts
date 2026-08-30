import type { SessionTelemetryEvent } from "./event"

export const NEUTRAL_SCORE = 0
export const SCORE_CAP = 100
export const SUGGEST_MAP_THRESHOLD = 40

export function sessionScore(events: ReadonlyArray<SessionTelemetryEvent.Stored>): number {
  if (events.length === 0) return NEUTRAL_SCORE

  const turns = events.filter((event) => event.type === "session.turn").length
  const tools = new Set(
    events
      .filter((event) => event.type === "session.tool_used")
      .map((event) => event.payload.tool)
      .filter((tool): tool is string => typeof tool === "string"),
  ).size

  const started = events.find((event) => event.type === "session.started")
  const last = events.at(-1)
  const durationMs =
    started && last && last.recorded_at >= started.recorded_at
      ? last.recorded_at - started.recorded_at
      : 0
  const durationMin = Math.max(0, Math.floor(durationMs / 60_000))

  return Math.min(SCORE_CAP, turns * 5 + tools * 8 + durationMin * 2)
}

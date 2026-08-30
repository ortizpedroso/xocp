import { describe, expect, test } from "bun:test"
import { sessionScore, NEUTRAL_SCORE, SCORE_CAP } from "@opencode-ai/core/telemetry/score"
import type { SessionTelemetryEvent } from "@opencode-ai/core/telemetry/event"

const at = (ms: number) => ms

describe("sessionScore", () => {
  test("empty session returns neutral score", () => {
    expect(sessionScore([])).toBe(NEUTRAL_SCORE)
  })

  test("few events produce a modest score", () => {
    const events: SessionTelemetryEvent.Stored[] = [
      { type: "session.started", recorded_at: at(0), payload: {} },
      { type: "session.turn", recorded_at: at(1000), payload: { turn: 1 } },
      { type: "session.tool_used", recorded_at: at(2000), payload: { tool: "read" } },
    ]
    expect(sessionScore(events)).toBe(13)
  })

  test("many turns and distinct tools increase score", () => {
    const events: SessionTelemetryEvent.Stored[] = [
      { type: "session.started", recorded_at: at(0), payload: {} },
      { type: "session.turn", recorded_at: at(60_000), payload: { turn: 1 } },
      { type: "session.turn", recorded_at: at(120_000), payload: { turn: 2 } },
      { type: "session.turn", recorded_at: at(180_000), payload: { turn: 3 } },
      { type: "session.tool_used", recorded_at: at(190_000), payload: { tool: "read" } },
      { type: "session.tool_used", recorded_at: at(200_000), payload: { tool: "bash" } },
      { type: "session.tool_used", recorded_at: at(210_000), payload: { tool: "grep" } },
      { type: "session.ended", recorded_at: at(300_000), payload: { reason: "idle" } },
    ]
    expect(sessionScore(events)).toBe(49)
  })

  test("score is capped at 100", () => {
    const events: SessionTelemetryEvent.Stored[] = [
      { type: "session.started", recorded_at: at(0), payload: {} },
      ...Array.from({ length: 20 }, (_, index) => ({
        type: "session.turn" as const,
        recorded_at: at((index + 1) * 60_000),
        payload: { turn: index + 1 },
      })),
      ...["read", "bash", "grep", "edit", "write", "task"].map((tool, index) => ({
        type: "session.tool_used" as const,
        recorded_at: at(1_300_000 + index * 1000),
        payload: { tool },
      })),
    ]
    expect(sessionScore(events)).toBe(SCORE_CAP)
  })
})

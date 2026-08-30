export * as SessionTelemetryEvent from "./event"

import { Schema } from "effect"
import { SessionSchema } from "../session/schema"

export const Type = Schema.Literals([
  "session.started",
  "session.turn",
  "session.tool_used",
  "session.ended",
])
export type Type = typeof Type.Type

export class Started extends Schema.Class<Started>("SessionTelemetry.Started")({
  _tag: Schema.Literal("session.started"),
  agent: Schema.optional(Schema.String),
  model: Schema.optional(Schema.String),
}) {}

export class Turn extends Schema.Class<Turn>("SessionTelemetry.Turn")({
  _tag: Schema.Literal("session.turn"),
  turn: Schema.Number,
  duration_ms: Schema.optional(Schema.Number),
}) {}

export class ToolUsed extends Schema.Class<ToolUsed>("SessionTelemetry.ToolUsed")({
  _tag: Schema.Literal("session.tool_used"),
  tool: Schema.String,
  turn: Schema.optional(Schema.Number),
}) {}

export class Ended extends Schema.Class<Ended>("SessionTelemetry.Ended")({
  _tag: Schema.Literal("session.ended"),
  reason: Schema.Literal("idle"),
}) {}

export const Event = Schema.Union([Started, Turn, ToolUsed, Ended])
export type Event = typeof Event.Type

export type RecordInput = {
  sessionID: SessionSchema.ID
  event: Event
}

export type Stored = {
  type: Type
  recorded_at: number
  payload: Record<string, unknown>
}

export function toStored(recorded_at: number, event: Event): Stored {
  const { _tag, ...payload } = event
  return { type: _tag, recorded_at, payload }
}

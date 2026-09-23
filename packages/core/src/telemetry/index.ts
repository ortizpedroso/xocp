import { asc, eq } from "drizzle-orm"
import { Context, Effect, Layer, Option } from "effect"
import { Config } from "../config"
import { Database } from "../database/database"
import { Identifier } from "../id/id"
import { makeLocationNode } from "../effect/app-node"
import { SessionTelemetryEvent } from "./event"
import { NEUTRAL_SCORE, sessionScore } from "./score"
import { SessionTelemetryEventTable } from "./sql"
import type { SessionSchema } from "../session/schema"

export { NEUTRAL_SCORE, sessionScore, SUGGEST_MAP_THRESHOLD } from "./score"
export { SessionTelemetryEvent } from "./event"

export interface Interface {
  readonly record: (input: SessionTelemetryEvent.RecordInput) => Effect.Effect<void>
  readonly score: (sessionID: SessionSchema.ID) => Effect.Effect<number>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/SessionTelemetry") {}

const make = Effect.gen(function* () {
  const db = (yield* Database.Service).db
  const config = yield* Config.Service

  const graphifyEnabled = Effect.fn("SessionTelemetry.graphifyEnabled")(function* () {
    const entries = yield* config.entries()
    for (const entry of entries) {
      if (entry.type !== "document") continue
      if (entry.info.experimental?.graphify === true) return true
    }
    return false
  })

  const record = Effect.fn("SessionTelemetry.record")(function* (input: SessionTelemetryEvent.RecordInput) {
    if (!(yield* graphifyEnabled())) return
    const recorded_at = Date.now()
    const stored = SessionTelemetryEvent.toStored(recorded_at, input.event)
    yield* db
      .insert(SessionTelemetryEventTable)
      .values({
        id: Identifier.ascending("event"),
        session_id: input.sessionID,
        type: stored.type,
        recorded_at: stored.recorded_at,
        payload: stored.payload,
      })
      .run()
      .pipe(Effect.catch(() => Effect.void))
  })

  const score = Effect.fn("SessionTelemetry.score")(function* (sessionID: SessionSchema.ID) {
    if (!(yield* graphifyEnabled())) return NEUTRAL_SCORE
    const rows = yield* db
      .select({
        type: SessionTelemetryEventTable.type,
        recorded_at: SessionTelemetryEventTable.recorded_at,
        payload: SessionTelemetryEventTable.payload,
      })
      .from(SessionTelemetryEventTable)
      .where(eq(SessionTelemetryEventTable.session_id, sessionID))
      .orderBy(asc(SessionTelemetryEventTable.recorded_at), asc(SessionTelemetryEventTable.id))
      .all()
      .pipe(Effect.catch(() => Effect.succeed([])))
    return sessionScore(
      rows.map((row) => ({
        type: row.type as SessionTelemetryEvent.Type,
        recorded_at: row.recorded_at,
        payload: row.payload,
      })),
    )
  })

  return Service.of({ record, score })
})

const layer = Layer.effect(Service, make)

export const node = makeLocationNode({
  service: Service,
  layer,
  deps: [Database.node, Config.node],
})

/** Observational hook: never fails the caller or blocks session flow. */
export const observe = (input: SessionTelemetryEvent.RecordInput) =>
  Effect.gen(function* () {
    const telemetry = yield* Effect.serviceOption(Service)
    if (Option.isNone(telemetry)) return
    yield* telemetry.value.record(input)
  }).pipe(Effect.catch(() => Effect.void))

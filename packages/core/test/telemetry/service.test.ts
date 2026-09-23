import { describe, expect } from "bun:test"
import { asc, eq } from "drizzle-orm"
import { Effect, Layer } from "effect"
import { Config } from "@opencode-ai/core/config"
import { Database } from "@opencode-ai/core/database/database"
import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { ProjectV2 } from "@opencode-ai/core/project"
import { ProjectTable } from "@opencode-ai/core/project/sql"
import { AbsolutePath } from "@opencode-ai/core/schema"
import { SessionV2 } from "@opencode-ai/core/session"
import { SessionTable } from "@opencode-ai/core/session/sql"
import { SessionTelemetry } from "@opencode-ai/core/telemetry"
import { SessionTelemetryEventTable } from "@opencode-ai/core/telemetry/sql"
import { testEffect } from "../lib/effect"

const sessionID = SessionV2.ID.create()

const graphifyOff = Layer.succeed(
  Config.Service,
  Config.Service.of({
    entries: () => Effect.succeed([]),
  }),
)

const graphifyOn = Layer.succeed(
  Config.Service,
  Config.Service.of({
    entries: () =>
      Effect.succeed([
        {
          type: "document" as const,
          path: "/project/.opencode/opencode.json",
          info: { experimental: { graphify: true } },
        },
      ]),
  }),
)

const offLayer = AppNodeBuilder.build(LayerNode.group([Database.node, SessionTelemetry.node]), [
  [Config.node, graphifyOff],
])

const onLayer = AppNodeBuilder.build(LayerNode.group([Database.node, SessionTelemetry.node]), [
  [Config.node, graphifyOn],
])

const itOff = testEffect(offLayer)
const itOn = testEffect(onLayer)

const insertSession = Effect.gen(function* () {
  const { db } = yield* Database.Service
  yield* db
    .insert(ProjectTable)
    .values({ id: ProjectV2.ID.global, worktree: AbsolutePath.make("/project"), sandboxes: [] })
    .onConflictDoNothing()
    .run()
    .pipe(Effect.orDie)
  yield* db
    .insert(SessionTable)
    .values({
      id: sessionID,
      project_id: ProjectV2.ID.global,
      slug: sessionID,
      directory: "/project",
      title: "telemetry test",
      version: "test",
    })
    .onConflictDoNothing()
    .run()
    .pipe(Effect.orDie)
})

describe("SessionTelemetry service", () => {
  itOff.effect("record and score when graphify is disabled", () =>
    Effect.gen(function* () {
      yield* insertSession
      const telemetry = yield* SessionTelemetry.Service
      yield* telemetry.record({
        sessionID,
        event: { _tag: "session.started" },
      })
      expect(yield* telemetry.score(sessionID)).toBe(SessionTelemetry.NEUTRAL_SCORE)

      const db = yield* Database.Service
      const rows = yield* db.db.select().from(SessionTelemetryEventTable).all().pipe(Effect.orDie)
      expect(rows).toHaveLength(0)
    }),
  )

  itOn.effect("record and score when graphify is enabled", () =>
    Effect.gen(function* () {
      yield* insertSession
      const telemetry = yield* SessionTelemetry.Service
      yield* telemetry.record({ sessionID, event: { _tag: "session.started" } })
      yield* telemetry.record({ sessionID, event: { _tag: "session.turn", turn: 1 } })
      yield* telemetry.record({ sessionID, event: { _tag: "session.tool_used", tool: "read", turn: 1 } })
      yield* telemetry.record({ sessionID, event: { _tag: "session.ended", reason: "idle" } })

      expect(yield* telemetry.score(sessionID)).toBe(13)

      const db = yield* Database.Service
      const rows = yield* db.db
        .select()
        .from(SessionTelemetryEventTable)
        .where(eq(SessionTelemetryEventTable.session_id, sessionID))
        .orderBy(asc(SessionTelemetryEventTable.recorded_at), asc(SessionTelemetryEventTable.id))
        .all()
        .pipe(Effect.orDie)
      expect(rows).toHaveLength(4)
      expect(rows.map((row) => row.type)).toEqual([
        "session.started",
        "session.turn",
        "session.tool_used",
        "session.ended",
      ])
    }),
  )
})

describe("SessionTelemetry.observe", () => {
  itOn.effect("observe swallows service errors", () =>
    Effect.gen(function* () {
      yield* SessionTelemetry.observe({ sessionID, event: { _tag: "session.started" } })
    }),
  )
})

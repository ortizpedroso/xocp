import { describe, expect } from "bun:test"
import { eq } from "drizzle-orm"
import { Effect, Layer } from "effect"
import { Database } from "@opencode-ai/core/database/database"
import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { Handoff } from "@opencode-ai/core/handoff"
import { SessionHandoffTable } from "@opencode-ai/core/handoff/sql"
import { ProjectV2 } from "@opencode-ai/core/project"
import { ProjectTable } from "@opencode-ai/core/project/sql"
import { AbsolutePath } from "@opencode-ai/core/schema"
import { SessionV2 } from "@opencode-ai/core/session"
import { SessionTable } from "@opencode-ai/core/session/sql"
import { testEffect } from "../lib/effect"

const sessionA = SessionV2.ID.create()
const sessionB = SessionV2.ID.create()

const layer = AppNodeBuilder.build(LayerNode.group([Database.node, Handoff.node]), [])
const it = testEffect(layer)

const insertSession = (sessionID: typeof sessionA) =>
  Effect.gen(function* () {
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
        title: "handoff test",
        version: "test",
      })
      .onConflictDoNothing()
      .run()
      .pipe(Effect.orDie)
  })

describe("Handoff service", () => {
  it.effect("write with content <= 2000 chars succeeds and latest returns content", () =>
    Effect.gen(function* () {
      yield* insertSession(sessionA)
      const handoff = yield* Handoff.Service
      const content = "a".repeat(2000)
      yield* handoff.write({ sessionID: sessionA, content })
      expect(yield* handoff.latest(sessionA)).toEqual({
        content,
        createdAt: expect.any(Number),
      })
    }),
  )

  it.effect("write with content > 2000 chars fails with TooLong and writes nothing", () =>
    Effect.gen(function* () {
      yield* insertSession(sessionA)
      const handoff = yield* Handoff.Service
      const content = "a".repeat(2001)
      const error = yield* handoff.write({ sessionID: sessionA, content }).pipe(Effect.flip)
      expect(error._tag).toBe("Handoff.TooLong")
      if (error._tag === "Handoff.TooLong") {
        expect(error.length).toBe(2001)
        expect(error.max).toBe(2000)
      }

      const db = yield* Database.Service
      const rows = yield* db.db
        .select()
        .from(SessionHandoffTable)
        .where(eq(SessionHandoffTable.session_id, sessionA))
        .all()
        .pipe(Effect.orDie)
      expect(rows).toHaveLength(0)
    }),
  )

  it.effect("latest for session with no handoff returns undefined", () =>
    Effect.gen(function* () {
      yield* insertSession(sessionA)
      const handoff = yield* Handoff.Service
      expect(yield* handoff.latest(sessionA)).toBeUndefined()
    }),
  )

  it.effect("two writes in same session returns the most recent", () =>
    Effect.gen(function* () {
      yield* insertSession(sessionA)
      const handoff = yield* Handoff.Service
      yield* handoff.write({ sessionID: sessionA, content: "first" })
      yield* handoff.write({ sessionID: sessionA, content: "second" })
      expect((yield* handoff.latest(sessionA))?.content).toBe("second")
    }),
  )

  it.effect("handoffs from different sessions do not leak", () =>
    Effect.gen(function* () {
      yield* insertSession(sessionA)
      yield* insertSession(sessionB)
      const handoff = yield* Handoff.Service
      yield* handoff.write({ sessionID: sessionA, content: "session-a" })
      yield* handoff.write({ sessionID: sessionB, content: "session-b" })
      expect((yield* handoff.latest(sessionA))?.content).toBe("session-a")
      expect((yield* handoff.latest(sessionB))?.content).toBe("session-b")
    }),
  )

  it.effect("deleting session cascades handoff rows", () =>
    Effect.gen(function* () {
      yield* insertSession(sessionA)
      const handoff = yield* Handoff.Service
      yield* handoff.write({ sessionID: sessionA, content: "cascade test" })

      const db = yield* Database.Service
      yield* db.db.delete(SessionTable).where(eq(SessionTable.id, sessionA)).run().pipe(Effect.orDie)

      const rows = yield* db.db
        .select()
        .from(SessionHandoffTable)
        .where(eq(SessionHandoffTable.session_id, sessionA))
        .all()
        .pipe(Effect.orDie)
      expect(rows).toHaveLength(0)
      expect(yield* handoff.latest(sessionA)).toBeUndefined()
    }),
  )
})

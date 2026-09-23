import { and, desc, eq } from "drizzle-orm"
import { Context, Effect, Layer } from "effect"
import { Database } from "../database/database"
import { makeLocationNode } from "../effect/app-node"
import { Identifier } from "../id/id"
import type { SessionSchema } from "../session/schema"
import type { AbsolutePath } from "../schema"
import { TooLong } from "./error"
import { SessionHandoffTable } from "./sql"

export { TooLong } from "./error"
export { HANDOFF_NOTICE } from "./notice"

const MAX_CONTENT_LENGTH = 2000

export interface Interface {
  readonly write: (input: {
    sessionID: SessionSchema.ID
    directory: AbsolutePath
    content: string
  }) => Effect.Effect<void, TooLong>
  readonly latest: (
    sessionID: SessionSchema.ID,
  ) => Effect.Effect<{ content: string; createdAt: number } | undefined>
  readonly latestForDirectory: (
    directory: AbsolutePath,
  ) => Effect.Effect<{ content: string; createdAt: number; sessionID: SessionSchema.ID } | undefined>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/Handoff") {}

const make = Effect.gen(function* () {
  const db = (yield* Database.Service).db

  const write = Effect.fn("Handoff.write")(function* (input: {
    sessionID: SessionSchema.ID
    directory: AbsolutePath
    content: string
  }) {
    if (input.content.length > MAX_CONTENT_LENGTH) {
      return yield* new TooLong({ length: input.content.length, max: MAX_CONTENT_LENGTH })
    }
    yield* db
      .insert(SessionHandoffTable)
      .values({
        id: Identifier.ascending("handoff"),
        session_id: input.sessionID,
        directory: input.directory,
        content: input.content,
        created_at: Date.now(),
      })
      .run()
      .pipe(Effect.orDie)
  })

  const latest = Effect.fn("Handoff.latest")(function* (sessionID: SessionSchema.ID) {
    const row = yield* db
      .select({
        content: SessionHandoffTable.content,
        created_at: SessionHandoffTable.created_at,
      })
      .from(SessionHandoffTable)
      .where(eq(SessionHandoffTable.session_id, sessionID))
      .orderBy(desc(SessionHandoffTable.created_at), desc(SessionHandoffTable.id))
      .limit(1)
      .get()
      .pipe(Effect.orDie)
    if (!row) return undefined
    return { content: row.content, createdAt: row.created_at }
  })

  const latestForDirectory = Effect.fn("Handoff.latestForDirectory")(function* (directory: AbsolutePath) {
    const row = yield* db
      .select({
        session_id: SessionHandoffTable.session_id,
        content: SessionHandoffTable.content,
        created_at: SessionHandoffTable.created_at,
      })
      .from(SessionHandoffTable)
      .where(eq(SessionHandoffTable.directory, directory))
      .orderBy(desc(SessionHandoffTable.created_at), desc(SessionHandoffTable.id))
      .limit(1)
      .get()
      .pipe(Effect.orDie)
    if (!row) return undefined
    return { sessionID: row.session_id, content: row.content, createdAt: row.created_at }
  })

  return Service.of({ write, latest, latestForDirectory })
})

const layer = Layer.effect(Service, make)

export const node = makeLocationNode({
  service: Service,
  layer,
  deps: [Database.node],
})

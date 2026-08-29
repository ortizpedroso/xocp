import { desc, eq } from "drizzle-orm"
import { Context, Effect, Layer } from "effect"
import { Database } from "../database/database"
import { makeLocationNode } from "../effect/app-node"
import { Identifier } from "../id/id"
import type { SessionSchema } from "../session/schema"
import { TooLong } from "./error"
import { SessionHandoffTable } from "./sql"

export { TooLong } from "./error"

const MAX_CONTENT_LENGTH = 2000

export interface Interface {
  readonly write: (input: { sessionID: SessionSchema.ID; content: string }) => Effect.Effect<void, TooLong>
  readonly latest: (
    sessionID: SessionSchema.ID,
  ) => Effect.Effect<{ content: string; createdAt: number } | undefined>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/Handoff") {}

const make = Effect.gen(function* () {
  const db = (yield* Database.Service).db

  const write = Effect.fn("Handoff.write")(function* (input: { sessionID: SessionSchema.ID; content: string }) {
    if (input.content.length > MAX_CONTENT_LENGTH) {
      return yield* new TooLong({ length: input.content.length, max: MAX_CONTENT_LENGTH })
    }
    yield* db
      .insert(SessionHandoffTable)
      .values({
        id: Identifier.ascending("handoff"),
        session_id: input.sessionID,
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

  return Service.of({ write, latest })
})

const layer = Layer.effect(Service, make)

export const node = makeLocationNode({
  service: Service,
  layer,
  deps: [Database.node],
})

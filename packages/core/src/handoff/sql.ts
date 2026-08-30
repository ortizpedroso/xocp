import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core"
import { SessionTable } from "../session/sql"
import type { SessionSchema } from "../session/schema"
import { AbsolutePath } from "../schema"

export const SessionHandoffTable = sqliteTable(
  "session_handoff",
  {
    id: text().primaryKey(),
    session_id: text()
      .$type<SessionSchema.ID>()
      .notNull()
      .references(() => SessionTable.id, { onDelete: "cascade" }),
    directory: text().$type<AbsolutePath>().notNull(),
    content: text().notNull(),
    created_at: integer().notNull(),
  },
  (table) => [
    index("session_handoff_session_idx").on(table.session_id),
    index("session_handoff_directory_idx").on(table.directory),
  ],
)

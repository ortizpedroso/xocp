import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core"
import { SessionTable } from "../session/sql"
import type { SessionSchema } from "../session/schema"

export const SessionTelemetryEventTable = sqliteTable(
  "session_telemetry_event",
  {
    id: text().primaryKey(),
    session_id: text()
      .$type<SessionSchema.ID>()
      .notNull()
      .references(() => SessionTable.id, { onDelete: "cascade" }),
    type: text().notNull(),
    recorded_at: integer().notNull(),
    payload: text({ mode: "json" }).$type<Record<string, unknown>>().notNull(),
  },
  (table) => [
    index("session_telemetry_event_session_idx").on(table.session_id),
    index("session_telemetry_event_session_type_idx").on(table.session_id, table.type),
  ],
)

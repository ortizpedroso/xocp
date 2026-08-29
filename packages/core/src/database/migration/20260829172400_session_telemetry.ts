import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

export default {
  id: "20260829172400_session_telemetry",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`
        CREATE TABLE \`session_telemetry_event\` (
          \`id\` text PRIMARY KEY,
          \`session_id\` text NOT NULL,
          \`type\` text NOT NULL,
          \`recorded_at\` integer NOT NULL,
          \`payload\` text NOT NULL,
          CONSTRAINT \`fk_session_telemetry_event_session_id_session_id_fk\` FOREIGN KEY (\`session_id\`) REFERENCES \`session\`(\`id\`) ON DELETE CASCADE
        );
      `)
      yield* tx.run(
        `CREATE INDEX \`session_telemetry_event_session_idx\` ON \`session_telemetry_event\` (\`session_id\`);`,
      )
      yield* tx.run(
        `CREATE INDEX \`session_telemetry_event_session_type_idx\` ON \`session_telemetry_event\` (\`session_id\`,\`type\`);`,
      )
    })
  },
} satisfies DatabaseMigration.Migration

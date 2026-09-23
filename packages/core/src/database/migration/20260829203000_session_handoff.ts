import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

export default {
  id: "20260829203000_session_handoff",
  up(tx) {
    return Effect.gen(function* () {
      if (
        (yield* tx.all<{ name: string }>(
          `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'session_handoff'`,
        )).length > 0
      ) {
        yield* tx.run(
          `CREATE INDEX IF NOT EXISTS \`session_handoff_session_idx\` ON \`session_handoff\` (\`session_id\`);`,
        )
        return
      }
      yield* tx.run(`
        CREATE TABLE \`session_handoff\` (
          \`id\` text PRIMARY KEY,
          \`session_id\` text NOT NULL,
          \`content\` text NOT NULL,
          \`created_at\` integer NOT NULL,
          CONSTRAINT \`fk_session_handoff_session_id_session_id_fk\` FOREIGN KEY (\`session_id\`) REFERENCES \`session\`(\`id\`) ON DELETE CASCADE
        );
      `)
      yield* tx.run(`CREATE INDEX \`session_handoff_session_idx\` ON \`session_handoff\` (\`session_id\`);`)
    })
  },
} satisfies DatabaseMigration.Migration

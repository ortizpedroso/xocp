import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

export default {
  id: "20260830203140_session_handoff_directory",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`ALTER TABLE \`session_handoff\` ADD \`directory\` text;`)
      yield* tx.run(
        `UPDATE \`session_handoff\` SET \`directory\` = (SELECT \`directory\` FROM \`session\` WHERE \`session\`.\`id\` = \`session_handoff\`.\`session_id\`);`,
      )
      yield* tx.run(`PRAGMA foreign_keys=OFF;`)
      yield* tx.run(`
        CREATE TABLE \`__new_session_handoff\` (
          \`id\` text PRIMARY KEY,
          \`session_id\` text NOT NULL,
          \`directory\` text NOT NULL,
          \`content\` text NOT NULL,
          \`created_at\` integer NOT NULL,
          CONSTRAINT \`fk_session_handoff_session_id_session_id_fk\` FOREIGN KEY (\`session_id\`) REFERENCES \`session\`(\`id\`) ON DELETE CASCADE
        );
      `)
      yield* tx.run(
        `INSERT INTO \`__new_session_handoff\`(\`id\`, \`session_id\`, \`directory\`, \`content\`, \`created_at\`) SELECT \`id\`, \`session_id\`, \`directory\`, \`content\`, \`created_at\` FROM \`session_handoff\` WHERE \`directory\` IS NOT NULL;`,
      )
      yield* tx.run(`DROP TABLE \`session_handoff\`;`)
      yield* tx.run(`ALTER TABLE \`__new_session_handoff\` RENAME TO \`session_handoff\`;`)
      yield* tx.run(`CREATE INDEX \`session_handoff_session_idx\` ON \`session_handoff\` (\`session_id\`);`)
      yield* tx.run(`CREATE INDEX \`session_handoff_directory_idx\` ON \`session_handoff\` (\`directory\`);`)
      yield* tx.run(`PRAGMA foreign_keys=ON;`)
    })
  },
} satisfies DatabaseMigration.Migration

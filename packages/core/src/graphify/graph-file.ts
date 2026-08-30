import path from "path"
import { Effect, Schema } from "effect"
import type { AbsolutePath } from "../schema"
import { GraphReadFailed } from "./error"

const GraphNode = Schema.Struct({
  source_file: Schema.optional(Schema.String),
  community: Schema.optional(Schema.Number),
  community_name: Schema.optional(Schema.String),
})

const GraphFile = Schema.Struct({
  nodes: Schema.Array(GraphNode),
})

export type CommunityEntry = {
  community: number
  communityName: string
  file: string
}

export const readCommunities = (directory: AbsolutePath) =>
  Effect.gen(function* () {
    const graphPath = path.join(directory, "graphify-out", "graph.json")
    const exists = yield* Effect.tryPromise({
      try: () => Bun.file(graphPath).exists(),
      catch: () => new GraphReadFailed({ path: graphPath }),
    })
    if (!exists) return yield* new GraphReadFailed({ path: graphPath })
    const content = yield* Effect.tryPromise({
      try: () => Bun.file(graphPath).text(),
      catch: () => new GraphReadFailed({ path: graphPath }),
    })
    const json = yield* Effect.try({
      try: () => JSON.parse(content) as unknown,
      catch: () => new GraphReadFailed({ path: graphPath }),
    })
    const parsed = yield* Schema.decodeUnknownEffect(GraphFile)(json).pipe(
      Effect.mapError(() => new GraphReadFailed({ path: graphPath })),
    )
    const byFile = new Map<string, CommunityEntry>()
    for (const node of parsed.nodes) {
      if (typeof node.source_file !== "string" || !node.source_file) continue
      if (typeof node.community !== "number") continue
      if (typeof node.community_name !== "string" || !node.community_name) continue
      if (byFile.has(node.source_file)) continue
      byFile.set(node.source_file, {
        community: node.community,
        communityName: node.community_name,
        file: node.source_file,
      })
    }
    return Array.from(byFile.values())
  })

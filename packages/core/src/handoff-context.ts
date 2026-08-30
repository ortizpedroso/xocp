export * as HandoffContext from "./handoff-context"

import { Effect, Layer, Schema } from "effect"
import { Handoff } from "./handoff"
import { HANDOFF_NOTICE } from "./handoff/notice"
import { Location } from "./location"
import { makeLocationNode } from "./effect/app-node"
import { SystemContext } from "./system-context/index"
import { SystemContextRegistry } from "./system-context/registry"

const key = SystemContext.Key.make("core/handoff")

const layer = Layer.effectDiscard(
  Effect.gen(function* () {
    const location = yield* Location.Service
    const handoff = yield* Handoff.Service
    const registry = yield* SystemContextRegistry.Service

    const notice = SystemContext.make({
      key,
      codec: Schema.toCodecJson(Schema.String),
      load: Effect.succeed(HANDOFF_NOTICE),
      baseline: (value) => value,
      update: (_previous, value) => value,
    })

    yield* registry.register({
      key,
      load: handoff.latestForDirectory(location.directory).pipe(
        Effect.map((row) => (row ? notice : SystemContext.empty)),
      ),
    })
  }),
)

export const node = makeLocationNode({
  name: "handoff-context",
  layer,
  deps: [Location.node, Handoff.node, SystemContextRegistry.node],
})

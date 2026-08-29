export * as GraphifyConfig from "./config"

import { Effect, Schema } from "effect"
import type { GraphifySidecar } from "../config/experimental"
import { PositiveInt } from "../schema"
import { NotConfigured } from "./error"

export const DEFAULT_TIMEOUT_MS = 30_000

export class Resolved extends Schema.Class<Resolved>("Graphify.ResolvedConfig")({
  url: Schema.String,
  timeout_ms: PositiveInt,
}) {}

export function resolve(sidecar: GraphifySidecar | undefined) {
  if (!sidecar) return Effect.fail(new NotConfigured({}))
  if (sidecar.enabled !== true) return Effect.fail(new NotConfigured({}))
  const url = sidecar.url?.trim()
  if (!url) return Effect.fail(new NotConfigured({}))
  return Effect.succeed(
    Resolved.make({
      url: url.replace(/\/$/, ""),
      timeout_ms: sidecar.timeout_ms ?? DEFAULT_TIMEOUT_MS,
    }),
  )
}

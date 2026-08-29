import { Effect, Schema } from "effect"
import type { GraphifyConfig } from "./config"
import { InvalidResponse, NotConfigured, RemoteError, Unreachable } from "./error"

export { InvalidResponse, NotConfigured, RemoteError, Unreachable } from "./error"
export type { Error } from "./error"

export class HealthStatus extends Schema.Class<HealthStatus>("Graphify.HealthStatus")({
  status: Schema.Literal("ok"),
}) {}

export class MapInput extends Schema.Class<MapInput>("Graphify.MapInput")({
  directory: Schema.String,
}) {}

export class MapResult extends Schema.Class<MapResult>("Graphify.MapResult")({
  status: Schema.Literals(["accepted", "completed"]),
  directory: Schema.String,
  map_path: Schema.optional(Schema.String),
}) {}

const decodeHealth = Schema.decodeUnknownEffect(HealthStatus)
const decodeMapResult = Schema.decodeUnknownEffect(MapResult)

const HEALTH_PATH = "/health"
const MAP_PATH = "/map"

const fetchWithTimeout = (config: GraphifyConfig.Resolved, path: string, init?: RequestInit) =>
  Effect.tryPromise({
    try: () =>
      fetch(`${config.url}${path}`, {
        ...init,
        signal: AbortSignal.timeout(config.timeout_ms),
      }),
    catch: (cause) =>
      new Unreachable({
        cause: cause instanceof Error ? cause.message : String(cause),
      }),
  })

const readBody = (response: Response) =>
  Effect.tryPromise({
    try: () => response.text(),
    catch: (cause) =>
      new Unreachable({
        cause: cause instanceof Error ? cause.message : String(cause),
      }),
  })

const decodeJson = (body: string) =>
  Effect.try({
    try: () => JSON.parse(body) as unknown,
    catch: () =>
      new InvalidResponse({
        message: "Response body is not valid JSON",
        body,
      }),
  })

export const health = Effect.fn("GraphifyClient.health")(function* (config: GraphifyConfig.Resolved) {
  const response = yield* fetchWithTimeout(config, HEALTH_PATH, { method: "GET" })
  const body = yield* readBody(response)
  if (!response.ok) return yield* new RemoteError({ status: response.status, body })
  const json = yield* decodeJson(body)
  return yield* decodeHealth(json).pipe(
    Effect.mapError(
      () =>
        new InvalidResponse({
          message: "Health response does not match the expected schema",
          body,
        }),
    ),
  )
})

export const requestMap = Effect.fn("GraphifyClient.requestMap")(function* (
  config: GraphifyConfig.Resolved,
  input: MapInput,
) {
  const response = yield* fetchWithTimeout(config, MAP_PATH, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ directory: input.directory }),
  })
  const body = yield* readBody(response)
  if (!response.ok) return yield* new RemoteError({ status: response.status, body })
  const json = yield* decodeJson(body)
  return yield* decodeMapResult(json).pipe(
    Effect.mapError(
      () =>
        new InvalidResponse({
          message: "Map response does not match the expected schema",
          body,
        }),
    ),
  )
})

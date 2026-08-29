import { describe, expect } from "bun:test"
import { Effect } from "effect"
import { health, MapInput, requestMap } from "@opencode-ai/core/graphify/client"
import { GraphifyConfig } from "@opencode-ai/core/graphify/config"
import { NotConfigured } from "@opencode-ai/core/graphify/error"
import { AbsolutePath } from "@opencode-ai/core/schema"
import { it } from "../lib/effect"
import { fakeSidecar } from "./fixture"

const directory = AbsolutePath.make("/project")

describe("GraphifyClient", () => {
  it.effect("health returns ok for a healthy sidecar", () =>
    Effect.gen(function* () {
      const sidecar = fakeSidecar({})
      try {
        const config = GraphifyConfig.Resolved.make({ url: sidecar.url, timeout_ms: 2000 })
        const status = yield* health(config)
        expect(status).toEqual({ status: "ok" })
        expect(sidecar.requests()).toBe(1)
      } finally {
        sidecar.stop()
      }
    }),
  )

  it.effect("requestMap posts the project directory", () =>
    Effect.gen(function* () {
      const sidecar = fakeSidecar({
        map: (body) =>
          Response.json({
            status: "completed",
            directory: body.directory,
            map_path: "/tmp/map.json",
          }),
      })
      try {
        const config = GraphifyConfig.Resolved.make({ url: sidecar.url, timeout_ms: 2000 })
        const result = yield* requestMap(config, MapInput.make({ directory }))
        expect(result).toEqual({
          status: "completed",
          directory,
          map_path: "/tmp/map.json",
        })
        expect(sidecar.requests()).toBe(1)
      } finally {
        sidecar.stop()
      }
    }),
  )

  it.effect("remote 500 becomes RemoteError", () =>
    Effect.gen(function* () {
      const sidecar = fakeSidecar({
        health: () => new Response("boom", { status: 500 }),
      })
      try {
        const config = GraphifyConfig.Resolved.make({ url: sidecar.url, timeout_ms: 2000 })
        const error = yield* health(config).pipe(Effect.flip)
        expect(error._tag).toBe("Graphify.RemoteError")
        if (error._tag === "Graphify.RemoteError") {
          expect(error.status).toBe(500)
          expect(error.body).toBe("boom")
        }
      } finally {
        sidecar.stop()
      }
    }),
  )

  it.effect("invalid JSON body becomes InvalidResponse", () =>
    Effect.gen(function* () {
      const sidecar = fakeSidecar({
        health: () => new Response("not-json", { status: 200 }),
      })
      try {
        const config = GraphifyConfig.Resolved.make({ url: sidecar.url, timeout_ms: 2000 })
        const error = yield* health(config).pipe(Effect.flip)
        expect(error._tag).toBe("Graphify.InvalidResponse")
      } finally {
        sidecar.stop()
      }
    }),
  )

  it.effect("schema mismatch becomes InvalidResponse", () =>
    Effect.gen(function* () {
      const sidecar = fakeSidecar({
        health: () => Response.json({ status: "degraded" }),
      })
      try {
        const config = GraphifyConfig.Resolved.make({ url: sidecar.url, timeout_ms: 2000 })
        const error = yield* health(config).pipe(Effect.flip)
        expect(error._tag).toBe("Graphify.InvalidResponse")
      } finally {
        sidecar.stop()
      }
    }),
  )

  it.effect("closed port becomes Unreachable", () =>
    Effect.gen(function* () {
      const config = GraphifyConfig.Resolved.make({ url: "http://127.0.0.1:1", timeout_ms: 200 })
      const error = yield* health(config).pipe(Effect.flip)
      expect(error._tag).toBe("Graphify.Unreachable")
    }),
  )

  it.effect("resolve fails NotConfigured without network", () =>
    Effect.gen(function* () {
      const sidecar = fakeSidecar({})
      try {
        const error = yield* GraphifyConfig.resolve({ enabled: false, url: sidecar.url }).pipe(Effect.flip)
        expect(error._tag).toBe("Graphify.NotConfigured")
        expect(sidecar.requests()).toBe(0)
      } finally {
        sidecar.stop()
      }
    }),
  )

  it.effect("resolve fails NotConfigured when url is missing", () =>
    Effect.gen(function* () {
      const sidecar = fakeSidecar({})
      try {
        const error = yield* GraphifyConfig.resolve({ enabled: true }).pipe(Effect.flip)
        expect(error._tag).toBe("Graphify.NotConfigured")
        expect(sidecar.requests()).toBe(0)
      } finally {
        sidecar.stop()
      }
    }),
  )
})

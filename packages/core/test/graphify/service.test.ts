import { describe, expect, mock, test } from "bun:test"
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "fs"
import path from "path"
import { Effect, Layer } from "effect"
import { BackgroundJob } from "@opencode-ai/core/background-job"
import { Config } from "@opencode-ai/core/config"
import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { Graphify } from "@opencode-ai/core/graphify"
import { readCommunities } from "@opencode-ai/core/graphify/graph-file"
import { AppProcess } from "@opencode-ai/core/process"
import { AbsolutePath } from "@opencode-ai/core/schema"
import { locationServices } from "@opencode-ai/core/location-services"
import { Location } from "@opencode-ai/core/location"
import { Handoff } from "@opencode-ai/core/handoff"
import { testEffect } from "../lib/effect"

let uvPresent = true

mock.module("../../src/util/which", () => ({
  which: () => (uvPresent ? "/home/ubuntu/.local/bin/uv" : null),
}))

const graphifyOn = Layer.succeed(
  Config.Service,
  Config.Service.of({
    entries: () =>
      Effect.succeed([
        {
          type: "document" as const,
          path: "/project/.opencode/opencode.json",
          info: { experimental: { graphify: true } },
        },
      ]),
  }),
)

const graphifyOverriddenOff = Layer.succeed(
  Config.Service,
  Config.Service.of({
    entries: () =>
      Effect.succeed([
        {
          type: "document" as const,
          path: "/global/.opencode/opencode.json",
          info: { experimental: { graphify: true } },
        },
        {
          type: "document" as const,
          path: "/project/.opencode/opencode.json",
          info: { experimental: { graphify: false } },
        },
      ]),
  }),
)

const graphifyOff = Layer.succeed(
  Config.Service,
  Config.Service.of({
    entries: () => Effect.succeed([]),
  }),
)

const fakeProc = (exitCode: number, stderr = "") =>
  Layer.succeed(
    AppProcess.Service,
    AppProcess.Service.of({
      run: () =>
        Effect.succeed({
          command: "uv tool run graphify update",
          exitCode,
          stdout: Buffer.from(exitCode === 0 ? "ok" : ""),
          stderr: Buffer.from(stderr),
          stdoutTruncated: false,
          stderrTruncated: false,
        }),
    } as unknown as AppProcess.Interface),
  )

const layerFor = (proc: Layer.Layer<AppProcess.Service>) =>
  AppNodeBuilder.build(LayerNode.group([BackgroundJob.node, Graphify.node]), [
    [Config.node, graphifyOn],
    [AppProcess.node, proc],
  ])

const offLayer = AppNodeBuilder.build(LayerNode.group([BackgroundJob.node, Graphify.node]), [
  [Config.node, graphifyOff],
  [AppProcess.node, fakeProc(0)],
])

const overriddenOffLayer = AppNodeBuilder.build(LayerNode.group([BackgroundJob.node, Graphify.node]), [
  [Config.node, graphifyOverriddenOff],
  [AppProcess.node, fakeProc(0)],
])

const directory = AbsolutePath.make("/project")

describe("Graphify service", () => {
  const itOn = testEffect(layerFor(fakeProc(0)))
  const itOff = testEffect(offLayer)
  const itOverriddenOff = testEffect(overriddenOffLayer)

  itOverriddenOff.effect("available is false when higher-priority config disables graphify", () =>
    Effect.gen(function* () {
      uvPresent = true
      const graphify = yield* Graphify.Service
      expect(yield* graphify.available()).toBe(false)
    }),
  )

  itOverriddenOff.effect("startMap fails GraphifyDisabled when higher-priority config disables graphify", () =>
    Effect.gen(function* () {
      uvPresent = true
      const jobs = yield* BackgroundJob.Service
      const graphify = yield* Graphify.Service
      expect(yield* jobs.list()).toHaveLength(0)
      const error = yield* graphify.startMap({ directory }).pipe(Effect.flip)
      expect(error._tag).toBe("Graphify.GraphifyDisabled")
      expect(yield* jobs.list()).toHaveLength(0)
    }),
  )

  itOff.effect("available is false when graphify flag is off", () =>
    Effect.gen(function* () {
      uvPresent = true
      const graphify = yield* Graphify.Service
      expect(yield* graphify.available()).toBe(false)
    }),
  )

  itOn.effect("available is false when uv is missing", () =>
    Effect.gen(function* () {
      uvPresent = false
      const graphify = yield* Graphify.Service
      expect(yield* graphify.available()).toBe(false)
      uvPresent = true
    }),
  )

  itOn.effect("available is true when flag on and uv present", () =>
    Effect.gen(function* () {
      uvPresent = true
      const graphify = yield* Graphify.Service
      expect(yield* graphify.available()).toBe(true)
    }),
  )

  itOff.effect("startMap fails GraphifyDisabled without creating a job", () =>
    Effect.gen(function* () {
      uvPresent = true
      const jobs = yield* BackgroundJob.Service
      const graphify = yield* Graphify.Service
      expect(yield* jobs.list()).toHaveLength(0)
      const error = yield* graphify.startMap({ directory }).pipe(Effect.flip)
      expect(error._tag).toBe("Graphify.GraphifyDisabled")
      expect(yield* jobs.list()).toHaveLength(0)
    }),
  )

  itOn.effect("startMap fails UvNotFound without creating a job", () =>
    Effect.gen(function* () {
      uvPresent = false
      const jobs = yield* BackgroundJob.Service
      const graphify = yield* Graphify.Service
      const error = yield* graphify.startMap({ directory }).pipe(Effect.flip)
      expect(error._tag).toBe("Graphify.UvNotFound")
      expect(yield* jobs.list()).toHaveLength(0)
      uvPresent = true
    }),
  )

  itOn.effect("startMap completes when the process succeeds", () =>
    Effect.gen(function* () {
      uvPresent = true
      const jobs = yield* BackgroundJob.Service
      const graphify = yield* Graphify.Service
      const started = yield* graphify.startMap({ directory })
      expect(started.status).toBe("running")
      const waited = yield* jobs.wait({ id: started.id })
      expect(waited.info?.status).toBe("completed")
      expect(waited.info?.output).toBe("ok")
    }),
  )
})

describe("Graphify service process failure", () => {
  const itFail = testEffect(layerFor(fakeProc(1, "boom")))

  itFail.effect("startMap job errors when the process fails", () =>
    Effect.gen(function* () {
      uvPresent = true
      const jobs = yield* BackgroundJob.Service
      const graphify = yield* Graphify.Service
      const started = yield* graphify.startMap({ directory })
      const waited = yield* jobs.wait({ id: started.id })
      expect(waited.info?.status).toBe("error")
    }),
  )
})

describe("readCommunities", () => {
  const fixtureRoot = path.join(import.meta.dir, "fixtures")
  const tmp = path.join("/tmp", "graphify-read-test")

  test("reads communities from a real graph.json fixture", async () => {
    rmSync(tmp, { recursive: true, force: true })
    mkdirSync(path.join(tmp, "graphify-out"), { recursive: true })
    writeFileSync(
      path.join(tmp, "graphify-out", "graph.json"),
      readFileSync(path.join(fixtureRoot, "graph.json")),
    )
    const result = await Effect.runPromise(readCommunities(AbsolutePath.make(tmp)))
    expect(result).toEqual([
      { community: 0, communityName: "a.ts", file: "src/a.ts" },
      { community: 0, communityName: "a.ts", file: "src/b.ts" },
    ])
  })
})

describe("location services", () => {
  const projectDir = path.join("/tmp", "graphify-location-services")
  mkdirSync(projectDir, { recursive: true })

  testEffect(
    AppNodeBuilder.build(locationServices, [
      [Location.node, Location.boundNode({ directory: AbsolutePath.make(projectDir) })],
    ]),
  ).effect("resolves Handoff.Service from location services", () =>
    Effect.gen(function* () {
      const handoff = yield* Handoff.Service
      expect(typeof handoff.write).toBe("function")
      expect(typeof handoff.latest).toBe("function")
    }),
  )
})

describe("graphify integration", () => {
  test("runs uv graphify update when uv is installed", async () => {
    const whichPkg = (await import("which")).default
    const uvPath = whichPkg.sync("uv", { nothrow: true })
    if (!uvPath || typeof uvPath !== "string") return
    const root = path.join("/tmp", "graphify-integration")
    rmSync(root, { recursive: true, force: true })
    mkdirSync(path.join(root, "src"), { recursive: true })
    writeFileSync(path.join(root, "src", "main.ts"), "export const x = 1\n")
    const proc = await Effect.runPromise(AppProcess.Service.pipe(Effect.provide(LayerNode.compile(AppProcess.node))))
    const result = await Effect.runPromise(
      proc
        .run(
          (await import("effect/unstable/process")).ChildProcess.make(
            uvPath,
            ["tool", "run", "--from", "graphifyy==0.9.52", "graphify", "update", root],
            { cwd: root, extendEnv: true },
          ),
          { timeout: (await import("effect")).Duration.minutes(10) },
        )
        .pipe(Effect.flatMap(AppProcess.requireSuccess), Effect.provide(LayerNode.compile(AppProcess.node))),
    )
    expect(result.exitCode).toBe(0)
    const communities = await Effect.runPromise(readCommunities(AbsolutePath.make(root)))
    expect(communities.length).toBeGreaterThan(0)
    expect(communities[0]?.community).toBeTypeOf("number")
  })
})

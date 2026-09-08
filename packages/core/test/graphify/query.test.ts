import { describe, expect, mock, test } from "bun:test"
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "fs"
import path from "path"
import { Effect, Layer } from "effect"
import { BackgroundJob } from "@opencode-ai/core/background-job"
import { Config } from "@opencode-ai/core/config"
import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { Graphify } from "@opencode-ai/core/graphify"
import { QUERY_MESSAGES, mapWaitOutcome } from "@opencode-ai/core/graphify/query"
import { AppProcess, type RunResult } from "@opencode-ai/core/process"
import type { ChildProcess } from "effect/unstable/process"
import { AbsolutePath } from "@opencode-ai/core/schema"
import { testEffect } from "../lib/effect"

let uvPresent = true
const commandLog: string[] = []

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

const graphifyOff = Layer.succeed(
  Config.Service,
  Config.Service.of({
    entries: () => Effect.succeed([]),
  }),
)

const fixtureGraph = path.join(import.meta.dir, "fixtures", "graph.json")
const directory = AbsolutePath.make(path.join("/tmp", "graphify-query-test"))
const graphDir = path.join(directory, "graphify-out")

const ensureGraphOutput = () => {
  mkdirSync(graphDir, { recursive: true })
  writeFileSync(path.join(graphDir, "graph.json"), readFileSync(fixtureGraph, "utf8"))
}

const fakeProc = (opts?: { mapDelayMs?: number; queryOutput?: string; queryExitCode?: number }) =>
  Layer.succeed(
    AppProcess.Service,
    AppProcess.Service.of({
      run: (command: ChildProcess.Command) => {
        const label =
          command._tag === "StandardCommand"
            ? command.args.length
              ? `${command.command} ${command.args.join(" ")}`
              : command.command
            : "unknown"
        commandLog.push(label)
        if (label.includes("graphify update")) {
          const run = () => {
            ensureGraphOutput()
            return {
              command: label,
              exitCode: 0,
              stdout: Buffer.from("ok"),
              stderr: Buffer.from(""),
              stdoutTruncated: false,
              stderrTruncated: false,
            }
          }
          if (opts?.mapDelayMs) {
            return Effect.sleep(opts.mapDelayMs).pipe(Effect.map(run))
          }
          return Effect.succeed(run())
        }
        if (label.includes("graphify query")) {
          return Effect.succeed({
            command: label,
            exitCode: opts?.queryExitCode ?? 0,
            stdout: Buffer.from(opts?.queryOutput ?? "NODE a.ts --imports--> NODE b.ts"),
            stderr: Buffer.from(opts?.queryExitCode ? "query boom" : ""),
            stdoutTruncated: false,
            stderrTruncated: false,
          })
        }
        return Effect.succeed({
          command: label,
          exitCode: 1,
          stdout: Buffer.from(""),
          stderr: Buffer.from("unexpected command"),
          stdoutTruncated: false,
          stderrTruncated: false,
        })
      },
    } as unknown as AppProcess.Interface),
  )

const layerFor = (proc: Layer.Layer<AppProcess.Service>) =>
  AppNodeBuilder.build(LayerNode.group([BackgroundJob.node, Graphify.node]), [
    [Config.node, graphifyOn],
    [AppProcess.node, proc],
  ])

const offLayer = AppNodeBuilder.build(LayerNode.group([BackgroundJob.node, Graphify.node]), [
  [Config.node, graphifyOff],
  [AppProcess.node, fakeProc()],
])

describe("Graphify.query", () => {
  const itOn = testEffect(layerFor(fakeProc()))
  const itOff = testEffect(offLayer)

  test("clears command log between cases", () => {
    commandLog.length = 0
  })

  itOff.effect("returns disabled when experimental.graphify is off", () =>
    Effect.gen(function* () {
      uvPresent = true
      const graphify = yield* Graphify.Service
      const result = yield* graphify.query({ directory, question: "who imports auth?" })
      expect(result.status).toBe("disabled")
      expect(result.message).toBe(QUERY_MESSAGES.disabled)
      expect(commandLog).toHaveLength(0)
    }),
  )

  itOn.effect("returns uv_missing when uv is absent", () =>
    Effect.gen(function* () {
      uvPresent = false
      const graphify = yield* Graphify.Service
      const result = yield* graphify.query({ directory, question: "who imports auth?" })
      expect(result.status).toBe("uv_missing")
      expect(result.message).toBe(QUERY_MESSAGES.uv_missing)
      expect(commandLog).toHaveLength(0)
      uvPresent = true
    }),
  )

  itOn.effect("maps first then queries when no graph exists", () =>
    Effect.gen(function* () {
      uvPresent = true
      commandLog.length = 0
      rmSync(graphDir, { recursive: true, force: true })
      const graphify = yield* Graphify.Service
      const result = yield* graphify.query({ directory, question: "imports for auth" })
      expect(result.status).toBe("ok")
      expect(result.output).toContain("NODE a.ts")
      expect(commandLog.some((entry) => entry.includes("graphify update"))).toBe(true)
      expect(commandLog.some((entry) => entry.includes("graphify query") && entry.includes("imports for auth"))).toBe(
        true,
      )
      rmSync(graphDir, { recursive: true, force: true })
    }),
  )

  itOn.effect("queries directly when graph already exists", () =>
    Effect.gen(function* () {
      uvPresent = true
      commandLog.length = 0
      rmSync(graphDir, { recursive: true, force: true })
      mkdirSync(graphDir, { recursive: true })
      writeFileSync(path.join(graphDir, "graph.json"), readFileSync(fixtureGraph, "utf8"))
      const graphify = yield* Graphify.Service
      const result = yield* graphify.query({ directory, question: "imports for auth" })
      expect(result.status).toBe("ok")
      expect(result.output).toContain("NODE a.ts")
      expect(commandLog.some((entry) => entry.includes("graphify update"))).toBe(false)
      expect(commandLog.some((entry) => entry.includes("graphify query") && entry.includes("imports for auth"))).toBe(
        true,
      )
      rmSync(graphDir, { recursive: true, force: true })
    }),
  )

  test("mapWaitOutcome returns map_in_progress when wait times out", () => {
    expect(
      mapWaitOutcome({
        timedOut: true,
        info: { id: "job", type: "graphify.map", status: "running", started_at: Date.now() },
      }),
    ).toEqual({
      status: "map_in_progress",
      message: QUERY_MESSAGES.map_in_progress,
    })
  })
})

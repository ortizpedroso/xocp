import { afterAll, describe, expect, mock } from "bun:test"
import { Effect, Layer } from "effect"
import { ChildProcess } from "effect/unstable/process"
import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { BackgroundJob } from "@opencode-ai/core/background-job"
import { Headroom } from "@opencode-ai/core/headroom"
import { AppProcess } from "@opencode-ai/core/process"
import { testEffect } from "../lib/effect"

let uvPresent = true
let headroomRunning = false
let proxyExitCode = 0

mock.module("../../src/util/which", () => ({
  which: (name: string) => (name === "uv" && uvPresent ? "/usr/bin/uv" : null),
}))

const originalFetch = globalThis.fetch
globalThis.fetch = (async (input: string | URL | Request) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
  if (url.includes("/v1/models") && headroomRunning) {
    return new Response("{}", { status: 200 })
  }
  return new Response("{}", { status: 503 })
}) as typeof fetch

const fakeProc = Layer.succeed(
  AppProcess.Service,
  AppProcess.Service.of({
    run: (command: ChildProcess.Command) => {
      const label =
        command._tag === "StandardCommand"
          ? `${command.command} ${command.args.join(" ")}`
          : String(command)
      if (label.includes(" headroom proxy ")) headroomRunning = true
      return Effect.succeed({
        command: label,
        exitCode: proxyExitCode,
        stdout: Buffer.from(""),
        stderr: Buffer.from(proxyExitCode === 0 ? "" : "proxy failed"),
        stdoutTruncated: false,
        stderrTruncated: false,
      })
    },
  } as unknown as AppProcess.Interface),
)

const layer = AppNodeBuilder.build(LayerNode.group([BackgroundJob.node, Headroom.node]), [
  [AppProcess.node, fakeProc],
])

const reset = () => {
  uvPresent = true
  headroomRunning = false
  proxyExitCode = 0
}

describe("Headroom service", () => {
  const itService = testEffect(layer)

  itService.effect("available is false when uv is missing", () =>
    Effect.gen(function* () {
      reset()
      uvPresent = false
      const headroom = yield* Headroom.Service
      expect(yield* headroom.available()).toBe(false)
    }),
  )

  itService.effect("startActivate fails UvNotFound when uv is missing", () =>
    Effect.gen(function* () {
      reset()
      uvPresent = false
      const headroom = yield* Headroom.Service
      const error = yield* headroom.startActivate().pipe(Effect.flip)
      expect(error._tag).toBe("Headroom.UvNotFound")
    }),
  )

  itService.effect("detectRunning is true when proxy responds", () =>
    Effect.gen(function* () {
      reset()
      headroomRunning = true
      const headroom = yield* Headroom.Service
      expect(yield* headroom.detectRunning()).toBe(true)
    }),
  )

  itService.effect("startActivate skips install when already running", () =>
    Effect.gen(function* () {
      reset()
      headroomRunning = true
      const headroom = yield* Headroom.Service
      const started = yield* headroom.startActivate()
      const jobs = yield* BackgroundJob.Service
      const waited = yield* jobs.wait({ id: started.id })
      expect(waited.info?.status).toBe("completed")
      const output = JSON.parse(waited.info?.output ?? "{}") as { providerID: string }
      expect(output.providerID).toBe("headroom")
    }),
  )

  itService.effect("startActivate starts proxy and registers when not running", () =>
    Effect.gen(function* () {
      reset()
      const headroom = yield* Headroom.Service
      const started = yield* headroom.startActivate()
      const jobs = yield* BackgroundJob.Service
      const waited = yield* jobs.wait({ id: started.id })
      expect(waited.info?.status).toBe("completed")
      const output = JSON.parse(waited.info?.output ?? "{}") as { baseURL: string }
      expect(output.baseURL).toBe("http://127.0.0.1:8787/v1")
    }),
  )

  itService.effect("startActivate reports job error when proxy command fails", () =>
    Effect.gen(function* () {
      reset()
      proxyExitCode = 1
      const headroom = yield* Headroom.Service
      const jobs = yield* BackgroundJob.Service
      const started = yield* headroom.startActivate()
      const waited = yield* jobs.wait({ id: started.id })
      expect(waited.info?.status).toBe("error")
      expect(waited.info?.error).toContain("failed")
    }),
  )
})

afterAll(() => {
  globalThis.fetch = originalFetch
})

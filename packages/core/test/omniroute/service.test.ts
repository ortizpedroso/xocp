import { afterAll, describe, expect, mock } from "bun:test"
import { Effect, Layer } from "effect"
import { ChildProcess } from "effect/unstable/process"
import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { BackgroundJob } from "@opencode-ai/core/background-job"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { OmniRoute } from "@opencode-ai/core/omniroute"
import { AppProcess } from "@opencode-ai/core/process"
import { testEffect } from "../lib/effect"

let npmPresent = true
let omnirouteRunning = false
let setupExitCode = 0
let serveExitCode = 0

mock.module("../../src/util/which", () => ({
  which: (name: string) => {
    if (name === "npm" || name === "npx") return npmPresent ? "/usr/bin/npx" : null
    return null
  },
}))

const originalFetch = globalThis.fetch
globalThis.fetch = (async (input: string | URL | Request) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
  if (url.includes("/v1/models") && omnirouteRunning) {
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
      if (label.includes(" serve ")) omnirouteRunning = true
      const exitCode = label.includes(" setup ") ? setupExitCode : label.includes(" serve ") ? serveExitCode : 0
      return Effect.succeed({
        command: label,
        exitCode,
        stdout: Buffer.from(exitCode === 0 ? "ok" : ""),
        stderr: Buffer.from(exitCode === 0 ? "" : `${label} failed`),
        stdoutTruncated: false,
        stderrTruncated: false,
      })
    },
  } as unknown as AppProcess.Interface),
)

const fakeFs = Layer.succeed(
  FSUtil.Service,
  FSUtil.Service.of({
    readJson: () => Effect.succeed({}),
    writeJson: () => Effect.void,
  } as unknown as FSUtil.Interface),
)

const layer = AppNodeBuilder.build(LayerNode.group([BackgroundJob.node, OmniRoute.node]), [
  [AppProcess.node, fakeProc],
  [FSUtil.node, fakeFs],
])

const reset = () => {
  npmPresent = true
  omnirouteRunning = false
  setupExitCode = 0
  serveExitCode = 0
}

describe("OmniRoute service", () => {
  const itService = testEffect(layer)

  itService.effect("available is false when npm/npx is missing", () =>
    Effect.gen(function* () {
      reset()
      npmPresent = false
      const omniroute = yield* OmniRoute.Service
      expect(yield* omniroute.available()).toBe(false)
    }),
  )

  itService.effect("startActivate fails NpmNotFound when npm is missing", () =>
    Effect.gen(function* () {
      reset()
      npmPresent = false
      const omniroute = yield* OmniRoute.Service
      const error = yield* omniroute.startActivate().pipe(Effect.flip)
      expect(error._tag).toBe("OmniRoute.NpmNotFound")
    }),
  )

  itService.effect("detectRunning is true when gateway responds", () =>
    Effect.gen(function* () {
      reset()
      omnirouteRunning = true
      const omniroute = yield* OmniRoute.Service
      expect(yield* omniroute.detectRunning()).toBe(true)
    }),
  )

  itService.effect("startActivate skips install when already running", () =>
    Effect.gen(function* () {
      reset()
      omnirouteRunning = true
      setupExitCode = 1
      serveExitCode = 1
      const omniroute = yield* OmniRoute.Service
      const started = yield* omniroute.startActivate()
      const jobs = yield* BackgroundJob.Service
      const waited = yield* jobs.wait({ id: started.id })
      expect(waited.info?.status).toBe("completed")
      const output = JSON.parse(waited.info?.output ?? "{}") as { providerID: string }
      expect(output.providerID).toBe("omniroute")
    }),
  )

  itService.effect("startActivate installs and registers when not running", () =>
    Effect.gen(function* () {
      reset()
      const omniroute = yield* OmniRoute.Service
      const started = yield* omniroute.startActivate()
      const jobs = yield* BackgroundJob.Service
      const waited = yield* jobs.wait({ id: started.id })
      expect(waited.info?.status).toBe("completed")
      const output = JSON.parse(waited.info?.output ?? "{}") as { baseURL: string }
      expect(output.baseURL).toBe("http://127.0.0.1:20128/v1")
    }),
  )

  itService.effect("startActivate reports job error when setup fails", () =>
    Effect.gen(function* () {
      reset()
      setupExitCode = 1
      const omniroute = yield* OmniRoute.Service
      const started = yield* omniroute.startActivate()
      const jobs = yield* BackgroundJob.Service
      const waited = yield* jobs.wait({ id: started.id })
      expect(waited.info?.status).toBe("error")
      expect(waited.info?.error).toContain("failed")
    }),
  )
})

afterAll(() => {
  globalThis.fetch = originalFetch
})

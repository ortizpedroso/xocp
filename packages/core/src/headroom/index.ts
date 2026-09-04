import { ChildProcess } from "effect/unstable/process"
import { Context, Duration, Effect, Layer } from "effect"
import { BackgroundJob } from "../background-job"
import { makeGlobalNode } from "../effect/app-node"
import { AppProcess } from "../process"
import { which } from "../util/which"
import { ActivateFailed, UvNotFound } from "./error"
import { HEADROOM_DEFAULT_BASE_URL, HEADROOM_DEFAULT_PORT, HEADROOM_PINNED_VERSION } from "./version"

const DETECT_TIMEOUT_MS = 2_000
const PROXY_WAIT_MS = 120_000

export interface Interface {
  readonly available: () => Effect.Effect<boolean>
  readonly detectRunning: () => Effect.Effect<boolean>
  readonly startActivate: () => Effect.Effect<BackgroundJob.Info, UvNotFound>
  readonly getActivate: (id: string) => Effect.Effect<BackgroundJob.Info | undefined>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/Headroom") {}

const ping = Effect.fn("Headroom.ping")(function* () {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), DETECT_TIMEOUT_MS)
  const ok = yield* Effect.promise(async () => {
    try {
      const response = await fetch(`${HEADROOM_DEFAULT_BASE_URL}/models`, {
        signal: controller.signal,
      })
      return response.ok
    } catch {
      return false
    } finally {
      clearTimeout(timeout)
    }
  })
  return ok
})

const proxyCommand = () =>
  ChildProcess.make(
    "uv",
    [
      "tool",
      "run",
      "--from",
      `headroom-ai[proxy]==${HEADROOM_PINNED_VERSION}`,
      "headroom",
      "proxy",
      "--port",
      String(HEADROOM_DEFAULT_PORT),
      "--host",
      "127.0.0.1",
    ],
    { extendEnv: true },
  )

const make = Effect.gen(function* () {
  const jobs = yield* BackgroundJob.Service
  const proc = yield* AppProcess.Service

  const available = Effect.fn("Headroom.available")(function* () {
    return which("uv") !== null
  })

  const detectRunning = Effect.fn("Headroom.detectRunning")(function* () {
    if (!(yield* available())) return false
    return yield* ping()
  })

  const waitForRunning = Effect.fn("Headroom.waitForRunning")(function* () {
    const deadline = Date.now() + PROXY_WAIT_MS
    while (Date.now() < deadline) {
      if (yield* ping()) return true
      yield* Effect.sleep(Duration.millis(500))
    }
    return false
  })

  const startActivate = Effect.fn("Headroom.startActivate")(function* () {
    if (!(yield* available())) return yield* new UvNotFound({})

    return yield* jobs.start({
      type: "headroom.activate",
      title: "Activate Headroom",
      metadata: { step: "installing" },
      run: Effect.gen(function* () {
        if (!(yield* detectRunning())) {
          const runningProxy = (yield* jobs.list()).find(
            (job) => job.type === "headroom.proxy" && job.status === "running",
          )
          if (!runningProxy) {
            const proxyJob = yield* jobs.start({
              type: "headroom.proxy",
              title: "Headroom proxy",
              run: proc.run(proxyCommand(), { timeout: Duration.infinity }).pipe(
                Effect.flatMap((result) => {
                  if (result.exitCode === 0) {
                    return Effect.succeed(result.stdout.toString("utf8").trim() || "running")
                  }
                  return Effect.fail(
                    new ActivateFailed({
                      step: "starting",
                      message: result.stderr.toString("utf8").trim() || "Headroom proxy failed to start.",
                    }),
                  )
                }),
              ),
            })
            const proxyDeadline = Date.now() + PROXY_WAIT_MS
            while (Date.now() < proxyDeadline) {
              if (yield* ping()) break
              const current = yield* jobs.get(proxyJob.id)
              if (current?.status === "error") {
                return yield* new ActivateFailed({
                  step: "starting",
                  message: current.error ?? "Headroom proxy failed to start.",
                })
              }
              yield* Effect.sleep(Duration.millis(500))
            }
          }
          const ready = yield* waitForRunning()
          if (!ready) {
            return yield* new ActivateFailed({
              step: "starting",
              message: "Headroom proxy did not become reachable on port 8787 in time.",
            })
          }
        }
        return JSON.stringify({
          step: "ready",
          providerID: "headroom",
          baseURL: HEADROOM_DEFAULT_BASE_URL,
          apiKey: "",
        })
      }),
    })
  })

  const getActivate = Effect.fn("Headroom.getActivate")(function* (id: string) {
    return yield* jobs.get(id)
  })

  return Service.of({ available, detectRunning, startActivate, getActivate })
})

export const node = makeGlobalNode({
  service: Service,
  layer: Layer.effect(Service, make),
  deps: [BackgroundJob.node, AppProcess.node],
})

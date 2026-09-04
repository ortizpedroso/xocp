import path from "path"
import { randomBytes } from "crypto"
import { ChildProcess } from "effect/unstable/process"
import { Context, Duration, Effect, Layer } from "effect"
import { BackgroundJob } from "../background-job"
import { FSUtil } from "../fs-util"
import { Global } from "../global"
import { makeGlobalNode } from "../effect/app-node"
import { AppProcess } from "../process"
import { which } from "../util/which"
import { ActivateFailed, NpmNotFound } from "./error"
import {
  OMNIROUTE_DEFAULT_BASE_URL,
  OMNIROUTE_DEFAULT_PORT,
  OMNIROUTE_PINNED_VERSION,
} from "./version"

const DETECT_TIMEOUT_MS = 2_000
const SERVE_WAIT_MS = 60_000
const AUTH_FILE = path.join(Global.Path.data, "auth.json")

export interface Interface {
  readonly available: () => Effect.Effect<boolean>
  readonly detectRunning: () => Effect.Effect<boolean>
  readonly startActivate: () => Effect.Effect<BackgroundJob.Info, NpmNotFound>
  readonly getActivate: (id: string) => Effect.Effect<BackgroundJob.Info | undefined>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/OmniRoute") {}

const generatePassword = () => randomBytes(18).toString("base64url")

const ping = Effect.fn("OmniRoute.ping")(function* () {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), DETECT_TIMEOUT_MS)
  const ok = yield* Effect.promise(async () => {
    try {
      const response = await fetch(`${OMNIROUTE_DEFAULT_BASE_URL}/models`, {
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

const make = Effect.gen(function* () {
  const jobs = yield* BackgroundJob.Service
  const proc = yield* AppProcess.Service
  const fsys = yield* FSUtil.Service

  const available = Effect.fn("OmniRoute.available")(function* () {
    return which("npm") !== null || which("npx") !== null
  })

  const detectRunning = Effect.fn("OmniRoute.detectRunning")(function* () {
    if (!(yield* available())) return false
    return yield* ping()
  })

  const runCommand = (step: string, command: ChildProcess.Command) =>
    proc.run(command, { timeout: Duration.minutes(10) }).pipe(
      Effect.flatMap((result) => {
        if (result.exitCode === 0) return Effect.succeed(result.stdout.toString("utf8").trim())
        return Effect.fail(
          new ActivateFailed({
            step,
            message: result.stderr.toString("utf8").trim() || `${step} failed with exit ${result.exitCode}`,
          }),
        )
      }),
    )

  const waitForRunning = Effect.fn("OmniRoute.waitForRunning")(function* () {
    const deadline = Date.now() + SERVE_WAIT_MS
    while (Date.now() < deadline) {
      if (yield* ping()) return true
      yield* Effect.sleep(Duration.millis(500))
    }
    return false
  })

  const writeManagementCredential = (password: string) =>
    Effect.gen(function* () {
      const existing = (yield* fsys.readJson(AUTH_FILE).pipe(Effect.orElseSucceed(() => ({})))) as Record<
        string,
        unknown
      >
      yield* fsys
        .writeJson(
          AUTH_FILE,
          {
            ...existing,
            "omniroute-management": { type: "api", key: password },
          },
          0o600,
        )
        .pipe(
          Effect.mapError(
            (error) =>
              new ActivateFailed({
                step: "registering",
                message: error instanceof Error ? error.message : String(error),
              }),
          ),
        )
    })

  const startActivate = Effect.fn("OmniRoute.startActivate")(function* () {
    if (!(yield* available())) return yield* new NpmNotFound({})
    const password = generatePassword()
    const setupCommand = ChildProcess.make(
      which("npx") ?? "npx",
      [
        "--yes",
        `omniroute@${OMNIROUTE_PINNED_VERSION}`,
        "setup",
        "--non-interactive",
        "--password",
        password,
      ],
      { extendEnv: true },
    )
    const serveCommand = ChildProcess.make(
      which("npx") ?? "npx",
      [
        "--yes",
        `omniroute@${OMNIROUTE_PINNED_VERSION}`,
        "serve",
        "--port",
        String(OMNIROUTE_DEFAULT_PORT),
        "--daemon",
        "--no-open",
      ],
      { extendEnv: true },
    )

    return yield* jobs.start({
      type: "omniroute.activate",
      title: "Activate OmniRoute",
      metadata: { step: "downloading" },
      run: Effect.gen(function* () {
        const alreadyRunning = yield* detectRunning()
        if (!alreadyRunning) {
          yield* runCommand("configuring", setupCommand)
          yield* runCommand("starting", serveCommand)
          const ready = yield* waitForRunning()
          if (!ready) {
            return yield* new ActivateFailed({
              step: "starting",
              message: "OmniRoute did not become reachable on port 20128 in time.",
            })
          }
          yield* writeManagementCredential(password)
        }
        return JSON.stringify({
          step: "ready",
          providerID: "omniroute",
          baseURL: OMNIROUTE_DEFAULT_BASE_URL,
          apiKey: "",
        })
      }),
    })
  })

  const getActivate = Effect.fn("OmniRoute.getActivate")(function* (id: string) {
    return yield* jobs.get(id)
  })

  return Service.of({ available, detectRunning, startActivate, getActivate })
})

export const node = makeGlobalNode({
  service: Service,
  layer: Layer.effect(Service, make),
  deps: [BackgroundJob.node, AppProcess.node, FSUtil.node],
})

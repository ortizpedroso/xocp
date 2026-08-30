import path from "path"
import { ChildProcess } from "effect/unstable/process"
import { Context, Duration, Effect, Layer } from "effect"
import { BackgroundJob } from "../background-job"
import { Config } from "../config"
import { makeLocationNode } from "../effect/app-node"
import { AppProcess } from "../process"
import type { SessionSchema } from "../session/schema"
import { AbsolutePath } from "../schema"
import { which } from "../util/which"
import { GraphifyDisabled, UvNotFound, UpdateFailed } from "./error"
import { GRAPHIFY_PINNED_VERSION } from "./version"

export interface Interface {
  readonly available: () => Effect.Effect<boolean>
  readonly startMap: (input: {
    sessionID?: SessionSchema.ID
    directory: AbsolutePath
  }) => Effect.Effect<BackgroundJob.Info, GraphifyDisabled | UvNotFound>
  readonly getMap: (id: string) => Effect.Effect<BackgroundJob.Info | undefined>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/Graphify") {}

const make = Effect.gen(function* () {
  const config = yield* Config.Service
  const jobs = yield* BackgroundJob.Service
  const proc = yield* AppProcess.Service

  const graphifyEnabled = Effect.fn("Graphify.graphifyEnabled")(function* () {
    const entries = yield* config.entries()
    return Config.latest(entries, "experimental")?.graphify === true
  })

  const available = Effect.fn("Graphify.available")(function* () {
    if (!(yield* graphifyEnabled())) return false
    return which("uv") !== null
  })

  const startMap = Effect.fn("Graphify.startMap")(function* (input: {
    sessionID?: SessionSchema.ID
    directory: AbsolutePath
  }) {
    if (!(yield* graphifyEnabled())) return yield* new GraphifyDisabled({})
    if (which("uv") === null) return yield* new UvNotFound({})
    const command = ChildProcess.make(
      "uv",
      [
        "tool",
        "run",
        "--from",
        `graphifyy==${GRAPHIFY_PINNED_VERSION}`,
        "graphify",
        "update",
        input.directory,
      ],
      { cwd: input.directory, extendEnv: true },
    )
    return yield* jobs.start({
      type: "graphify.map",
      title: "Graphify project map",
      metadata: {
        ...(input.sessionID ? { sessionID: input.sessionID } : {}),
        directory: input.directory,
      },
      run: proc.run(command, { timeout: Duration.minutes(10) }).pipe(
        Effect.flatMap(AppProcess.requireSuccess),
        Effect.map((result) => result.stdout.toString("utf8").trim() || "completed"),
        Effect.mapError(
          (error) => new UpdateFailed({ exitCode: error.exitCode, stderr: error.stderr }),
        ),
      ),
    })
  })

  const getMap = Effect.fn("Graphify.getMap")(function* (id: string) {
    return yield* jobs.get(id)
  })

  return Service.of({ available, startMap, getMap })
})

const layer = Layer.effect(Service, make)

// Location-scoped: reads per-project config flag. BackgroundJob and AppProcess are
// process-global; map jobs are not durable across process restart.
export const node = makeLocationNode({
  service: Service,
  layer,
  deps: [Config.node, BackgroundJob.node, AppProcess.node],
})

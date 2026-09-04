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
import { GraphifyDisabled, QueryFailed, UvNotFound, UpdateFailed } from "./error"
import { GRAPHIFY_PINNED_VERSION } from "./version"
import { QUERY_MESSAGES, mapWaitOutcome, type QueryOutcome } from "./query"

const MAP_WAIT_TIMEOUT_MS = Duration.toMillis(Duration.minutes(3))
const QUERY_TIMEOUT = Duration.minutes(2)

export interface Interface {
  readonly available: () => Effect.Effect<boolean>
  readonly startMap: (input: {
    sessionID?: SessionSchema.ID
    directory: AbsolutePath
  }) => Effect.Effect<BackgroundJob.Info, GraphifyDisabled | UvNotFound>
  readonly getMap: (id: string) => Effect.Effect<BackgroundJob.Info | undefined>
  readonly query: (input: {
    sessionID?: SessionSchema.ID
    directory: AbsolutePath
    question: string
  }) => Effect.Effect<QueryOutcome>
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

  const graphPath = (directory: AbsolutePath) => path.join(directory, "graphify-out", "graph.json")

  const hasGraph = Effect.fn("Graphify.hasGraph")(function* (directory: AbsolutePath) {
    return yield* Effect.promise(async () => {
      try {
        return await Bun.file(graphPath(directory)).exists()
      } catch {
        return false
      }
    })
  })

  const runGraphifyQuery = Effect.fn("Graphify.runGraphifyQuery")(function* (
    directory: AbsolutePath,
    question: string,
  ) {
    const command = ChildProcess.make(
      "uv",
      [
        "tool",
        "run",
        "--from",
        `graphifyy==${GRAPHIFY_PINNED_VERSION}`,
        "graphify",
        "query",
        question,
      ],
      { cwd: directory, extendEnv: true },
    )
    const result = yield* proc.run(command, { timeout: QUERY_TIMEOUT })
    if (result.exitCode === 0) {
      return result.stdout.toString("utf8").trim()
    }
    return yield* new QueryFailed({
      exitCode: result.exitCode,
      stderr: result.stderr.toString("utf8").trim(),
    })
  })

  const waitForMap = Effect.fn("Graphify.waitForMap")(function* (jobID: string) {
    const waited = yield* jobs.wait({ id: jobID, timeout: MAP_WAIT_TIMEOUT_MS })
    return mapWaitOutcome(waited)
  })

  const queryImpl = Effect.fn("Graphify.query")(function* (input: {
    sessionID?: SessionSchema.ID
    directory: AbsolutePath
    question: string
  }) {
    if (!(yield* graphifyEnabled())) {
      return {
        status: "disabled" as const,
        message: QUERY_MESSAGES.disabled,
      }
    }
    if (which("uv") === null) {
      return {
        status: "uv_missing" as const,
        message: QUERY_MESSAGES.uv_missing,
      }
    }
    if (!(yield* hasGraph(input.directory))) {
      const started = yield* startMap({
        directory: input.directory,
        sessionID: input.sessionID,
      }).pipe(
        Effect.map((info) => ({ kind: "ok" as const, info })),
        Effect.catchTag("Graphify.GraphifyDisabled", () => Effect.succeed({ kind: "disabled" as const })),
        Effect.catchTag("Graphify.UvNotFound", () => Effect.succeed({ kind: "uv_missing" as const })),
      )
      if (started.kind === "disabled") {
        return {
          status: "disabled" as const,
          message: QUERY_MESSAGES.disabled,
        }
      }
      if (started.kind === "uv_missing") {
        return {
          status: "uv_missing" as const,
          message: QUERY_MESSAGES.uv_missing,
        }
      }
      const mapWait = yield* waitForMap(started.info.id)
      if (mapWait) return mapWait
    }
    return yield* runGraphifyQuery(input.directory, input.question).pipe(
      Effect.map(
        (output): QueryOutcome => ({
          status: "ok",
          message: "Graphify query completed.",
          output,
        }),
      ),
      Effect.catchTag("Graphify.QueryFailed", (error) =>
        Effect.succeed({
          status: "query_failed" as const,
          message: error.stderr
            ? `${QUERY_MESSAGES.query_failed} ${error.stderr}`
            : QUERY_MESSAGES.query_failed,
        }),
      ),
      Effect.catchTag("AppProcessError", () =>
        Effect.succeed({
          status: "query_failed" as const,
          message: QUERY_MESSAGES.query_failed,
        }),
      ),
    )
  })

  const query: Interface["query"] = (input) =>
    queryImpl(input).pipe(
      Effect.orElseSucceed(() => ({
        status: "query_failed" as const,
        message: QUERY_MESSAGES.query_failed,
      })),
    )

  return Service.of({ available, startMap, getMap, query })
})

const layer = Layer.effect(Service, make)

// Location-scoped: reads per-project config flag. BackgroundJob and AppProcess are
// process-global; map jobs are not durable across process restart.
export const node = makeLocationNode({
  service: Service,
  layer,
  deps: [Config.node, BackgroundJob.node, AppProcess.node],
})

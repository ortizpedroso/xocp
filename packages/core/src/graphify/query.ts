import type { BackgroundJob } from "../background-job"

export type QueryStatus =
  | "disabled"
  | "uv_missing"
  | "map_in_progress"
  | "map_failed"
  | "query_failed"
  | "ok"

export type QueryOutcome = {
  status: QueryStatus
  message: string
  output?: string
}

export const QUERY_MESSAGES = {
  disabled:
    "Graphify is disabled. Enable experimental.graphify in project config before querying the code graph.",
  uv_missing:
    "Graphify requires the uv tool on PATH. Install uv (https://docs.astral.sh/uv/) and try again.",
  map_in_progress:
    "Project mapping is still running. Wait a moment and run graphify_query again.",
  map_failed: "Project mapping failed before the query could run.",
  query_failed: "Graphify query failed.",
} as const

export const mapWaitOutcome = (waited: BackgroundJob.WaitResult): QueryOutcome | undefined => {
  if (waited.timedOut || waited.info?.status === "running") {
    return {
      status: "map_in_progress",
      message: QUERY_MESSAGES.map_in_progress,
    }
  }
  if (waited.info?.status === "error") {
    return {
      status: "map_failed",
      message: waited.info.error
        ? `${QUERY_MESSAGES.map_failed} ${waited.info.error}`
        : QUERY_MESSAGES.map_failed,
    }
  }
  if (waited.info?.status !== "completed") {
    return {
      status: "map_failed",
      message: QUERY_MESSAGES.map_failed,
    }
  }
  return undefined
}

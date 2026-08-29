export const GRAPHIFY_POLL_MS = 3000
export const GRAPHIFY_POLL_TIMEOUT_MS = 10 * 60 * 1000

export type GraphifySuggestionState = {
  eligible: boolean
  score: number
  threshold: number
  sidecarConfigured: boolean
}

export type GraphifyMapJobStatus = "running" | "completed" | "error" | "cancelled"

export function shouldShowGraphifySuggestion(eligible: boolean) {
  return eligible
}

export function shouldStopGraphifyPolling(status: GraphifyMapJobStatus) {
  return status === "completed" || status === "error" || status === "cancelled"
}

export function graphifyMapErrorMessage(
  input: { code?: string; message?: string },
  language: { t: (key: string) => string },
) {
  if (input.code === "graphify_not_configured") return language.t("session.graphify.error.notConfigured")
  if (input.code === "graphify_sidecar_error") {
    return input.message || language.t("session.graphify.error.sidecar")
  }
  return language.t("session.graphify.error.sidecar")
}

export function graphifyJobShowsSuccessToast(status: GraphifyMapJobStatus) {
  return status === "completed"
}

export function graphifyJobShowsErrorToast(status: GraphifyMapJobStatus) {
  return false
}

export function graphifyErrorData(err: unknown) {
  if (!err || typeof err !== "object" || !("data" in err)) return {}
  const data = (err as { data?: { code?: string; message?: string } }).data
  return { code: data?.code, message: data?.message }
}

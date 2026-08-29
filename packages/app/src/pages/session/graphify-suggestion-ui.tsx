import { Button } from "@opencode-ai/ui/button"
import { ButtonV2 } from "@opencode-ai/ui/v2/button-v2"
import { createEffect, createSignal, onCleanup, Show } from "solid-js"
import { useLanguage } from "@/context/language"
import { useServerSDK, type ServerSDK } from "@/context/server-sdk"
import { useSettings } from "@/context/settings"
import { useSessionKey } from "@/pages/session/session-layout"
import { createGraphifyClient } from "@/pages/session/graphify-api"
import {
  GRAPHIFY_POLL_MS,
  GRAPHIFY_POLL_TIMEOUT_MS,
  graphifyErrorData,
  graphifyJobShowsSuccessToast,
  graphifyMapErrorMessage,
  shouldShowGraphifySuggestion,
  shouldStopGraphifyPolling,
  type GraphifySuggestionState,
} from "@/pages/session/graphify-suggestion"
import { authTokenFromCredentials } from "@/utils/server"
import { showToast } from "@/utils/toast"

function graphifyHeaders(server: ServerSDK) {
  if (!server.server.http.password) return undefined
  return {
    Authorization: `Basic ${authTokenFromCredentials({
      username: server.server.http.username,
      password: server.server.http.password,
    })}`,
  }
}

export function useGraphifySuggestion(userTurnID: () => string | undefined) {
  const language = useLanguage()
  const serverSDK = useServerSDK()
  const { params } = useSessionKey()
  const [suggestion, setSuggestion] = createSignal<GraphifySuggestionState | undefined>()
  const [loading, setLoading] = createSignal(false)
  const [error, setError] = createSignal<string | undefined>()
  let stopPolling: (() => void) | undefined

  onCleanup(() => {
    stopPolling?.()
  })

  const client = () =>
    createGraphifyClient({
      baseUrl: serverSDK().url,
      headers: graphifyHeaders(serverSDK()),
    })

  const loadSuggestion = async (sessionID: string) => {
    const result = await client().suggestion(sessionID)
    setSuggestion(result)
    if (!shouldShowGraphifySuggestion(result.eligible)) setSuggestion(undefined)
  }

  createEffect(() => {
    const sessionID = params.id
    const turn = userTurnID()
    stopPolling?.()
    stopPolling = undefined
    if (!sessionID || !turn) {
      setSuggestion(undefined)
      setError(undefined)
      return
    }
    void loadSuggestion(sessionID).catch(() => {
      setSuggestion(undefined)
    })
  })

  const startMap = async () => {
    const sessionID = params.id
    if (!sessionID || loading()) return
    setLoading(true)
    setError(undefined)
    try {
      const started = await client().startMap(sessionID)
      pollMapJob(sessionID, started.jobID)
    } catch (err) {
      const data = graphifyErrorData(err)
      setError(graphifyMapErrorMessage(data, language))
    } finally {
      setLoading(false)
    }
  }

  const pollMapJob = (sessionID: string, jobID: string) => {
    stopPolling?.()
    const startedAt = Date.now()
    let active = true

    const stop = () => {
      active = false
      window.clearInterval(timer)
      if (stopPolling === stop) stopPolling = undefined
    }

    const tick = async () => {
      if (!active) return
      if (Date.now() - startedAt >= GRAPHIFY_POLL_TIMEOUT_MS) {
        stop()
        return
      }
      try {
        const job = await client().getMap(sessionID, jobID)
        if (!shouldStopGraphifyPolling(job.status)) return
        stop()
        if (graphifyJobShowsSuccessToast(job.status)) {
          showToast({ title: language.t("session.graphify.toast.ready") })
        }
        // Async job errors are intentionally silent: the user may have moved on.
      } catch {
        stop()
      }
    }

    const timer = window.setInterval(() => {
      void tick()
    }, GRAPHIFY_POLL_MS)
    void tick()
    stopPolling = stop
  }

  return {
    visible: () => shouldShowGraphifySuggestion(suggestion()?.eligible ?? false),
    loading,
    error,
    startMap,
  }
}

export function GraphifySuggestion(props: {
  userTurnID: () => string | undefined
}) {
  const language = useLanguage()
  const settings = useSettings()
  const state = useGraphifySuggestion(props.userTurnID)

  return (
    <Show when={state.visible()}>
      <div
        data-component="session-graphify-suggestion"
        class="mb-2 flex flex-wrap items-center gap-2 rounded-md border border-border-weak-base bg-background-base px-3 py-2 text-13-regular text-text-base"
      >
        <span class="min-w-0 flex-1 text-text-weak">{language.t("session.graphify.suggestion.message")}</span>
        <Show
          when={settings.general.newLayoutDesigns()}
          fallback={
            <Button size="small" variant="secondary" disabled={state.loading()} onClick={() => void state.startMap()}>
              {state.loading()
                ? language.t("session.graphify.map.loading")
                : language.t("session.graphify.map.action")}
            </Button>
          }
        >
          <ButtonV2 variant="outline" disabled={state.loading()} onClick={() => void state.startMap()}>
            {state.loading() ? language.t("session.graphify.map.loading") : language.t("session.graphify.map.action")}
          </ButtonV2>
        </Show>
        <Show when={state.error()}>
          {(message) => <span class="w-full text-12-regular text-text-danger-base">{message()}</span>}
        </Show>
      </div>
    </Show>
  )
}

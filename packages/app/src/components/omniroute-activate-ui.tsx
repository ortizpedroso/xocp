import { Button } from "@opencode-ai/ui/button"
import { createSignal, onCleanup, Show } from "solid-js"
import { useLanguage } from "@/context/language"
import { useServerProtocol, useServerSDK, type ServerSDK } from "@/context/server-sdk"
import { useServerSync } from "@/context/server-sync"
import { createOmniRouteClient, type OmniRouteActivateResult } from "@/components/omniroute-api"
import { omnirouteProviderInitial } from "@/components/dialog-custom-provider-form"
import { authTokenFromCredentials } from "@/utils/server"
import { showToast } from "@/utils/toast"

const POLL_MS = 1500
const POLL_TIMEOUT_MS = 10 * 60 * 1000

function headers(server: ServerSDK) {
  if (!server.server.http.password) return undefined
  return {
    Authorization: `Basic ${authTokenFromCredentials({
      username: server.server.http.username,
      password: server.server.http.password,
    })}`,
  }
}

export function OmniRouteActivateButton() {
  const language = useLanguage()
  const serverSDK = useServerSDK()
  const serverSync = useServerSync()
  const protocol = useServerProtocol()
  const [loading, setLoading] = createSignal(false)
  const [step, setStep] = createSignal<string | undefined>()
  const [error, setError] = createSignal<string | undefined>()
  let stop = false

  onCleanup(() => {
    stop = true
  })

  const registerProvider = async (result: OmniRouteActivateResult) => {
    const initial = omnirouteProviderInitial()
    const providerID = result.providerID || initial.providerID
    const disabledProviders = serverSync().data.config.disabled_providers ?? []
    const nextDisabled = disabledProviders.filter((id) => id !== providerID)
    if (result.apiKey) {
      await serverSDK().client.auth.set({
        providerID,
        auth: { type: "api", key: result.apiKey },
      })
    }
    await serverSync().updateConfig({
      provider: {
        [providerID]: {
          npm: "@ai-sdk/openai-compatible",
          name: initial.name,
          options: { baseURL: result.baseURL || initial.baseURL },
          models: {},
        },
      },
      disabled_providers: nextDisabled,
    })
  }

  const poll = async (jobID: string) => {
    const client = createOmniRouteClient({
      baseUrl: serverSDK().url,
      headers: headers(serverSDK()),
    })
    const started = Date.now()
    while (!stop && Date.now() - started < POLL_TIMEOUT_MS) {
      const job = await client.job(jobID)
      if (job.status === "completed") {
        if (!job.output) throw new Error(language.t("settings.providers.omniroute.activate.error.empty"))
        const parsed = JSON.parse(job.output) as OmniRouteActivateResult
        await registerProvider(parsed)
        showToast({
          variant: "success",
          icon: "circle-check",
          title: language.t("settings.providers.omniroute.activate.ready"),
        })
        return
      }
      if (job.status === "error" || job.status === "cancelled") {
        throw new Error(job.error || language.t("settings.providers.omniroute.activate.error.failed"))
      }
      await new Promise((resolve) => setTimeout(resolve, POLL_MS))
    }
    throw new Error(language.t("settings.providers.omniroute.activate.error.timeout"))
  }

  const activate = async () => {
    if (protocol() !== "v1" || loading()) return
    setLoading(true)
    setError(undefined)
    setStep(language.t("settings.providers.omniroute.activate.downloading"))
    try {
      const client = createOmniRouteClient({
        baseUrl: serverSDK().url,
        headers: headers(serverSDK()),
      })
      const status = await client.status()
      if (!status.available) {
        throw new Error(language.t("settings.providers.omniroute.activate.error.npm"))
      }
      if (status.running) {
        setStep(language.t("settings.providers.omniroute.activate.configuring"))
        await registerProvider({
          step: "ready",
          providerID: "omniroute",
          baseURL: omnirouteProviderInitial().baseURL,
          apiKey: "",
        })
        showToast({
          variant: "success",
          icon: "circle-check",
          title: language.t("settings.providers.omniroute.activate.ready"),
        })
        return
      }
      setStep(language.t("settings.providers.omniroute.activate.downloading"))
      const started = await client.activate()
      setStep(language.t("settings.providers.omniroute.activate.configuring"))
      await poll(started.jobID)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setError(message)
      showToast({
        variant: "error",
        title: language.t("settings.providers.omniroute.activate.error.failed"),
        description: message,
      })
    } finally {
      setLoading(false)
      setStep(undefined)
    }
  }

  return (
    <div class="flex flex-col items-end gap-1">
      <Button size="large" variant="primary" disabled={loading()} onClick={() => void activate()}>
        {loading()
          ? step() || language.t("settings.providers.omniroute.activate.loading")
          : language.t("settings.providers.omniroute.activate.action")}
      </Button>
      <Show when={error()}>
        {(message) => <span class="text-12-regular text-text-danger-base max-w-xs text-right">{message()}</span>}
      </Show>
    </div>
  )
}

import { Button } from "@opencode-ai/ui/button"
import { createSignal, onCleanup, Show, type Accessor } from "solid-js"
import { useServerProtocol, useServerSDK, type ServerSDK } from "@/context/server-sdk"
import { useServerSync } from "@/context/server-sync"
import type {
  ProviderActivateClient,
  ProviderActivateLabels,
  ProviderActivateInitial,
  ProviderActivateResult,
} from "@/components/provider-activate-types"
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

export function ProviderActivateButton(input: {
  labels: Accessor<ProviderActivateLabels>
  createClient: (server: ServerSDK) => ProviderActivateClient
  providerInitial: () => ProviderActivateInitial
}) {
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

  const registerProvider = async (result: ProviderActivateResult) => {
    const initial = input.providerInitial()
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

  const poll = async (client: ProviderActivateClient, jobID: string) => {
    const labels = input.labels()
    const started = Date.now()
    while (!stop && Date.now() - started < POLL_TIMEOUT_MS) {
      const job = await client.job(jobID)
      if (job.status === "completed") {
        if (!job.output) throw new Error(labels.errorEmpty)
        const parsed = JSON.parse(job.output) as ProviderActivateResult
        await registerProvider(parsed)
        showToast({
          variant: "success",
          icon: "circle-check",
          title: labels.ready,
        })
        return
      }
      if (job.status === "error" || job.status === "cancelled") {
        throw new Error(job.error || labels.errorFailed)
      }
      await new Promise((resolve) => setTimeout(resolve, POLL_MS))
    }
    throw new Error(labels.errorTimeout)
  }

  const activate = async () => {
    if (protocol() !== "v1" || loading()) return
    const labels = input.labels()
    setLoading(true)
    setError(undefined)
    setStep(labels.stepInstall)
    try {
      const client = input.createClient(serverSDK())
      const status = await client.status()
      if (!status.available) {
        throw new Error(labels.errorUnavailable)
      }
      if (status.running) {
        setStep(labels.stepStart)
        await registerProvider({
          step: "ready",
          providerID: input.providerInitial().providerID,
          baseURL: input.providerInitial().baseURL,
          apiKey: "",
        })
        showToast({
          variant: "success",
          icon: "circle-check",
          title: labels.ready,
        })
        return
      }
      setStep(labels.stepInstall)
      const started = await client.activate()
      setStep(labels.stepStart)
      await poll(client, started.jobID)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setError(message)
      showToast({
        variant: "error",
        title: labels.errorFailed,
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
        {loading() ? step() || input.labels().loading : input.labels().action}
      </Button>
      <Show when={error()}>
        {(message) => <span class="text-12-regular text-text-danger-base max-w-xs text-right">{message()}</span>}
      </Show>
    </div>
  )
}

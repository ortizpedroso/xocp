import type { ProviderActivateClient, ProviderActivateJob, ProviderActivateStatus } from "@/components/provider-activate-types"

export function createHeadroomClient(input: { baseUrl: string; headers?: Record<string, string> }): ProviderActivateClient {
  const request = async <T>(path: string, init?: RequestInit) => {
    const response = await fetch(`${input.baseUrl}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...input.headers,
        ...init?.headers,
      },
    })
    if (!response.ok) {
      const text = await response.text()
      throw new Error(text || response.statusText)
    }
    return (await response.json()) as T
  }

  return {
    status: () => request<ProviderActivateStatus>("/api/headroom/status"),
    activate: () =>
      request<{ jobID: string; status: "running" }>("/api/headroom/activate", { method: "POST" }),
    job: (jobID: string) => request<ProviderActivateJob>(`/api/headroom/activate/${jobID}`),
  }
}

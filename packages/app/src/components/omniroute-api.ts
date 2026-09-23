export type OmniRouteStatus = {
  available: boolean
  running: boolean
}

export type OmniRouteActivateJob = {
  id: string
  status: "running" | "completed" | "error" | "cancelled"
  output?: string
  error?: string
}

export type OmniRouteActivateResult = {
  step: "ready"
  providerID: string
  baseURL: string
  apiKey: string
}

export function createOmniRouteClient(input: { baseUrl: string; headers?: Record<string, string> }) {
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
    status: () => request<OmniRouteStatus>("/api/omniroute/status"),
    activate: () =>
      request<{ jobID: string; status: "running" }>("/api/omniroute/activate", { method: "POST" }),
    job: (jobID: string) => request<OmniRouteActivateJob>(`/api/omniroute/activate/${jobID}`),
  }
}

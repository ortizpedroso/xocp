export type ProviderActivateStatus = {
  available: boolean
  running: boolean
}

export type ProviderActivateJob = {
  id: string
  status: "running" | "completed" | "error" | "cancelled"
  output?: string
  error?: string
}

export type ProviderActivateResult = {
  step: "ready"
  providerID: string
  baseURL: string
  apiKey: string
}

export type ProviderActivateClient = {
  status: () => Promise<ProviderActivateStatus>
  activate: () => Promise<{ jobID: string; status: "running" }>
  job: (jobID: string) => Promise<ProviderActivateJob>
}

export type ProviderActivateLabels = {
  action: string
  loading: string
  stepInstall: string
  stepStart: string
  ready: string
  errorUnavailable: string
  errorEmpty: string
  errorFailed: string
  errorTimeout: string
}

export type ProviderActivateInitial = {
  providerID: string
  name: string
  baseURL: string
}

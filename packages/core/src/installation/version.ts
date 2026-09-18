declare global {
  const OPENCODE_VERSION: string
  const OPENCODE_CHANNEL: string
}

export const InstallationVersion = typeof OPENCODE_VERSION === "string" ? OPENCODE_VERSION : "1.18.25"
export const InstallationChannel = typeof OPENCODE_CHANNEL === "string" ? OPENCODE_CHANNEL : "prod"
// InstallationLocal: true quando rodando sem build (OPENCODE_VERSION não definido)
export const InstallationLocal = typeof OPENCODE_VERSION !== "string"


import { useLanguage } from "@/context/language"
import { type ServerSDK } from "@/context/server-sdk"
import { createHeadroomClient } from "@/components/headroom-api"
import { headroomProviderInitial } from "@/components/dialog-custom-provider-form"
import { ProviderActivateButton } from "@/components/provider-activate-button"
import { authTokenFromCredentials } from "@/utils/server"

function headers(server: ServerSDK) {
  if (!server.server.http.password) return undefined
  return {
    Authorization: `Basic ${authTokenFromCredentials({
      username: server.server.http.username,
      password: server.server.http.password,
    })}`,
  }
}

export function HeadroomActivateButton() {
  const language = useLanguage()

  return (
    <ProviderActivateButton
      labels={() => ({
        action: language.t("settings.providers.headroom.activate.action"),
        loading: language.t("settings.providers.headroom.activate.loading"),
        stepInstall: language.t("settings.providers.headroom.activate.installing"),
        stepStart: language.t("settings.providers.headroom.activate.starting"),
        ready: language.t("settings.providers.headroom.activate.ready"),
        errorUnavailable: language.t("settings.providers.headroom.activate.error.uv"),
        errorEmpty: language.t("settings.providers.headroom.activate.error.empty"),
        errorFailed: language.t("settings.providers.headroom.activate.error.failed"),
        errorTimeout: language.t("settings.providers.headroom.activate.error.timeout"),
      })}
      createClient={(server) =>
        createHeadroomClient({
          baseUrl: server.url,
          headers: headers(server),
        })
      }
      providerInitial={headroomProviderInitial}
    />
  )
}

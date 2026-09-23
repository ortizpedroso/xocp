import { useLanguage } from "@/context/language"
import { type ServerSDK } from "@/context/server-sdk"
import { createOmniRouteClient } from "@/components/omniroute-api"
import { omnirouteProviderInitial } from "@/components/dialog-custom-provider-form"
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

export function OmniRouteActivateButton() {
  const language = useLanguage()

  return (
    <ProviderActivateButton
      labels={() => ({
        action: language.t("settings.providers.omniroute.activate.action"),
        loading: language.t("settings.providers.omniroute.activate.loading"),
        stepInstall: language.t("settings.providers.omniroute.activate.downloading"),
        stepStart: language.t("settings.providers.omniroute.activate.configuring"),
        ready: language.t("settings.providers.omniroute.activate.ready"),
        errorUnavailable: language.t("settings.providers.omniroute.activate.error.npm"),
        errorEmpty: language.t("settings.providers.omniroute.activate.error.empty"),
        errorFailed: language.t("settings.providers.omniroute.activate.error.failed"),
        errorTimeout: language.t("settings.providers.omniroute.activate.error.timeout"),
      })}
      createClient={(server) =>
        createOmniRouteClient({
          baseUrl: server.url,
          headers: headers(server),
        })
      }
      providerInitial={omnirouteProviderInitial}
    />
  )
}

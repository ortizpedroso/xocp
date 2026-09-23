import { Button } from "@opencode-ai/ui/button"
import { IconButton } from "@opencode-ai/ui/icon-button"
import { ButtonV2 } from "@opencode-ai/ui/v2/button-v2"
import { IconButtonV2 } from "@opencode-ai/ui/v2/icon-button-v2"
import { createMemo, Show } from "solid-js"
import { useLanguage } from "@/context/language"
import { useLocal } from "@/context/local"
import { useSDK } from "@/context/sdk"
import { useSettings } from "@/context/settings"
import {
  dismissElicitadorSuggestion,
  elicitadorSuggestionScope,
  isElicitadorSuggestionDismissed,
  setElicitadorSubmitAgent,
  triggerElicitadorSubmit,
} from "@/pages/session/elicitador-suggestion-runtime"
import { ELICITADOR_AGENT_ID, shouldOfferElicitadorSuggestion } from "@/pages/session/elicitador-suggestion"
import { showToast } from "@/utils/toast"

export function ElicitadorSuggestion(props: {
  sessionID: () => string | undefined
  sessionKey: () => string
  promptText: () => string
  userMessageCount: () => number
}) {
  const language = useLanguage()
  const settings = useSettings()
  const local = useLocal()
  const sdk = useSDK()

  const scope = createMemo(() => elicitadorSuggestionScope(props.sessionID(), props.sessionKey()))

  const visible = createMemo(() =>
    shouldOfferElicitadorSuggestion({
      text: props.promptText(),
      agent: local.agent.current()?.name ?? "build",
      userMessageCount: props.userMessageCount(),
      dismissed: isElicitadorSuggestionDismissed(scope()),
    }),
  )

  const dismiss = () => {
    dismissElicitadorSuggestion(scope())
  }

  const accept = async () => {
    const sessionID = props.sessionID()
    try {
      if (sessionID) {
        await sdk().api.session.switchAgent({ sessionID, agent: ELICITADOR_AGENT_ID })
      }
      local.agent.set(ELICITADOR_AGENT_ID)
      setElicitadorSubmitAgent(ELICITADOR_AGENT_ID)
      triggerElicitadorSubmit()
    } catch (err) {
      showToast({
        title: language.t("session.elicitador.error.switchFailed"),
        description: err instanceof Error ? err.message : language.t("common.requestFailed"),
      })
    }
  }

  return (
    <Show when={visible()}>
      <div
        data-component="session-elicitador-suggestion"
        class="mb-2 flex flex-wrap items-center gap-2 rounded-md border border-text-interactive-base bg-surface-info-base px-3 py-2 text-13-regular text-text-base"
      >
        <span class="min-w-0 flex-1 text-text-weak">{language.t("session.elicitador.suggestion.message")}</span>
        <Show
          when={settings.general.newLayoutDesigns()}
          fallback={
            <>
              <Button size="small" variant="primary" onClick={() => void accept()}>
                {language.t("session.elicitador.suggestion.action")}
              </Button>
              <IconButton
                icon="close"
                size="small"
                variant="ghost"
                aria-label={language.t("common.dismiss")}
                onClick={dismiss}
              />
            </>
          }
        >
          <>
            <ButtonV2 variant="contrast" onClick={() => void accept()}>
              {language.t("session.elicitador.suggestion.action")}
            </ButtonV2>
            <IconButtonV2
              icon="close"
              variant="ghost"
              aria-label={language.t("common.dismiss")}
              onClick={dismiss}
            />
          </>
        </Show>
      </div>
    </Show>
  )
}

import { DockPrompt } from "@opencode-ai/session-ui/dock-prompt"
import { Show } from "solid-js"
import { useLanguage } from "@/context/language"
import {
  answerElicitadorAmbiguity,
  elicitadorAmbiguityPending,
} from "@/pages/session/elicitador-suggestion-runtime"

function Mark(props: { picked: boolean }) {
  return (
    <span data-slot="question-option-check" aria-hidden="true">
      <span data-slot="question-option-box" data-type="radio" data-picked={props.picked}>
        <span data-slot="question-option-radio-dot" />
      </span>
    </span>
  )
}

function Option(props: { picked: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      data-slot="question-option"
      data-picked={props.picked}
      role="radio"
      aria-checked={props.picked}
      onClick={props.onClick}
    >
      <Mark picked={props.picked} />
      <span data-slot="question-option-main">
        <span data-slot="option-label">{props.label}</span>
      </span>
    </button>
  )
}

export function ElicitadorAmbiguityPrompt() {
  const language = useLanguage()

  const projectLabel = () => language.t("session.elicitador.ambiguity.option.project")
  const pointTaskLabel = () => language.t("session.elicitador.ambiguity.option.pointTask")

  const choose = (choice: "project" | "point_task") => {
    if (!elicitadorAmbiguityPending()) return
    answerElicitadorAmbiguity(choice)
  }

  return (
    <Show when={elicitadorAmbiguityPending()}>
      <div data-component="session-elicitador-ambiguity" class="mb-2">
        <DockPrompt
          kind="question"
          header={
            <div data-slot="question-header-title">{language.t("session.elicitador.ambiguity.header")}</div>
          }
          footer={<div />}
        >
          <div data-slot="question-text">{language.t("session.elicitador.ambiguity.message")}</div>
          <div data-slot="question-hint">{language.t("ui.question.singleHint")}</div>
          <div data-slot="question-options">
            <Option picked={false} label={projectLabel()} onClick={() => choose("project")} />
            <Option picked={false} label={pointTaskLabel()} onClick={() => choose("point_task")} />
          </div>
        </DockPrompt>
      </div>
    </Show>
  )
}

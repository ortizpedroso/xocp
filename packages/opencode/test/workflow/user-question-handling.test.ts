import { describe, expect, it } from "bun:test"
import { Permission } from "@/permission"
import { Agent } from "@/agent"
import PROMPT_ANALISTA from "@/agent/prompt/analista.txt"
import PROMPT_WORKFLOW_EXECUTOR from "@/agent/prompt/workflow-executor.txt"
import PROMPT_AVALIADOR from "@/agent/prompt/avaliador.txt"
import PROMPT_ELICITADOR from "@/agent/prompt/elicitador.txt"
import PROMPT_WORKFLOW_TRIADOR from "@/agent/prompt/workflow-triador.txt"

describe("User Question & Clarification Handling", () => {
  it("includes clear question handling guidelines in all pipeline agent prompts", () => {
    const prompts = [
      { name: "analista", prompt: PROMPT_ANALISTA },
      { name: "workflow-executor", prompt: PROMPT_WORKFLOW_EXECUTOR },
      { name: "avaliador", prompt: PROMPT_AVALIADOR },
      { name: "elicitador", prompt: PROMPT_ELICITADOR },
      { name: "workflow-triador", prompt: PROMPT_WORKFLOW_TRIADOR },
    ]

    for (const { name, prompt } of prompts) {
      expect(prompt).toContain("TRATAMENTO DE DÚVIDAS E PERGUNTAS DO USUÁRIO NO MEIO DA CONVERSA")
      expect(prompt).toContain("DÚVIDA CONCEITUAL / EXPLICAÇÃO")
    }
  })

  it("instructs analista, executor and avaliador never to refuse answering questions", () => {
    expect(PROMPT_ANALISTA).toContain("NUNCA diga \"não posso responder porque sou o analista\"")
    expect(PROMPT_WORKFLOW_EXECUTOR).toContain("NUNCA recuse responder por ser o executor")
    expect(PROMPT_AVALIADOR).toContain("responda claramente sem interromper o fluxo de forma hostil")
  })
})

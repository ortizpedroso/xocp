import { describe, expect, test } from "bun:test"
import {
  hasElicitadorPointTaskSignals,
  hasElicitadorProjectSignals,
  shouldOfferElicitadorSuggestion,
  suggestsElicitador,
} from "./elicitador-suggestion"

describe("suggestsElicitador", () => {
  test("matches greenfield project prompts in Portuguese", () => {
    expect(suggestsElicitador("quero criar um sistema de agendamento pra uma clínica")).toBe(true)
    expect(suggestsElicitador("preciso de uma plataforma para gestão de estoque")).toBe(true)
    expect(suggestsElicitador("desenvolver um app de delivery")).toBe(true)
  })

  test("rejects point-task prompts with file or bug references", () => {
    expect(suggestsElicitador("corrige esse bug no arquivo X")).toBe(false)
    expect(suggestsElicitador("fix the error in src/app.ts line 42")).toBe(false)
    expect(suggestsElicitador("debug this failure in auth.ts")).toBe(false)
  })

  test("rejects very short prompts", () => {
    expect(suggestsElicitador("novo app")).toBe(false)
  })
})

describe("shouldOfferElicitadorSuggestion", () => {
  test("offers only on first build-agent message when not dismissed", () => {
    expect(
      shouldOfferElicitadorSuggestion({
        text: "quero criar um sistema de agendamento",
        agent: "build",
        userMessageCount: 0,
        dismissed: false,
      }),
    ).toBe(true)
  })

  test("hides after dismiss, history, or non-build agent", () => {
    const input = {
      text: "quero criar um sistema de agendamento",
      agent: "build",
      userMessageCount: 0,
      dismissed: false,
    }
    expect(shouldOfferElicitadorSuggestion({ ...input, dismissed: true })).toBe(false)
    expect(shouldOfferElicitadorSuggestion({ ...input, userMessageCount: 1 })).toBe(false)
    expect(shouldOfferElicitadorSuggestion({ ...input, agent: "plan" })).toBe(false)
    expect(shouldOfferElicitadorSuggestion({ ...input, agent: "elicitador" })).toBe(false)
  })
})

describe("signal helpers", () => {
  test("detects project and point-task signals independently", () => {
    expect(hasElicitadorProjectSignals("quero criar um sistema")).toBe(true)
    expect(hasElicitadorPointTaskSignals("corrige esse bug")).toBe(true)
  })
})

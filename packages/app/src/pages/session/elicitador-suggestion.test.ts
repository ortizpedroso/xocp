import { describe, expect, test } from "bun:test"
import {
  hasElicitadorAmbiguousHints,
  hasElicitadorPointTaskSignals,
  hasElicitadorProjectSignals,
  shouldAskElicitadorAmbiguity,
  shouldOfferElicitadorSuggestion,
  suggestsElicitador,
  triageElicitador,
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

describe("triageElicitador", () => {
  test("classifies strong project signals", () => {
    expect(triageElicitador("quero criar um sistema de agendamento pra uma clínica")).toBe("project")
  })

  test("classifies point tasks", () => {
    expect(triageElicitador("corrige esse bug no arquivo X")).toBe("point_task")
  })

  test("classifies ambiguous system hints", () => {
    expect(triageElicitador("preciso melhorar o sistema de login")).toBe("ambiguous")
    expect(triageElicitador("quero uma dashboard para vendas")).toBe("ambiguous")
    expect(triageElicitador("precisamos de um portal para clientes")).toBe("ambiguous")
  })

  test("classifies neutral prompts as insufficient", () => {
    expect(triageElicitador("o que é typescript?")).toBe("insufficient")
    expect(triageElicitador("bom dia, tudo bem?")).toBe("insufficient")
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

describe("shouldAskElicitadorAmbiguity", () => {
  test("asks only on first build-agent ambiguous message when not resolved", () => {
    expect(
      shouldAskElicitadorAmbiguity({
        text: "preciso melhorar o sistema de login",
        agent: "build",
        userMessageCount: 0,
        resolved: false,
      }),
    ).toBe(true)
  })

  test("skips project, point-task, resolved, and follow-up messages", () => {
    const ambiguous = {
      text: "preciso melhorar o sistema de login",
      agent: "build",
      userMessageCount: 0,
      resolved: false,
    }
    expect(shouldAskElicitadorAmbiguity({ ...ambiguous, text: "quero criar um sistema de agendamento" })).toBe(false)
    expect(shouldAskElicitadorAmbiguity({ ...ambiguous, text: "corrige esse bug no arquivo X" })).toBe(false)
    expect(shouldAskElicitadorAmbiguity({ ...ambiguous, resolved: true })).toBe(false)
    expect(shouldAskElicitadorAmbiguity({ ...ambiguous, userMessageCount: 1 })).toBe(false)
    expect(shouldAskElicitadorAmbiguity({ ...ambiguous, agent: "plan" })).toBe(false)
  })
})

describe("signal helpers", () => {
  test("detects project, point-task, and ambiguous hints independently", () => {
    expect(hasElicitadorProjectSignals("quero criar um sistema")).toBe(true)
    expect(hasElicitadorPointTaskSignals("corrige esse bug")).toBe(true)
    expect(hasElicitadorAmbiguousHints("preciso melhorar o sistema de login")).toBe(true)
  })
})

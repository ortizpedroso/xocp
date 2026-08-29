import { describe, expect, test } from "bun:test"
import {
  graphifyErrorData,
  graphifyJobShowsErrorToast,
  graphifyJobShowsSuccessToast,
  graphifyMapErrorMessage,
  shouldShowGraphifySuggestion,
  shouldStopGraphifyPolling,
} from "./graphify-suggestion"

const language = {
  t: (key: string) => key,
}

describe("shouldShowGraphifySuggestion", () => {
  test("hides when not eligible", () => {
    expect(shouldShowGraphifySuggestion(false)).toBe(false)
  })

  test("shows when eligible", () => {
    expect(shouldShowGraphifySuggestion(true)).toBe(true)
  })
})

describe("shouldStopGraphifyPolling", () => {
  test("keeps polling while running", () => {
    expect(shouldStopGraphifyPolling("running")).toBe(false)
  })

  test("stops on terminal statuses", () => {
    expect(shouldStopGraphifyPolling("completed")).toBe(true)
    expect(shouldStopGraphifyPolling("error")).toBe(true)
    expect(shouldStopGraphifyPolling("cancelled")).toBe(true)
  })
})

describe("graphifyMapErrorMessage", () => {
  test("maps 409 to not configured copy", () => {
    expect(graphifyMapErrorMessage({ code: "graphify_not_configured" }, language)).toBe(
      "session.graphify.error.notConfigured",
    )
  })

  test("maps 502 to sidecar copy", () => {
    expect(graphifyMapErrorMessage({ code: "graphify_sidecar_error", message: "down" }, language)).toBe("down")
  })
})

describe("graphifyJobShowsSuccessToast", () => {
  test("shows exactly one success toast path for completed jobs", () => {
    expect(graphifyJobShowsSuccessToast("completed")).toBe(true)
    expect(graphifyJobShowsSuccessToast("running")).toBe(false)
  })
})

describe("graphifyJobShowsErrorToast", () => {
  test("never shows toast for async job errors", () => {
    expect(graphifyJobShowsErrorToast("error")).toBe(false)
    expect(graphifyJobShowsErrorToast("cancelled")).toBe(false)
  })
})

describe("graphifyErrorData", () => {
  test("reads API error payload", () => {
    expect(graphifyErrorData({ data: { code: "graphify_not_configured" } })).toEqual({
      code: "graphify_not_configured",
      message: undefined,
    })
  })
})

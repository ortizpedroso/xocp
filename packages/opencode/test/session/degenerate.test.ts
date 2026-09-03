import { describe, expect, test } from "bun:test"
import {
  checkDegenerateStreamingText,
  checkDegenerateText,
  createDegenerateTracker,
  onDegenerateToolCompleted,
  prefixKey,
} from "../../src/session/degenerate"

describe("session.degenerate", () => {
  test("prefixKey normalizes whitespace and case", () => {
    expect(prefixKey("  Vou   Executar O Comando  ")).toBe("vou executar o comando")
  })

  test("checkDegenerateText detects three matching snippets without tools", () => {
    const tracker = createDegenerateTracker()
    const line = "vou executar o comando agora mesmo"
    expect(checkDegenerateText(tracker, line)).toBe(false)
    expect(checkDegenerateText(tracker, `${line} por favor`)).toBe(false)
    expect(checkDegenerateText(tracker, `${line} de novo`)).toBe(true)
  })

  test("checkDegenerateText resets after a completed tool call", () => {
    const tracker = createDegenerateTracker()
    const line = "vou executar o comando agora mesmo"
    checkDegenerateText(tracker, line)
    checkDegenerateText(tracker, `${line} por favor`)
    onDegenerateToolCompleted(tracker)
    expect(checkDegenerateText(tracker, line)).toBe(false)
    expect(checkDegenerateText(tracker, `${line} por favor`)).toBe(false)
    expect(checkDegenerateText(tracker, `${line} de novo`)).toBe(true)
  })

  test("checkDegenerateStreamingText detects repeated prefix in one block", () => {
    const phrase = "vou executar o comando agora mesmo"
    const repeated = `${phrase} ${phrase} ${phrase}`
    expect(checkDegenerateStreamingText(repeated)).toBe(true)
  })

  test("checkDegenerateStreamingText ignores normal text", () => {
    expect(checkDegenerateStreamingText("Here is a normal answer about the repository structure.")).toBe(false)
  })
})

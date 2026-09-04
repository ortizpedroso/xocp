import { describe, expect, test } from "bun:test"

import PROMPT_ANTHROPIC from "../../src/session/prompt/anthropic.txt"
import PROMPT_CODEX from "../../src/session/prompt/codex.txt"
import PROMPT_GPT from "../../src/session/prompt/gpt.txt"
import PROMPT_KIMI from "../../src/session/prompt/kimi.txt"
import PROMPT_META from "../../src/session/prompt/meta.txt"

const prompts = [
  ["anthropic", PROMPT_ANTHROPIC],
  ["codex", PROMPT_CODEX],
  ["gpt", PROMPT_GPT],
  ["kimi", PROMPT_KIMI],
  ["meta", PROMPT_META],
] as const

describe("session prompt identity", () => {
  test("base provider prompts identify as XOCP on line 1", () => {
    for (const [name, prompt] of prompts) {
      const line = prompt.split("\n")[0]
      expect(line.startsWith("You are XOCP"), name).toBe(true)
      expect(line.includes("You are OpenCode"), name).toBe(false)
    }
  })
})

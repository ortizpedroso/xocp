import { describe, expect, test } from "bun:test"
import { Effect } from "effect"

import type { Provider } from "../../src/provider/provider"
import PROMPT_ANTHROPIC from "../../src/session/prompt/anthropic.txt"
import PROMPT_META from "../../src/session/prompt/meta.txt"
import { SystemPrompt } from "../../src/session/system"
import { cliIt } from "../lib/cli-process"
import { testProviderConfig } from "../lib/test-provider"

const RULE = 'phrase your answer using "XOCP" as the product name, never "OpenCode"'
const RULE_MARKER = "always phrase your answer using"
const FEEDBACK = "https://github.com/anomalyco/opencode"

function claudeProviderConfig(llmUrl: string) {
  const base = testProviderConfig(llmUrl)
  const model = base.provider.test.models["test-model"]
  return {
    ...base,
    provider: {
      test: {
        ...base.provider.test,
        models: {
          ...base.provider.test.models,
          "claude-test": {
            ...model,
            id: "claude-sonnet-4",
          },
        },
      },
    },
  }
}

describe("session prompt docs brand", () => {
  test("anthropic prompt keeps feedback URL and adds XOCP phrasing rule for docs lookup", () => {
    expect(PROMPT_ANTHROPIC).toContain(FEEDBACK)
    expect(PROMPT_ANTHROPIC).toContain(RULE)
    expect(PROMPT_ANTHROPIC).toContain("https://opencode.ai/docs")
    expect(PROMPT_ANTHROPIC).not.toContain('asks about OpenCode (eg. "can OpenCode do')
  })

  test("meta prompt keeps feedback URL and adds XOCP phrasing rule for docs lookup", () => {
    expect(PROMPT_META).toContain(FEEDBACK)
    expect(PROMPT_META).toContain(RULE)
    expect(PROMPT_META).toContain("https://opencode.ai/docs")
    expect(PROMPT_META).not.toContain('ask directly about OpenCode (eg. "can OpenCode do')
  })

  test("selected anthropic and meta provider prompts include the XOCP docs phrasing rule", () => {
    const anthropic = SystemPrompt.provider({ api: { id: "claude-sonnet-4" } } as Provider.Model)[0]
    const meta = SystemPrompt.provider({ api: { id: "muse-spark-1.1" } } as Provider.Model)[0]
    expect(anthropic).toContain(RULE)
    expect(meta).toContain(RULE)
  })

  cliIt.live(
    "anthropic session carries XOCP docs phrasing rule when user asks about XOCP hooks",
    ({ llm, opencode }) =>
      Effect.gen(function* () {
        yield* llm.text("Sim, o XOCP suporta hooks — configure-os em `.opencode/hooks/`.")
        const result = yield* opencode.run("o XOCP suporta hooks?", {
          model: "test/claude-test",
          env: { OPENCODE_CONFIG_CONTENT: JSON.stringify(claudeProviderConfig(llm.url)) },
        })
        opencode.expectExit(result, 0)
        const input = JSON.stringify(yield* llm.inputs)
        expect(input).toContain(RULE_MARKER)
        expect(input).toContain("o XOCP suporta hooks?")
        expect(result.stdout).toContain("XOCP")
        expect(result.stdout).not.toContain("o OpenCode")
      }),
    60_000,
  )
})

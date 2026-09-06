import { afterEach, describe, expect, test } from "bun:test"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { Effect, Layer } from "effect"

import PROMPT_OPENCODE from "../../src/agent/prompt/elicitador.txt"
import PROMPT_CORE from "../../../core/src/plugin/elicitador.txt"
import { Agent } from "../../src/agent/agent"
import { Auth } from "../../src/auth"
import { Config } from "../../src/config/config"
import { RuntimeFlags } from "../../src/effect/runtime-flags"
import { Plugin } from "../../src/plugin"
import { Provider } from "../../src/provider/provider"
import { Skill } from "../../src/skill"
import { disposeAllInstances } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

const RULE_24_MARKER = "Nunca abandona o propósito — sempre entrega uma Spec"
const RULE_24_BODY = "entregando uma Spec completa"
const RULE_25_MARKER = "A Spec só existe se estiver salva em arquivo"
const RULE_25_BODY = "specs/<slug>.md"

const agentLayer = (flags: Partial<RuntimeFlags.Info> = {}) =>
  LayerNode.compile(
    LayerNode.group([Agent.node, Plugin.node, Provider.node, Auth.node, Config.node, Skill.node, RuntimeFlags.node]),
    [[RuntimeFlags.node, RuntimeFlags.layer(flags)]],
  )

const it = testEffect(agentLayer())

afterEach(async () => {
  await disposeAllInstances()
})

describe("elicitador scope rules", () => {
  test("sections 2.4 and 2.5 are present in all operational prompt locations", () => {
    const prompts = [
      ["opencode agent prompt", PROMPT_OPENCODE],
      ["core plugin prompt", PROMPT_CORE],
    ] as const

    for (const [name, prompt] of prompts) {
      expect(prompt.includes(RULE_24_MARKER), `${name} §2.4 marker`).toBe(true)
      expect(prompt.includes(RULE_24_BODY), `${name} §2.4 body`).toBe(true)
      expect(prompt.includes(RULE_25_MARKER), `${name} §2.5 marker`).toBe(true)
      expect(prompt.includes(RULE_25_BODY), `${name} §2.5 body`).toBe(true)
    }
  })
})

it.instance("elicitador agent prompt includes sections 2.4 and 2.5", () =>
  Effect.gen(function* () {
    const elicitador = yield* Agent.Service.pipe(Effect.flatMap((svc) => svc.get("elicitador")))
    expect(elicitador?.prompt?.includes(RULE_24_MARKER)).toBe(true)
    expect(elicitador?.prompt?.includes(RULE_25_MARKER)).toBe(true)
    expect(elicitador?.prompt?.includes(RULE_25_BODY)).toBe(true)
  }),
)

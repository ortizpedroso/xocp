import { homedir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, test } from "bun:test"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { Effect, Layer } from "effect"

import PROMPT_OPENCODE from "../../src/agent/prompt/elicitador.txt"
import { Agent } from "../../src/agent/agent"
import { Auth } from "../../src/auth"
import { Config } from "../../src/config/config"
import { RuntimeFlags } from "../../src/effect/runtime-flags"
import { Plugin } from "../../src/plugin"
import { Provider } from "../../src/provider/provider"
import { Skill } from "../../src/skill"
import { disposeAllInstances } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

const RULE_MARKER = "Nunca abandona o propósito — sempre entrega uma Spec"
const RULE_BODY = "entregando uma Spec completa"

const agentLayer = (flags: Partial<RuntimeFlags.Info> = {}) =>
  LayerNode.compile(
    LayerNode.group([Agent.node, Plugin.node, Provider.node, Auth.node, Config.node, Skill.node, RuntimeFlags.node]),
    [[RuntimeFlags.node, RuntimeFlags.layer(flags)]],
  )

const it = testEffect(agentLayer())

afterEach(async () => {
  await disposeAllInstances()
})

describe("elicitador scope rule", () => {
  test("section 2.4 rule text is present in all operational prompt locations", async () => {
    const prompts = [
      ["opencode agent prompt", PROMPT_OPENCODE],
      [
        "core plugin prompt",
        await Bun.file(new URL("../../../core/src/plugin/elicitador.txt", import.meta.url)).text(),
      ],
      [
        "global skill prompt",
        await Bun.file(join(homedir(), ".config/opencode/skills/elicitador-spec/prompts/elicitador.md")).text(),
      ],
    ] as const

    for (const [name, prompt] of prompts) {
      expect(prompt.includes(RULE_MARKER), name).toBe(true)
      expect(prompt.includes(RULE_BODY), name).toBe(true)
    }
  })
})

it.instance("elicitador agent prompt includes the always-deliver-spec rule", () =>
  Effect.gen(function* () {
    const elicitador = yield* Agent.Service.pipe(Effect.flatMap((svc) => svc.get("elicitador")))
    expect(elicitador?.prompt?.includes(RULE_MARKER)).toBe(true)
    expect(elicitador?.prompt?.includes(RULE_BODY)).toBe(true)
  }),
)

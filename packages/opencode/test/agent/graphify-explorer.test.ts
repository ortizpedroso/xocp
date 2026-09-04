import { expect } from "bun:test"
import { Effect } from "effect"
import { Agent } from "../../src/agent/agent"
import type { Info } from "../../src/agent/agent"
import { Permission } from "../../src/permission"
import { testEffect } from "../lib/effect"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { Plugin } from "../../src/plugin"
import { Config } from "../../src/config/config"
import { Auth } from "../../src/auth"
import { Provider } from "../../src/provider/provider"
import { Skill } from "../../src/skill"
import { RuntimeFlags } from "../../src/effect/runtime-flags"

const agentLayer = LayerNode.compile(
  LayerNode.group([Agent.node, Plugin.node, Provider.node, Auth.node, Config.node, Skill.node, RuntimeFlags.node]),
)

const it = testEffect(agentLayer)

function evalPerm(agent: Info | undefined, permission: string) {
  if (!agent) return undefined
  return Permission.evaluate(permission, "*", agent.permission).action
}

it.instance("registers graphify-explorer subagent", () =>
  Effect.gen(function* () {
    const agent = yield* Agent.Service.use((svc) => svc.get("graphify-explorer"))
    expect(agent).toBeDefined()
    expect(agent?.mode).toBe("subagent")
    expect(agent?.prompt).toContain("graphify_query")
    expect(evalPerm(agent, "graphify_query")).toBe("allow")
    expect(evalPerm(agent, "edit")).toBe("deny")
    expect(evalPerm(agent, "grep")).toBe("allow")
  }),
)

it.instance("build delegates to graphify-explorer but cannot call graphify_query directly", () =>
  Effect.gen(function* () {
    const build = yield* Agent.Service.use((svc) => svc.get("build"))
    expect(build).toBeDefined()
    expect(Permission.evaluate("task", "graphify-explorer", build!.permission).action).toBe("allow")
    expect(Permission.evaluate("graphify_query", "*", build!.permission).action).toBe("deny")
  }),
)

it.instance("elicitador delegates to graphify-explorer but cannot call graphify_query directly", () =>
  Effect.gen(function* () {
    const elicitador = yield* Agent.Service.use((svc) => svc.get("elicitador"))
    expect(elicitador).toBeDefined()
    expect(Permission.evaluate("task", "graphify-explorer", elicitador!.permission).action).toBe("allow")
    expect(Permission.evaluate("graphify_query", "*", elicitador!.permission).action).toBe("deny")
  }),
)

it.instance("plan denies graphify_query and can delegate to graphify-explorer", () =>
  Effect.gen(function* () {
    const plan = yield* Agent.Service.use((svc) => svc.get("plan"))
    expect(plan).toBeDefined()
    expect(Permission.evaluate("graphify_query", "*", plan!.permission).action).toBe("deny")
    expect(Permission.evaluate("task", "graphify-explorer", plan!.permission).action).toBe("allow")
  }),
)

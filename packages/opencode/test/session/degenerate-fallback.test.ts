import { ConfigV1 } from "@opencode-ai/core/v1/config/config"
import { SessionV1 } from "@opencode-ai/core/v1/session"
import { Database } from "@opencode-ai/core/database/database"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { SessionProjector } from "@opencode-ai/core/session/projector"
import { EventV2Bridge } from "@/event-v2-bridge"
import { expect } from "bun:test"
import { Effect, Layer } from "effect"
import path from "path"
import { Agent as AgentSvc } from "../../src/agent/agent"
import { BackgroundJob } from "@/background/job"
import { Command } from "../../src/command"
import { Config } from "@/config/config"
import { LSP } from "@/lsp/lsp"
import { MCP } from "../../src/mcp"
import { Permission } from "../../src/permission"
import { Plugin } from "../../src/plugin"
import { Provider as ProviderSvc } from "@/provider/provider"
import { Env } from "../../src/env"
import { Git } from "../../src/git"
import { Image } from "../../src/image/image"
import { Question } from "../../src/question"
import { Todo } from "../../src/session/todo"
import { Session } from "@/session/session"
import { LLM } from "../../src/session/llm"
import { MessageV2 } from "../../src/session/message-v2"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { SessionCompaction } from "../../src/session/compaction"
import { SessionSummary } from "../../src/session/summary"
import { Instruction } from "../../src/session/instruction"
import { SessionProcessor } from "../../src/session/processor"
import { SessionPrompt } from "../../src/session/prompt"
import { SessionRevert } from "../../src/session/revert"
import { SessionRunState } from "../../src/session/run-state"
import { SessionStatus } from "../../src/session/status"
import { Skill } from "../../src/skill"
import { SystemPrompt } from "../../src/session/system"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import { Ripgrep } from "@opencode-ai/core/ripgrep"
import { Format } from "../../src/format"
import { ToolRegistry } from "@/tool/registry"
import { Truncate } from "@/tool/truncate"
import { TestInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"
import { raw, TestLLMServer } from "../lib/llm-server"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { ModelV2 } from "@opencode-ai/core/model"
import { degenerateFallbackFailedMessage, degenerateFallbackNotice } from "../../src/session/degenerate"

const summary = Layer.succeed(
  SessionSummary.Service,
  SessionSummary.Service.of({
    summarize: () => Effect.void,
    diff: () => Effect.succeed([]),
    computeDiff: () => Effect.succeed([]),
  }),
)

const lsp = Layer.succeed(
  LSP.Service,
  LSP.Service.of({
    init: () => Effect.void,
    status: () => Effect.succeed([]),
    hasClients: () => Effect.succeed(false),
    touchFile: () => Effect.void,
    diagnostics: () => Effect.succeed({}),
    hover: () => Effect.succeed(undefined),
    definition: () => Effect.succeed([]),
    references: () => Effect.succeed([]),
    implementation: () => Effect.succeed([]),
    documentSymbol: () => Effect.succeed([]),
    workspaceSymbol: () => Effect.succeed([]),
    prepareCallHierarchy: () => Effect.succeed([]),
    incomingCalls: () => Effect.succeed([]),
    outgoingCalls: () => Effect.succeed([]),
  }),
)

const ref = {
  providerID: ProviderV2.ID.make("test"),
  modelID: ModelV2.ID.make("test-model"),
}

const fallbackRef = {
  providerID: ProviderV2.ID.make("test"),
  modelID: ModelV2.ID.make("fallback-model"),
}

const modelDef = (id: string, name: string) => ({
  id,
  name,
  attachment: false,
  reasoning: false,
  temperature: false,
  tool_call: true,
  release_date: "2025-01-01",
  limit: { context: 100000, output: 10000 },
  cost: { input: 0, output: 0 },
  options: {},
})

const cfg = {
  provider: {
    test: {
      name: "Test",
      id: "test",
      env: [],
      npm: "@ai-sdk/openai-compatible",
      models: {
        "test-model": modelDef("test-model", "Primary Model"),
        "fallback-model": modelDef("fallback-model", "Fallback Model"),
      },
      options: {
        apiKey: "test-key",
        baseURL: "http://localhost:1/v1",
      },
    },
  },
}

function providerCfg(url: string, extra?: Partial<ConfigV1.Info>) {
  return {
    ...cfg,
    ...extra,
    provider: {
      ...cfg.provider,
      test: {
        ...cfg.provider.test,
        options: {
          ...cfg.provider.test.options,
          baseURL: url,
        },
      },
    },
  }
}

const writeText = Effect.fn("test.writeText")(function* (file: string, text: string) {
  const fs = yield* FSUtil.Service
  yield* fs.writeWithDirs(file, text)
})

const writeConfig = Effect.fn("test.writeConfig")(function* (dir: string, config: Partial<ConfigV1.Info>) {
  yield* writeText(
    path.join(dir, "opencode.json"),
    JSON.stringify({ $schema: "https://opencode.ai/config.json", ...config }),
  )
})

const useServerConfig = Effect.fn("test.useServerConfig")(function* (config: (url: string) => Partial<ConfigV1.Info>) {
  const { directory: dir } = yield* TestInstance
  const llm = yield* TestLLMServer
  yield* writeConfig(dir, config(llm.url))
  return { dir, llm }
})

const REPEAT = "degenerate-loop-phrase "

function degenerateSse() {
  return raw({
    head: [{ id: "chatcmpl-test", object: "chat.completion.chunk", choices: [{ delta: { role: "assistant" } }] }],
    tail: [
      ...Array.from({ length: 5 }, () => ({
        id: "chatcmpl-test",
        object: "chat.completion.chunk",
        choices: [{ delta: { content: REPEAT } }],
      })),
      {
        id: "chatcmpl-test",
        object: "chat.completion.chunk",
        choices: [{ delta: {}, finish_reason: "stop" }],
      },
    ],
  })
}

const testLLMServerNode = LayerNode.make({ service: TestLLMServer, layer: TestLLMServer.layer, deps: [] })

const promptRoot = LayerNode.group([
  SessionPrompt.node,
  Session.node,
  SessionProjector.node,
  MessageV2.node,
  LLM.node,
  Env.node,
  AgentSvc.node,
  Command.node,
  Permission.node,
  Plugin.node,
  Config.node,
  ProviderSvc.node,
  LSP.node,
  MCP.node,
  FSUtil.node,
  BackgroundJob.node,
  SessionStatus.node,
  SessionRunState.node,
  Database.node,
  EventV2Bridge.node,
  Question.node,
  Todo.node,
  ToolRegistry.node,
  Skill.node,
  Git.node,
  Ripgrep.node,
  Format.node,
  Truncate.node,
  SessionProcessor.node,
  Image.node,
  SessionCompaction.node,
  SessionRevert.node,
  Instruction.node,
  SystemPrompt.node,
  CrossSpawnSpawner.node,
  RuntimeFlags.node,
])

const env = LayerNode.compile(
  LayerNode.group([promptRoot, testLLMServerNode]),
  [
    [SessionSummary.node, summary],
    [LSP.node, lsp],
    [RuntimeFlags.node, RuntimeFlags.layer({ experimentalEventSystem: true })],
  ],
)

const it = testEffect(env)

it.instance("loop retries once with fallback after degenerate output", () =>
  Effect.gen(function* () {
    const { llm } = yield* useServerConfig((url) =>
      providerCfg(url, {
        experimental: { degenerate_fallback_model: "test/fallback-model" },
      }),
    )
    const prompt = yield* SessionPrompt.Service
    const sessions = yield* Session.Service
    const chat = yield* sessions.create({
      title: "Degenerate fallback",
      permission: [{ permission: "*", pattern: "*", action: "allow" }],
    })

    yield* prompt.prompt({
      sessionID: chat.id,
      agent: "build",
      model: ref,
      noReply: true,
      parts: [{ type: "text", text: "hello" }],
    })
    yield* llm.push(degenerateSse())
    yield* llm.text("recovered")

    const result = yield* prompt.loop({ sessionID: chat.id })
    expect(result.info.role).toBe("assistant")
    if (result.info.role !== "assistant") return
    const parts = result.parts.filter((part) => part.type === "text")
    const notice = degenerateFallbackNotice(
      { name: "Primary Model" } as never,
      { name: "Fallback Model" } as never,
    )

    expect(parts.some((part) => part.type === "text" && part.text.includes("repetitive pattern detected"))).toBe(true)
    expect(parts.some((part) => part.type === "text" && part.text === "recovered")).toBe(true)
    expect(parts.some((part) => part.type === "text" && part.text === notice)).toBe(true)
    expect(yield* llm.calls).toBe(2)
    expect(result.info.modelID).toBe(fallbackRef.modelID)
  }),
)

it.instance("loop stops after fallback also degenerates", () =>
  Effect.gen(function* () {
    const { llm } = yield* useServerConfig((url) =>
      providerCfg(url, {
        experimental: { degenerate_fallback_model: "test/fallback-model" },
      }),
    )
    const prompt = yield* SessionPrompt.Service
    const sessions = yield* Session.Service
    const chat = yield* sessions.create({
      title: "Degenerate fallback failure",
      permission: [{ permission: "*", pattern: "*", action: "allow" }],
    })

    yield* prompt.prompt({
      sessionID: chat.id,
      agent: "build",
      model: ref,
      noReply: true,
      parts: [{ type: "text", text: "hello" }],
    })
    yield* llm.push(degenerateSse(), degenerateSse())

    const result = yield* prompt.loop({ sessionID: chat.id })
    expect(result.info.role).toBe("assistant")
    if (result.info.role !== "assistant") return
    expect(result.info.error).toMatchObject({
      name: "DegenerateOutputError",
      data: { message: degenerateFallbackFailedMessage() },
    })
    expect(yield* llm.calls).toBe(2)
  }),
)

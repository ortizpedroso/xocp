import { SessionV1 } from "@opencode-ai/core/v1/session"
import { Database } from "@opencode-ai/core/database/database"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { EventV2Bridge } from "@/event-v2-bridge"
import { describe, expect } from "bun:test"
import { Effect, Layer, Stream } from "effect"
import { LoadAPIKeyError } from "ai"
import path from "path"
import type { Agent } from "../../src/agent/agent"
import { Provider } from "@/provider/provider"
import { Session } from "@/session/session"
import { LLM } from "../../src/session/llm"
import { MessageV2 } from "../../src/session/message-v2"
import { SessionProcessor } from "../../src/session/processor"
import { degenerateNotice } from "../../src/session/degenerate"
import { MessageID, PartID, SessionID } from "../../src/session/schema"
import { SessionStatus } from "../../src/session/status"
import { SessionSummary } from "../../src/session/summary"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import { provideTmpdirInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { ModelV2 } from "@opencode-ai/core/model"
import { SessionProjector } from "@opencode-ai/core/session/projector"
import { LLMEvent } from "@opencode-ai/llm"

const summary = Layer.succeed(
  SessionSummary.Service,
  SessionSummary.Service.of({
    summarize: () => Effect.void,
    diff: () => Effect.succeed([]),
    computeDiff: () => Effect.succeed([]),
  }),
)

const ref = {
  providerID: ProviderV2.ID.make("test"),
  modelID: ModelV2.ID.make("test-model"),
}

const refFallback = {
  providerID: ProviderV2.ID.make("test"),
  modelID: ModelV2.ID.make("test-fallback"),
}

const cfg = {
  experimental: {
    degenerate_fallback_model: "test/test-fallback",
  },
  provider: {
    test: {
      name: "Test",
      id: "test",
      env: [],
      npm: "@ai-sdk/openai-compatible",
      models: {
        "test-model": {
          id: "test-model",
          name: "Test Model",
          attachment: false,
          reasoning: false,
          temperature: false,
          tool_call: true,
          release_date: "2025-01-01",
          limit: { context: 100000, output: 10000 },
          cost: { input: 0, output: 0 },
          options: {},
        },
        "test-fallback": {
          id: "test-fallback",
          name: "Test Fallback",
          attachment: false,
          reasoning: false,
          temperature: false,
          tool_call: true,
          release_date: "2025-01-01",
          limit: { context: 100000, output: 10000 },
          cost: { input: 0, output: 0 },
          options: {},
        },
      },
      options: {
        apiKey: "test-key",
        baseURL: "http://localhost:1/v1",
      },
    },
  },
}

function agent(): Agent.Info {
  return {
    name: "build",
    mode: "primary",
    options: {},
    permission: [{ permission: "*", pattern: "*", action: "allow" }],
  }
}

const user = Effect.fn("DegenerateTest.user")(function* (sessionID: SessionID, text: string) {
  const session = yield* Session.Service
  const msg = yield* session.updateMessage({
    id: MessageID.ascending(),
    role: "user",
    sessionID,
    agent: "build",
    model: ref,
    time: { created: Date.now() },
  })
  yield* session.updatePart({
    id: PartID.ascending(),
    messageID: msg.id,
    sessionID,
    type: "text",
    text,
  })
  return msg
})

const assistant = Effect.fn("DegenerateTest.assistant")(function* (
  sessionID: SessionID,
  parentID: MessageID,
  root: string,
) {
  const session = yield* Session.Service
  const msg: SessionV1.Assistant = {
    id: MessageID.ascending(),
    role: "assistant",
    sessionID,
    mode: "build",
    agent: "build",
    path: { cwd: root, root },
    cost: 0,
    tokens: {
      total: 0,
      input: 0,
      output: 0,
      reasoning: 0,
      cache: { read: 0, write: 0 },
    },
    modelID: ref.modelID,
    providerID: ref.providerID,
    parentID,
    time: { created: Date.now() },
    finish: "end_turn",
  }
  yield* session.updateMessage(msg)
  return msg
})

const phrase = "vou executar o comando agora mesmo"

function degenerateStream() {
  return Stream.make(
    LLMEvent.stepStart({ index: 0 }),
    LLMEvent.textStart({ id: "text-1" }),
    LLMEvent.textDelta({ id: "text-1", text: `${phrase} ${phrase} ${phrase}` }),
    LLMEvent.textEnd({ id: "text-1" }),
    LLMEvent.stepFinish({ index: 0, reason: "stop" }),
    LLMEvent.finish({ reason: "stop" }),
  )
}

function healthyStream(text: string) {
  return Stream.make(
    LLMEvent.stepStart({ index: 0 }),
    LLMEvent.textStart({ id: "text-1" }),
    LLMEvent.textDelta({ id: "text-1", text }),
    LLMEvent.textEnd({ id: "text-1" }),
    LLMEvent.stepFinish({ index: 0, reason: "stop" }),
    LLMEvent.finish({ reason: "stop" }),
  )
}

function degenerateStreamWithRunningTool() {
  return Stream.make(
    LLMEvent.stepStart({ index: 0 }),
    LLMEvent.toolInputStart({ id: "call-1", name: "lookup" }),
    LLMEvent.toolInputEnd({ id: "call-1", name: "lookup" }),
    LLMEvent.toolCall({ id: "call-1", name: "lookup", input: {}, providerExecuted: true }),
    LLMEvent.textStart({ id: "text-1" }),
    LLMEvent.textDelta({ id: "text-1", text: `${phrase} ${phrase} ${phrase}` }),
    LLMEvent.textEnd({ id: "text-1" }),
    LLMEvent.stepFinish({ index: 0, reason: "stop" }),
    LLMEvent.finish({ reason: "stop" }),
  )
}

function recoveredStreamWithToolComplete() {
  return Stream.make(
    LLMEvent.stepStart({ index: 0 }),
    LLMEvent.toolResult({
      id: "call-1",
      name: "lookup",
      result: { type: "json", value: { output: "ok", title: "lookup", metadata: {} } },
      providerExecuted: true,
    }),
    LLMEvent.textStart({ id: "text-1" }),
    LLMEvent.textDelta({ id: "text-1", text: "recovered" }),
    LLMEvent.textEnd({ id: "text-1" }),
    LLMEvent.stepFinish({ index: 0, reason: "stop" }),
    LLMEvent.finish({ reason: "stop" }),
  )
}

function makeLLM(input: {
  calls: { value: number }
  mode: "degenerate-then-ok" | "degenerate-twice" | "healthy" | "degenerate-tool-then-ok" | "degenerate-then-auth-error"
}) {
  return Layer.succeed(
    LLM.Service,
    LLM.Service.of({
      stream: () => {
        input.calls.value += 1
        if (input.mode === "healthy") return healthyStream("all good")
        if (input.mode === "degenerate-then-ok") {
          return input.calls.value === 1 ? degenerateStream() : healthyStream("recovered")
        }
        if (input.mode === "degenerate-tool-then-ok") {
          return input.calls.value === 1 ? degenerateStreamWithRunningTool() : recoveredStreamWithToolComplete()
        }
        if (input.mode === "degenerate-then-auth-error") {
          if (input.calls.value === 1) return degenerateStream()
          return Stream.fail(new LoadAPIKeyError({ message: "missing api key" }))
        }
        return degenerateStream()
      },
    }),
  )
}

const root = LayerNode.group([
  SessionProcessor.node,
  Session.node,
  SessionProjector.node,
  Provider.node,
  Database.node,
  EventV2Bridge.node,
  SessionStatus.node,
  CrossSpawnSpawner.node,
])

const boot = Effect.fn("DegenerateTest.boot")(function* () {
  const processors = yield* SessionProcessor.Service
  const session = yield* Session.Service
  const provider = yield* Provider.Service
  return { processors, session, provider }
})

function streamInput(parent: SessionV1.User, sessionID: SessionID, model: Provider.Model) {
  return {
    user: parent,
    sessionID,
    model,
    agent: agent(),
    system: [],
    messages: [{ role: "user" as const, content: "hi" }],
    tools: {},
  }
}

describe("session.processor degenerate fallback", () => {
  const calls = { value: 0 }

  const env = LayerNode.compile(root, [
    [SessionSummary.node, summary],
    [RuntimeFlags.node, RuntimeFlags.layer({ experimentalEventSystem: true })],
    [LLM.node, makeLLM({ calls, mode: "degenerate-then-ok" })],
  ])

  const it = testEffect(env)

  it.live("detects degenerate output and retries once with fallback model", () =>
    provideTmpdirInstance((dir) =>
      Effect.gen(function* () {
        calls.value = 0
        const { processors, session, provider } = yield* boot()
        const chat = yield* session.create({})
        const parent = yield* user(chat.id, "hi")
        const msg = yield* assistant(chat.id, parent.id, path.resolve(dir))
        const primary = yield* provider.getModel(ref.providerID, ref.modelID)
        const fallback = yield* provider.getModel(refFallback.providerID, refFallback.modelID)
        const handle = yield* processors.create({ assistantMessage: msg, sessionID: chat.id, model: primary })
        const value = yield* handle.process(streamInput(parent, chat.id, primary))
        const parts = yield* MessageV2.parts(msg.id)
        const texts = parts.flatMap((part) => (part.type === "text" ? [part.text] : []))

        expect(value).toBe("continue")
        expect(calls.value).toBe(2)
        expect(texts.some((text) => text.includes("repetitive pattern detected"))).toBe(true)
        expect(texts.some((text) => text.includes(degenerateNotice(primary, fallback)))).toBe(true)
        expect(texts.some((text) => text === "recovered")).toBe(true)
      }),
    { config: cfg },
  ),
  )
})

describe("session.processor degenerate fallback failure", () => {
  const calls = { value: 0 }

  const env = LayerNode.compile(root, [
    [SessionSummary.node, summary],
    [RuntimeFlags.node, RuntimeFlags.layer({ experimentalEventSystem: true })],
    [LLM.node, makeLLM({ calls, mode: "degenerate-twice" })],
  ])

  const it = testEffect(env)

  it.live("stops after fallback also degenerates", () =>
    provideTmpdirInstance((dir) =>
      Effect.gen(function* () {
        calls.value = 0
        const { processors, session, provider } = yield* boot()
        const chat = yield* session.create({})
        const parent = yield* user(chat.id, "hi")
        const msg = yield* assistant(chat.id, parent.id, path.resolve(dir))
        const primary = yield* provider.getModel(ref.providerID, ref.modelID)
        const handle = yield* processors.create({ assistantMessage: msg, sessionID: chat.id, model: primary })
        const value = yield* handle.process(streamInput(parent, chat.id, primary))

        expect(value).toBe("stop")
        expect(calls.value).toBe(2)
        expect(handle.message.error?.name).toBe("UnknownError")
      }),
    { config: cfg },
  ),
  )
})

describe("session.processor degenerate happy path", () => {
  const calls = { value: 0 }

  const env = LayerNode.compile(root, [
    [SessionSummary.node, summary],
    [RuntimeFlags.node, RuntimeFlags.layer({ experimentalEventSystem: true })],
    [LLM.node, makeLLM({ calls, mode: "healthy" })],
  ])

  const it = testEffect(env)

  it.live("does not trigger fallback for normal output", () =>
    provideTmpdirInstance((dir) =>
      Effect.gen(function* () {
        calls.value = 0
        const { processors, session, provider } = yield* boot()
        const chat = yield* session.create({})
        const parent = yield* user(chat.id, "hi")
        const msg = yield* assistant(chat.id, parent.id, path.resolve(dir))
        const primary = yield* provider.getModel(ref.providerID, ref.modelID)
        const handle = yield* processors.create({ assistantMessage: msg, sessionID: chat.id, model: primary })
        const value = yield* handle.process(streamInput(parent, chat.id, primary))
        const parts = yield* MessageV2.parts(msg.id)

        expect(value).toBe("continue")
        expect(calls.value).toBe(1)
        expect(parts.some((part) => part.type === "text" && part.text.includes("Retrying with"))).toBe(false)
        expect(parts.some((part) => part.type === "text" && part.text === "all good")).toBe(true)
      }),
    { config: cfg },
  ),
  )
})

describe("session.processor degenerate fallback preserves in-flight tools", () => {
  const calls = { value: 0 }

  const env = LayerNode.compile(root, [
    [SessionSummary.node, summary],
    [RuntimeFlags.node, RuntimeFlags.layer({ experimentalEventSystem: true })],
    [LLM.node, makeLLM({ calls, mode: "degenerate-tool-then-ok" })],
  ])

  const it = testEffect(env)

  it.live("does not abort running tools or complete the message before fallback finishes", () =>
    provideTmpdirInstance((dir) =>
      Effect.gen(function* () {
        calls.value = 0
        const { processors, session, provider } = yield* boot()
        const chat = yield* session.create({})
        const parent = yield* user(chat.id, "hi")
        const msg = yield* assistant(chat.id, parent.id, path.resolve(dir))
        const primary = yield* provider.getModel(ref.providerID, ref.modelID)
        const fallback = yield* provider.getModel(refFallback.providerID, refFallback.modelID)
        const handle = yield* processors.create({ assistantMessage: msg, sessionID: chat.id, model: primary })
        const value = yield* handle.process(streamInput(parent, chat.id, primary))
        const parts = yield* MessageV2.parts(msg.id)
        const notice = parts.find(
          (part): part is Extract<typeof part, { type: "text" }> =>
            part.type === "text" && part.text.includes(degenerateNotice(primary, fallback)),
        )
        const tool = parts.find(
          (part): part is Extract<typeof part, { type: "tool" }> => part.type === "tool" && part.callID === "call-1",
        )

        expect(value).toBe("continue")
        expect(calls.value).toBe(2)
        expect(tool?.state.status).toBe("completed")
        expect(
          parts.some(
            (part) =>
              part.type === "tool" &&
              part.state.status === "error" &&
              part.state.error === "Tool execution aborted",
          ),
        ).toBe(false)
        expect(handle.message.time.completed).toBeDefined()
        expect(notice?.time?.end).toBeDefined()
        expect(handle.message.time.completed).toBeGreaterThan(notice?.time?.end ?? 0)
      }),
    { config: cfg },
  ),
  )
})

const refPrimary = {
  providerID: ProviderV2.ID.make("test-primary"),
  modelID: ModelV2.ID.make("test-model"),
}

const refFallbackProvider = {
  providerID: ProviderV2.ID.make("test-fallback"),
  modelID: ModelV2.ID.make("test-fallback"),
}

const cfgWithFallbackProvider = {
  experimental: {
    degenerate_fallback_model: "test-fallback/test-fallback",
  },
  provider: {
    "test-primary": {
      name: "Test Primary",
      id: "test-primary",
      env: [],
      npm: "@ai-sdk/openai-compatible",
      models: {
        "test-model": {
          id: "test-model",
          name: "Test Model",
          attachment: false,
          reasoning: false,
          temperature: false,
          tool_call: true,
          release_date: "2025-01-01",
          limit: { context: 100000, output: 10000 },
          cost: { input: 0, output: 0 },
          options: {},
        },
      },
      options: {
        apiKey: "test-key",
        baseURL: "http://localhost:1/v1",
      },
    },
    "test-fallback": {
      name: "Test Fallback",
      id: "test-fallback",
      env: [],
      npm: "@ai-sdk/openai-compatible",
      models: {
        "test-fallback": {
          id: "test-fallback",
          name: "Test Fallback",
          attachment: false,
          reasoning: false,
          temperature: false,
          tool_call: true,
          release_date: "2025-01-01",
          limit: { context: 100000, output: 10000 },
          cost: { input: 0, output: 0 },
          options: {},
        },
      },
      options: {
        apiKey: "test-key",
        baseURL: "http://localhost:2/v1",
      },
    },
  },
}

describe("session.processor degenerate fallback provider attribution", () => {
  const calls = { value: 0 }

  const env = LayerNode.compile(root, [
    [SessionSummary.node, summary],
    [RuntimeFlags.node, RuntimeFlags.layer({ experimentalEventSystem: true })],
    [LLM.node, makeLLM({ calls, mode: "degenerate-then-auth-error" })],
  ])

  const it = testEffect(env)

  it.live("attributes fallback provider errors to the fallback model", () =>
    provideTmpdirInstance((dir) =>
      Effect.gen(function* () {
        calls.value = 0
        const { processors, session, provider } = yield* boot()
        const chat = yield* session.create({})
        const parent = yield* user(chat.id, "hi")
        const msg = yield* assistant(chat.id, parent.id, path.resolve(dir))
        const primary = yield* provider.getModel(refPrimary.providerID, refPrimary.modelID)
        const handle = yield* processors.create({ assistantMessage: msg, sessionID: chat.id, model: primary })
        const value = yield* handle.process(streamInput(parent, chat.id, primary))

        expect(value).toBe("stop")
        expect(calls.value).toBe(2)
        expect(handle.message.error?.name).toBe("ProviderAuthError")
        if (handle.message.error?.name !== "ProviderAuthError") return
        expect(handle.message.error.data.providerID).toBe(refFallbackProvider.providerID)
      }),
    { config: cfgWithFallbackProvider },
  ),
  )
})

/**
 * Proves the analista prompt's mandatory research flow drives domain-split
 * behavior instead of a single mixed-domain brief, via TestLLMServer +
 * SessionPrompt.loop.
 */
import { describe, expect } from "bun:test"
import { SessionV1 } from "@opencode-ai/core/v1/session"
import { Database } from "@opencode-ai/core/database/database"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import { SessionProjector } from "@opencode-ai/core/session/projector"
import { Effect, Layer } from "effect"
import { Session } from "@/session/session"
import { SessionPrompt } from "../../src/session/prompt"
import { SessionSummary } from "../../src/session/summary"
import { MessageV2 } from "../../src/session/message-v2"
import { LSP } from "@/lsp/lsp"
import { MCP } from "../../src/mcp"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { provideTmpdirServer } from "../fixture/fixture"
import { testEffect } from "../lib/effect"
import { reply, TestLLMServer } from "../lib/llm-server"

type Hit = { body: Record<string, unknown> }

const ANALISTA_RULE_MARKERS = [
  "CORTE O ESCOPO PRA UM DOMÍNIO SÓ",
  "proponha dividir, não misturar num ciclo só",
]

const MULTI_DOMAIN_TASK =
  "Implemente login: crie a tabela de sessão no banco (core), a tela de login (UI) " +
  "e o evento de telemetria de login bem-sucedido (telemetria) — tudo num ciclo só."

const mcp = Layer.succeed(
  MCP.Service,
  MCP.Service.of({
    status: () => Effect.succeed({}),
    clients: () => Effect.succeed({}),
    instructions: () => Effect.succeed([]),
    tools: () => Effect.succeed({}),
    prompts: () => Effect.succeed({}),
    resources: () => Effect.succeed({}),
    resourceTemplates: () => Effect.succeed({}),
    add: () => Effect.succeed({ status: { status: "disabled" as const } }),
    connect: () => Effect.void,
    disconnect: () => Effect.void,
    getPrompt: () => Effect.succeed(undefined),
    readResource: () => Effect.succeed(undefined),
    startAuth: () => Effect.die("unexpected MCP auth"),
    authenticate: () => Effect.die("unexpected MCP auth"),
    finishAuth: () => Effect.die("unexpected MCP auth"),
    removeAuth: () => Effect.void,
    supportsOAuth: () => Effect.succeed(false),
    hasStoredTokens: () => Effect.succeed(false),
    getAuthStatus: () => Effect.succeed("not_authenticated" as const),
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

const summary = Layer.succeed(
  SessionSummary.Service,
  SessionSummary.Service.of({
    summarize: () => Effect.void,
    diff: () => Effect.succeed([]),
    computeDiff: () => Effect.succeed([]),
  }),
)

const root = LayerNode.group([
  SessionPrompt.node,
  Session.node,
  SessionProjector.node,
  Database.node,
  CrossSpawnSpawner.node,
  LayerNode.make({ service: TestLLMServer, layer: TestLLMServer.layer, deps: [] }),
])

const it = testEffect(
  LayerNode.compile(root, [
    [MCP.node, mcp],
    [LSP.node, lsp],
    [SessionSummary.node, summary],
    [RuntimeFlags.node, RuntimeFlags.layer({ experimentalEventSystem: true })],
  ]),
)

const providerCfg = (url: string) => ({
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
      },
      options: {
        apiKey: "test-key",
        baseURL: url,
      },
    },
  },
})

function bodyText(hit: Hit) {
  return JSON.stringify(hit.body)
}

function hasAnalistaRules(hit: Hit) {
  const body = bodyText(hit)
  return ANALISTA_RULE_MARKERS.every((marker) => body.includes(marker))
}

function promptPresent(hits: Hit[], check: (hit: Hit) => boolean) {
  return hits.some((hit) => check(hit))
}

const scheduleAnalistaResponses = Effect.fn("AnalistaPromptTest.scheduleAnalistaResponses")(function* (
  llm: TestLLMServer["Service"],
) {
  yield* llm.pushMatch(
    (hit) => hasAnalistaRules(hit),
    reply()
      .text(
        "Essa tarefa cruza três domínios arquiteturais (core, UI, telemetria) — proponho dividir em " +
          "três branches/briefs separados (um por domínio) em vez de especificar tudo num ciclo só.",
      )
      .stop()
      .item(),
  )
})

describe("analista prompt following (TestLLMServer)", () => {
  it.live("proposes splitting a multi-domain task instead of one mixed brief", () =>
    provideTmpdirServer(
      Effect.fnUntraced(function* ({ llm }) {
        yield* scheduleAnalistaResponses(llm)

        const prompt = yield* SessionPrompt.Service
        const sessions = yield* Session.Service
        const session = yield* sessions.create({
          title: "analista login multi-domínio",
          permission: [{ permission: "*", pattern: "*", action: "allow" }],
        })

        yield* prompt.prompt({
          sessionID: session.id,
          agent: "analista",
          noReply: true,
          parts: [{ type: "text", text: MULTI_DOMAIN_TASK }],
        })

        yield* prompt.loop({ sessionID: session.id })

        const hits = yield* llm.hits
        expect(promptPresent(hits, hasAnalistaRules)).toBe(true)

        const msgs = yield* MessageV2.filterCompactedEffect(session.id)
        const toolCalls = msgs
          .flatMap((msg) => msg.parts)
          .filter(
            (part): part is SessionV1.ToolPart & { state: SessionV1.ToolStateCompleted } =>
              part.type === "tool" && part.state.status === "completed",
          )
        expect(toolCalls).toEqual([])

        const assistantTexts = msgs
          .filter((msg) => msg.info.role === "assistant")
          .flatMap((msg) => msg.parts)
          .filter((part) => part.type === "text")
          .map((part) => part.text)

        expect(assistantTexts.some((text) => text.includes("dividir"))).toBe(true)
        expect(assistantTexts.some((text) => text.includes("core, UI, telemetria"))).toBe(true)
      }),
      { git: true, config: providerCfg },
    ),
  )
})

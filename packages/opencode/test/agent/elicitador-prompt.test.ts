/**
 * Proves elicitador prompt rules drive continuation after competitor research
 * and early spec persistence via TestLLMServer + SessionPrompt.loop.
 */
import { describe, expect } from "bun:test"
import { SessionV1 } from "@opencode-ai/core/v1/session"
import { Database } from "@opencode-ai/core/database/database"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import { SessionProjector } from "@opencode-ai/core/session/projector"
import { Effect, Layer } from "effect"
import fs from "fs/promises"
import path from "path"
import { Session } from "@/session/session"
import { SessionPrompt } from "../../src/session/prompt"
import { SessionSummary } from "../../src/session/summary"
import { MessageV2 } from "../../src/session/message-v2"
import { SessionID } from "../../src/session/schema"
import { LSP } from "@/lsp/lsp"
import { MCP } from "../../src/mcp"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { provideTmpdirServer } from "../fixture/fixture"
import { testEffect } from "../lib/effect"
import { reply, TestLLMServer } from "../lib/llm-server"

type Hit = { body: Record<string, unknown> }
type CompletedToolPart = SessionV1.ToolPart & { state: SessionV1.ToolStateCompleted }

const ELICITADOR_RULE_MARKERS = [
  "Nunca abandona o propósito — sempre entrega uma Spec",
  "A Spec só existe se estiver salva em arquivo",
  "specs/<slug>.md",
]

const SPEC_PATH = "specs/agendamento.md"
const SPEC_DRAFT = `# Spec — Sistema de Agendamento

## Objetivo
Agendar consultas online.

## Status
rascunho
`

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

function hasElicitadorRules(hit: Hit) {
  const body = bodyText(hit)
  return ELICITADOR_RULE_MARKERS.every((marker) => body.includes(marker))
}

function conversationHas(hit: Hit, token: string) {
  return bodyText(hit).includes(token)
}

function promptPresent(hits: Hit[], check: (hit: Hit) => boolean) {
  return hits.some((hit) => check(hit))
}

const completedToolTranscript = Effect.fn("ElicitadorPromptTest.completedToolTranscript")(function* (
  sessionID: SessionID,
) {
  const msgs = yield* MessageV2.filterCompactedEffect(sessionID)
  return msgs
    .flatMap((msg) => msg.parts)
    .filter(
      (part): part is CompletedToolPart => part.type === "tool" && part.state.status === "completed",
    )
    .map((part) => ({
      tool: part.tool,
      title: part.state.title,
      output: part.state.output,
    }))
})

const scheduleElicitadorResponses = Effect.fn("ElicitadorPromptTest.scheduleElicitadorResponses")(function* (
  llm: TestLLMServer["Service"],
  input: { specPath: string; specContent: string },
) {
  let gatedTurn = 0
  const gatedAt = (hit: Hit, turn: number) => {
    if (!hasElicitadorRules(hit)) return false
    const matches = gatedTurn === turn
    if (matches) gatedTurn++
    return matches
  }

  yield* llm.pushMatch(
    (hit) => gatedAt(hit, 0),
    reply()
      .text(
        "Existem produtos prontos no mercado que cobrem parte disso, mas vou continuar a elicitação para entregar a Spec completa.",
      )
      .item(),
  )
  yield* llm.pushMatch(
    (hit) => gatedAt(hit, 1),
    reply().tool("write", { filePath: input.specPath, content: input.specContent }).item(),
  )
  yield* llm.pushMatch(
    (hit) => gatedAt(hit, 2),
    reply().text("[só-usuário-sabe] Quantas unidades o sistema precisa atender no primeiro ano?").stop().item(),
  )
  yield* llm.pushMatch(
    (hit) => !hasElicitadorRules(hit) && !conversationHas(hit, "não construa"),
    reply().text("Recomendo não construir — use um produto pronto do mercado.").stop().item(),
  )
})

describe("elicitador prompt following (TestLLMServer)", () => {
  it.live("continues elicitation and writes spec file after competitor mention", () =>
    provideTmpdirServer(
      Effect.fnUntraced(function* ({ dir, llm }) {
        const specPath = path.join(dir, SPEC_PATH)
        yield* Effect.promise(() => fs.mkdir(path.dirname(specPath), { recursive: true }))
        yield* scheduleElicitadorResponses(llm, { specPath, specContent: SPEC_DRAFT })

        const prompt = yield* SessionPrompt.Service
        const sessions = yield* Session.Service
        const session = yield* sessions.create({
          title: "elicitador agendamento",
          permission: [{ permission: "*", pattern: "*", action: "allow" }],
        })

        yield* prompt.prompt({
          sessionID: session.id,
          agent: "elicitador",
          noReply: true,
          parts: [{ type: "text", text: "Quero criar um sistema de agendamento para clínicas." }],
        })

        yield* prompt.loop({ sessionID: session.id })

        const hits = yield* llm.hits
        expect(promptPresent(hits, hasElicitadorRules)).toBe(true)

        const transcript = yield* completedToolTranscript(session.id)
        expect(transcript.map((entry) => entry.tool)).toEqual(["write"])

        const written = yield* Effect.promise(() => fs.readFile(specPath, "utf-8"))
        expect(written).toContain("Sistema de Agendamento")
        expect(written).toContain("rascunho")

        const assistantTexts = yield* MessageV2.filterCompactedEffect(session.id).pipe(
          Effect.map((msgs) =>
            msgs
              .filter((msg) => msg.info.role === "assistant")
              .flatMap((msg) => msg.parts)
              .filter((part) => part.type === "text")
              .map((part) => part.text),
          ),
        )
        expect(assistantTexts.some((text) => text.includes("produtos prontos"))).toBe(true)
        expect(assistantTexts.some((text) => text.includes("não construa"))).toBe(false)
        expect(assistantTexts.some((text) => text.includes("[só-usuário-sabe]"))).toBe(true)
      }),
      { git: true, config: providerCfg },
    ),
  )
})

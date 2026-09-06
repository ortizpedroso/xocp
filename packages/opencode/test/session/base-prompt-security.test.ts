/**
 * Proves the six locked security rules in base agent prompts reach the build
 * agent system prompt without formal elicitation. TestLLMServer scripts secure
 * vs insecure login implementations based on whether rules are present.
 */
import { describe, expect } from "bun:test"
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
import { LSP } from "@/lsp/lsp"
import { MCP } from "../../src/mcp"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { ModelV2 } from "@opencode-ai/core/model"
import { provideTmpdirServer } from "../fixture/fixture"
import { testEffect } from "../lib/effect"
import { reply, TestLLMServer } from "../lib/llm-server"

type Hit = { body: Record<string, unknown> }

const SECURITY_RULE_MARKERS = ["Padrão mínimo de segurança", "Hash de senha correto", "nunca vazam detalhe interno"]

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
        "claude-sonnet-test": {
          id: "claude-sonnet-test",
          name: "Claude Test Model",
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

function hasMarkers(hit: Hit, markers: string[]) {
  const body = bodyText(hit)
  return markers.every((marker) => body.includes(marker))
}

function hasSecurityRules(hit: Hit) {
  return hasMarkers(hit, SECURITY_RULE_MARKERS)
}

function shouldFollowSecurityRules(hit: Hit) {
  if (hasSecurityRules(hit)) return true
  return bodyText(hit).includes("bcrypt.compare")
}

function promptPresent(hits: Hit[], check: (hit: Hit) => boolean) {
  return hits.some((hit) => check(hit))
}

const scheduleBuildLoginResponses = Effect.fn("BasePromptSecurityTest.scheduleBuildLoginResponses")(function* (
  llm: TestLLMServer["Service"],
  filePath: string,
) {
  const secure = `import bcrypt from "bcrypt"

export async function login(email: string, password: string) {
  const user = await findUser(email)
  if (!user) return { ok: false, error: "Invalid credentials" }
  const match = await bcrypt.compare(password, user.passwordHash)
  if (!match) return { ok: false, error: "Invalid credentials" }
  return { ok: true, userId: user.id }
}
`
  const insecure = `export async function login(email: string, password: string) {
  const user = await findUser(email)
  if (!user || user.password !== password) {
    throw new Error(user?.dbError ?? "login failed")
  }
  return { ok: true, userId: user.id }
}
`
  yield* llm.pushMatch(
    (hit) => shouldFollowSecurityRules(hit) && !bodyText(hit).includes("bcrypt.compare"),
    reply().tool("write", { filePath, content: secure }).item(),
  )
  yield* llm.pushMatch(
    (hit) => shouldFollowSecurityRules(hit) && bodyText(hit).includes("bcrypt.compare"),
    reply().text("login implemented with hashed passwords and safe errors").stop().item(),
  )
  yield* llm.pushMatch(
    (hit) => !shouldFollowSecurityRules(hit) && !bodyText(hit).includes("user.password !== password"),
    reply().tool("write", { filePath, content: insecure }).item(),
  )
  yield* llm.pushMatch(
    (hit) => !shouldFollowSecurityRules(hit) && bodyText(hit).includes("user.password !== password"),
    reply().text("login implemented quickly").stop().item(),
  )
})

const claudeModel = {
  providerID: ProviderV2.ID.make("test"),
  modelID: ModelV2.ID.make("claude-sonnet-test"),
}

describe("base prompt security rules (build agent)", () => {
  it.live("build agent system prompt includes security rules without elicitation", () =>
    provideTmpdirServer(
      Effect.fnUntraced(function* ({ dir, llm }) {
        const loginPath = path.join(dir, "src", "auth", "login.ts")
        yield* Effect.promise(() => fs.mkdir(path.dirname(loginPath), { recursive: true }))
        yield* scheduleBuildLoginResponses(llm, loginPath)

        const prompt = yield* SessionPrompt.Service
        const sessions = yield* Session.Service
        const session = yield* sessions.create({
          title: "build login security",
          permission: [{ permission: "*", pattern: "*", action: "allow" }],
        })

        yield* prompt.prompt({
          sessionID: session.id,
          agent: "build",
          model: claudeModel,
          noReply: true,
          parts: [{ type: "text", text: "Implement a simple login endpoint for this project." }],
        })

        yield* prompt.loop({ sessionID: session.id })

        const hits = yield* llm.hits
        expect(promptPresent(hits, hasSecurityRules)).toBe(true)

        const written = yield* Effect.promise(() => fs.readFile(loginPath, "utf-8"))
        expect(written).toContain("bcrypt.compare")
        expect(written).not.toContain("user.password !== password")
        expect(written).toContain("Invalid credentials")
        expect(written).not.toContain("dbError")
      }),
      { git: true, config: providerCfg },
    ),
  )
})

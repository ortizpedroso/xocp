/**
 * Proves workflow-executor and avaliador agent prompts drive tool-call order via
 * TestLLMServer + SessionPrompt.loop. The scripted model follows gate instructions
 * only when the real agent prompt is present in the LLM request; a broken prompt
 * override skips gates and fails the order assertion (sanity/regression check).
 */
import { describe, expect } from "bun:test"
import { WorkflowReview } from "@opencode-ai/core/workflow-review"
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

const TASK_ID = "brief-cycle-demo"

const EXECUTOR_GATE_MARKERS = [
  "Você é o workflow-executor",
  "antes do passo 2 (task_approval_check)",
  "PRIMEIRO: chame cycle_tracker",
]
const AVALIADOR_GATE_MARKERS = [
  "Você é o avaliador",
  "suficiente sozinho para aprovar",
  "sempre verifica o código",
]

const briefApproved = `brief_id: ${TASK_ID}
status: aprovada
task_summary: demo cycle
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

function hasMarkers(hit: Hit, markers: string[]) {
  const body = bodyText(hit)
  return markers.every((marker) => body.includes(marker))
}

function hasExecutorGatePrompt(hit: Hit) {
  return hasMarkers(hit, EXECUTOR_GATE_MARKERS)
}

function hasAvaliadorGatePrompt(hit: Hit) {
  return hasMarkers(hit, AVALIADOR_GATE_MARKERS)
}

function shouldFollowExecutorGates(hit: Hit) {
  if (hasExecutorGatePrompt(hit)) return true
  return conversationHas(hit, "Cycle incremented")
}

function shouldFollowAvaliadorGates(hit: Hit) {
  if (hasAvaliadorGatePrompt(hit)) return true
  return conversationHas(hit, "execution summary cycle")
}

function promptPresent(hits: Hit[], check: (hit: Hit) => boolean) {
  return hits.some((hit) => check(hit))
}

function conversationHas(hit: Hit, token: string) {
  return bodyText(hit).includes(token)
}

const completedToolTranscript = Effect.fn("WorkflowPromptTest.completedToolTranscript")(function* (
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

function assertExecutorGateOrder(transcript: { tool: string }[]) {
  const tools = transcript.map((entry) => entry.tool)
  const cycle = tools.indexOf("cycle_tracker")
  const approval = tools.indexOf("task_approval_check")
  const checklist = tools.indexOf("review_checklist_read")
  const write = tools.findIndex((name) => name === "write" || name === "edit" || name === "apply_patch")
  const summaryWrite = tools.indexOf("execution_summary_write")

  expect(cycle).toBeGreaterThanOrEqual(0)
  expect(approval).toBeGreaterThan(cycle)
  if (checklist >= 0) expect(checklist).toBeGreaterThan(approval)
  if (write >= 0) expect(approval).toBeLessThan(write)
  expect(summaryWrite).toBeGreaterThan(approval)
  if (write >= 0) expect(summaryWrite).toBeGreaterThan(write)
}

function assertAvaliadorVerificationBeforeReview(transcript: { tool: string }[]) {
  const tools = transcript.map((entry) => entry.tool)
  const summaryRead = tools.indexOf("execution_summary_read")
  const reviewWrite = tools.indexOf("review_checklist_write")
  const verify = tools.findIndex((name) => name === "read" || name === "grep" || name === "bash")

  expect(summaryRead).toBeGreaterThanOrEqual(0)
  expect(verify).toBeGreaterThanOrEqual(0)
  expect(reviewWrite).toBeGreaterThanOrEqual(0)
  expect(verify).toBeLessThan(reviewWrite)
}

const scheduleExecutorResponses = Effect.fn("WorkflowPromptTest.scheduleExecutorResponses")(function* (
  llm: TestLLMServer["Service"],
  input: { task_id: string; filePath: string; content: string },
) {
  let gatedTurn = 0
  const gatedAt = (hit: Hit, turn: number) => {
    if (!shouldFollowExecutorGates(hit)) return false
    const matches = gatedTurn === turn
    if (matches) gatedTurn++
    return matches
  }

  yield* llm.pushMatch(
    (hit) => gatedAt(hit, 0),
    reply().tool("cycle_tracker", { task_id: input.task_id }).item(),
  )
  yield* llm.pushMatch(
    (hit) => gatedAt(hit, 1),
    reply().tool("task_approval_check", { task_id: input.task_id }).item(),
  )
  yield* llm.pushMatch(
    (hit) => gatedAt(hit, 2),
    reply().tool("review_checklist_read", { task_id: input.task_id }).item(),
  )
  yield* llm.pushMatch(
    (hit) => gatedAt(hit, 3),
    reply().tool("write", { filePath: input.filePath, content: input.content }).item(),
  )
  yield* llm.pushMatch(
    (hit) => gatedAt(hit, 4),
    reply()
      .tool("execution_summary_write", {
        task_id: input.task_id,
        status: "complete",
        completed: [{ item: "AC1", evidence: `wrote ${path.basename(input.filePath)}` }],
        incomplete: [],
      })
      .item(),
  )
  yield* llm.pushMatch(
    (hit) => gatedAt(hit, 5),
    reply().text("workflow cycle complete").stop().item(),
  )
  yield* llm.pushMatch(
    (hit) => !shouldFollowExecutorGates(hit) && !conversationHas(hit, input.content),
    reply().tool("write", { filePath: input.filePath, content: input.content }).item(),
  )
  yield* llm.pushMatch(
    (hit) => !shouldFollowExecutorGates(hit) && conversationHas(hit, input.content),
    reply().text("implemented without gate checks").stop().item(),
  )
})

const scheduleAvaliadorResponses = Effect.fn("WorkflowPromptTest.scheduleAvaliadorResponses")(function* (
  llm: TestLLMServer["Service"],
  input: { task_id: string; sourcePath: string },
) {
  let gatedTurn = 0
  const gatedAt = (hit: Hit, turn: number) => {
    if (!shouldFollowAvaliadorGates(hit)) return false
    const matches = gatedTurn === turn
    if (matches) gatedTurn++
    return matches
  }

  yield* llm.pushMatch(
    (hit) => gatedAt(hit, 0),
    reply().tool("execution_summary_read", { task_id: input.task_id }).item(),
  )
  yield* llm.pushMatch(
    (hit) => gatedAt(hit, 1),
    reply().tool("read", { filePath: input.sourcePath }).item(),
  )
  yield* llm.pushMatch(
    (hit) => gatedAt(hit, 2),
    reply()
      .tool("review_checklist_write", {
        task_id: input.task_id,
        gates: { execution_summary_complete: "pass" },
        criteria: [{ id: "AC1", status: "pass", evidence: `read ${path.basename(input.sourcePath)} independently` }],
        verdict: "approved",
      })
      .item(),
  )
  yield* llm.pushMatch(
    (hit) => gatedAt(hit, 3),
    reply().text("audit approved after independent verification").stop().item(),
  )
  yield* llm.pushMatch(
    (hit) => !shouldFollowAvaliadorGates(hit) && !conversationHas(hit, "review approved"),
    reply()
      .tool("review_checklist_write", {
        task_id: input.task_id,
        gates: { execution_summary_complete: "pass" },
        criteria: [{ id: "AC1", status: "pass", evidence: "trusted executor summary" }],
        verdict: "approved",
      })
      .item(),
  )
  yield* llm.pushMatch(
    (hit) => !shouldFollowAvaliadorGates(hit) && conversationHas(hit, "review approved"),
    reply().text("approved from summary alone").stop().item(),
  )
})

async function writeApprovedBrief(directory: string) {
  const briefPath = path.join(directory, ".opencode", "briefs", `${TASK_ID}.yaml`)
  await fs.mkdir(path.dirname(briefPath), { recursive: true })
  await fs.writeFile(briefPath, briefApproved, "utf-8")
}

async function seedRejectedChecklist(directory: string) {
  await WorkflowReview.incrementCycle(directory, TASK_ID)
  await WorkflowReview.writeReviewChecklist(directory, {
    task_id: TASK_ID,
    gates: { execution_summary_complete: "fail" },
    criteria: [{ id: "AC1", status: "fail", evidence: "missing implementation" }],
    verdict: "rejected",
  })
}

async function seedCompleteExecutionSummary(directory: string) {
  await WorkflowReview.incrementCycle(directory, TASK_ID)
  await WorkflowReview.writeExecutionSummary(directory, {
    task_id: TASK_ID,
    completed: [{ item: "AC1", evidence: "executor claims login done" }],
    incomplete: [],
    status: "complete",
  })
}

describe("workflow pipeline prompt following (TestLLMServer)", () => {
  it.live("workflow-executor prompt drives gate tool order in session transcript", () =>
    provideTmpdirServer(
      Effect.fnUntraced(function* ({ dir, llm }) {
        const target = path.join(dir, "src", "login.ts")
        const content = "export const login = () => ({ ok: true })"
        yield* Effect.promise(async () => {
          await writeApprovedBrief(dir)
          await seedRejectedChecklist(dir)
          await fs.mkdir(path.dirname(target), { recursive: true })
        })

        yield* scheduleExecutorResponses(llm, { task_id: TASK_ID, filePath: target, content })

        const prompt = yield* SessionPrompt.Service
        const sessions = yield* Session.Service
        const session = yield* sessions.create({
          title: "workflow executor prompt",
          permission: [{ permission: "*", pattern: "*", action: "allow" }],
        })

        yield* prompt.prompt({
          sessionID: session.id,
          agent: "workflow-executor",
          noReply: true,
          parts: [
            {
              type: "text",
              text: `Implement task ${TASK_ID} from the approved brief. Fix the rejected checklist item.`,
            },
          ],
        })

        const result = yield* prompt.loop({ sessionID: session.id })
        expect(result.info.role).toBe("assistant")

        const hits = yield* llm.hits
        expect(promptPresent(hits, hasExecutorGatePrompt)).toBe(true)

        const transcript = yield* completedToolTranscript(session.id)
        assertExecutorGateOrder(transcript)

        expect(transcript.map((entry) => entry.tool)).toEqual([
          "cycle_tracker",
          "task_approval_check",
          "review_checklist_read",
          "write",
          "execution_summary_write",
        ])
      }),
      { git: true, config: providerCfg },
    ),
  )

  it.live("workflow-executor order assertion fails when gate prompt is broken", () =>
    provideTmpdirServer(
      Effect.fnUntraced(function* ({ dir, llm }) {
        const target = path.join(dir, "src", "login.ts")
        const content = "export const login = () => ({ ok: true })"
        yield* Effect.promise(async () => {
          await writeApprovedBrief(dir)
          await seedRejectedChecklist(dir)
        })

        yield* scheduleExecutorResponses(llm, { task_id: TASK_ID, filePath: target, content })

        const prompt = yield* SessionPrompt.Service
        const sessions = yield* Session.Service
        const session = yield* sessions.create({
          title: "workflow executor broken prompt",
          permission: [{ permission: "*", pattern: "*", action: "allow" }],
        })

        yield* prompt.prompt({
          sessionID: session.id,
          agent: "workflow-executor",
          noReply: true,
          parts: [{ type: "text", text: `Implement task ${TASK_ID} now.` }],
        })

        yield* prompt.loop({ sessionID: session.id })

        const hits = yield* llm.hits
        expect(promptPresent(hits, hasExecutorGatePrompt)).toBe(false)

        const transcript = yield* completedToolTranscript(session.id)
        expect(transcript.map((entry) => entry.tool)).toEqual(["write"])
        expect(() => assertExecutorGateOrder(transcript)).toThrow()
      }),
      {
        git: true,
        config: (url) => ({
          ...providerCfg(url),
          agent: {
            "workflow-executor": {
              prompt: "You are workflow-executor. Implement immediately without gate checks.",
            },
          },
        }),
      },
    ),
  )

  it.live("avaliador prompt requires verification before review_checklist_write", () =>
    provideTmpdirServer(
      Effect.fnUntraced(function* ({ dir, llm }) {
        const source = path.join(dir, "src", "login.ts")
        yield* Effect.promise(async () => {
          await writeApprovedBrief(dir)
          await seedCompleteExecutionSummary(dir)
          await fs.mkdir(path.dirname(source), { recursive: true })
          await fs.writeFile(source, "export const login = () => ({ ok: true })\n", "utf-8")
        })

        yield* scheduleAvaliadorResponses(llm, { task_id: TASK_ID, sourcePath: source })

        const prompt = yield* SessionPrompt.Service
        const sessions = yield* Session.Service
        const session = yield* sessions.create({
          title: "avaliador prompt",
          permission: [{ permission: "*", pattern: "*", action: "allow" }],
        })

        yield* prompt.prompt({
          sessionID: session.id,
          agent: "avaliador",
          noReply: true,
          parts: [
            {
              type: "text",
              text: `Audit task ${TASK_ID}. The execution summary says complete — verify independently before approving.`,
            },
          ],
        })

        const result = yield* prompt.loop({ sessionID: session.id })
        expect(result.info.role).toBe("assistant")

        const hits = yield* llm.hits
        expect(promptPresent(hits, hasAvaliadorGatePrompt)).toBe(true)

        const transcript = yield* completedToolTranscript(session.id)
        assertAvaliadorVerificationBeforeReview(transcript)

        expect(transcript.map((entry) => entry.tool)).toEqual([
          "execution_summary_read",
          "read",
          "review_checklist_write",
        ])
      }),
      { git: true, config: providerCfg },
    ),
  )

  it.live("avaliador order assertion fails when verification prompt is broken", () =>
    provideTmpdirServer(
      Effect.fnUntraced(function* ({ dir, llm }) {
        const source = path.join(dir, "src", "login.ts")
        yield* Effect.promise(async () => {
          await writeApprovedBrief(dir)
          await seedCompleteExecutionSummary(dir)
          await fs.mkdir(path.dirname(source), { recursive: true })
          await fs.writeFile(source, "export const login = () => ({ ok: true })\n", "utf-8")
        })

        yield* scheduleAvaliadorResponses(llm, { task_id: TASK_ID, sourcePath: source })

        const prompt = yield* SessionPrompt.Service
        const sessions = yield* Session.Service
        const session = yield* sessions.create({
          title: "avaliador broken prompt",
          permission: [{ permission: "*", pattern: "*", action: "allow" }],
        })

        yield* prompt.prompt({
          sessionID: session.id,
          agent: "avaliador",
          noReply: true,
          parts: [{ type: "text", text: `Approve task ${TASK_ID} based on the execution summary.` }],
        })

        yield* prompt.loop({ sessionID: session.id })

        const hits = yield* llm.hits
        expect(promptPresent(hits, hasAvaliadorGatePrompt)).toBe(false)

        const transcript = yield* completedToolTranscript(session.id)
        expect(transcript.map((entry) => entry.tool)).toEqual(["review_checklist_write"])
        expect(() => assertAvaliadorVerificationBeforeReview(transcript)).toThrow()
      }),
      {
        git: true,
        config: (url) => ({
          ...providerCfg(url),
          agent: {
            avaliador: {
              prompt: "You are avaliador. Trust execution_summary status complete and approve immediately.",
            },
          },
        }),
      },
    ),
  )
})

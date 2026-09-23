/**
 * Proves the "automação de ponta a ponta" design (workflow-pipeline-v2.md §6.1): once a Spec/Brief
 * is approved, elicitador -> workflow-executor -> avaliador (and back on rejection) delegate to each
 * other automatically via the `task` tool, driven entirely by prompt instructions + the new
 * `task: {...}` permission grants added in agent.ts. The test never calls `prompt.prompt` with an
 * explicit agent switch after the first turn — every subsequent agent turn is reached only because
 * the previous agent's own scripted response called `task`.
 *
 * IMPORTANT — subagent_depth: the `task` tool (packages/opencode/src/tool/task.ts) rejects a
 * delegation once the calling session's subagent nesting depth reaches `cfg.subagent_depth ?? 1`.
 * Because every hop in this automated chain creates a brand-new child session (no session is ever
 * resumed), each additional hop adds one level of depth. The default `subagent_depth: 1` is NOT
 * enough to run this chain past its first hop — see the inline comments on each test's `config` for
 * the exact minimum depth required. This is a real constraint of the design as specified in §6.1,
 * not a limitation of this test: a real project using this pipeline needs to raise `subagent_depth`
 * (more so the more rejection cycles it expects), or the chain will fail with "Subagent depth limit
 * reached" partway through.
 */
import { describe, expect } from "bun:test"
import { WorkflowReview } from "@opencode-ai/core/workflow-review"
import { SessionV1 } from "@opencode-ai/core/v1/session"
import { Database } from "@opencode-ai/core/database/database"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import { SessionProjector } from "@opencode-ai/core/session/projector"
import { Effect, Fiber, Layer, Queue } from "effect"
import fs from "fs/promises"
import path from "path"
import { Session } from "@/session/session"
import { SessionPrompt } from "../../src/session/prompt"
import { SessionSummary } from "../../src/session/summary"
import { MessageV2 } from "../../src/session/message-v2"
import { SessionID } from "../../src/session/schema"
import { LSP } from "@/lsp/lsp"
import { MCP } from "../../src/mcp"
import { Question } from "../../src/question"
import { EventV2Bridge } from "../../src/event-v2-bridge"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { provideTmpdirServer } from "../fixture/fixture"
import { testEffect } from "../lib/effect"
import { reply, TestLLMServer } from "../lib/llm-server"

type Hit = { body: Record<string, unknown> }
type CompletedToolPart = SessionV1.ToolPart & { state: SessionV1.ToolStateCompleted }

const ELICITADOR_MARKER = "Você é o agente **ELICITADOR**"
const EXECUTOR_MARKER = "Você é o workflow-executor"
const AVALIADOR_MARKER = "Você é o avaliador"

const ELICITADOR_AUTOMATION_MARKER = "delegue via `task` pro `workflow-executor`"
const EXECUTOR_AUTOMATION_MARKER = "Assim que execution_summary_write retornar com sucesso"

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
  Question.node,
  EventV2Bridge.node,
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

const providerCfg = (url: string, subagent_depth: number) => ({
  subagent_depth,
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

function hasMarker(hit: Hit, marker: string) {
  return bodyText(hit).includes(marker)
}

function promptPresent(hits: Hit[], check: (hit: Hit) => boolean) {
  return hits.some((hit) => check(hit))
}

const completedToolTranscript = Effect.fn("PipelineAutomationTest.completedToolTranscript")(function* (
  sessionID: SessionID,
) {
  const msgs = yield* MessageV2.filterCompactedEffect(sessionID)
  return msgs
    .flatMap((msg) => msg.parts)
    .filter((part): part is CompletedToolPart => part.type === "tool" && part.state.status === "completed")
    .map((part) => ({
      tool: part.tool,
      title: part.state.title,
      output: part.state.output,
    }))
})

const assistantTexts = Effect.fn("PipelineAutomationTest.assistantTexts")(function* (sessionID: SessionID) {
  const msgs = yield* MessageV2.filterCompactedEffect(sessionID)
  return msgs
    .filter((msg) => msg.info.role === "assistant")
    .flatMap((msg) => msg.parts)
    .filter((part) => part.type === "text")
    .map((part) => part.text)
})

/** Forks question.reply as soon as a pending question appears — mirrors test/tool/spec-status-write.test.ts. */
const pendingQuestion = Effect.fn("PipelineAutomationTest.pendingQuestion")(function* (question: Question.Interface) {
  const events = yield* EventV2Bridge.Service
  const asked = yield* Queue.unbounded<void>()
  const off = yield* events.listen((event) => {
    if (event.type === Question.Event.Asked.type) Queue.offerUnsafe(asked, undefined)
    return Effect.void
  })
  yield* Effect.addFinalizer(() => off)

  for (;;) {
    const items = yield* question.list()
    const item = items[0]
    if (item) return item
    yield* Queue.take(asked).pipe(Effect.timeout("2 seconds"))
  }
})

const SPEC_TASK_ID = "spec:demo:G1"
const SPEC_PATH = "specs/demo.md"
const specFixture = `---
arquivo: specs/demo.md
versao: "1.0"
data: 2026-01-01T00:00:00.000Z
status: aguardando_aprovacao
---

# Spec: Demo
`

const scheduleApprovalChainResponses = Effect.fn("PipelineAutomationTest.scheduleApprovalChainResponses")(function* (
  llm: TestLLMServer["Service"],
) {
  let elicitadorTurn = 0
  const elicitadorAt = (hit: Hit, turn: number) => {
    if (!hasMarker(hit, ELICITADOR_MARKER)) return false
    const matches = elicitadorTurn === turn
    if (matches) elicitadorTurn++
    return matches
  }
  let executorTurn = 0
  const executorAt = (hit: Hit, turn: number) => {
    if (!hasMarker(hit, EXECUTOR_MARKER)) return false
    const matches = executorTurn === turn
    if (matches) executorTurn++
    return matches
  }
  let avaliadorTurn = 0
  const avaliadorAt = (hit: Hit, turn: number) => {
    if (!hasMarker(hit, AVALIADOR_MARKER)) return false
    const matches = avaliadorTurn === turn
    if (matches) avaliadorTurn++
    return matches
  }

  // Elicitador: present the (already-drafted) spec, get it approved, delegate to workflow-executor.
  yield* llm.pushMatch(
    (hit) => elicitadorAt(hit, 0),
    reply()
      .text("Spec pronta para aprovação: sistema de demo com um único critério AC1.")
      .tool("spec_status_write", { task_id: SPEC_TASK_ID, new_status: "aprovada" })
      .item(),
  )
  yield* llm.pushMatch(
    (hit) => elicitadorAt(hit, 1),
    reply()
      .tool("task", {
        description: "Implement approved spec",
        prompt: `Implement task ${SPEC_TASK_ID} from the approved spec.`,
        subagent_type: "workflow-executor",
      })
      .item(),
  )
  yield* llm.pushMatch(
    (hit) => elicitadorAt(hit, 2),
    reply().text("Spec aprovada e implementação concluída pelo workflow-executor.").stop().item(),
  )

  // Workflow-executor (subagent of elicitador): standard cycle-1 gates, then auto-delegate to avaliador.
  yield* llm.pushMatch(
    (hit) => executorAt(hit, 0),
    reply().tool("cycle_tracker", { task_id: SPEC_TASK_ID }).item(),
  )
  yield* llm.pushMatch(
    (hit) => executorAt(hit, 1),
    reply().tool("task_approval_check", { task_id: SPEC_TASK_ID }).item(),
  )
  yield* llm.pushMatch(
    (hit) => executorAt(hit, 2),
    reply()
      .tool("execution_summary_write", {
        task_id: SPEC_TASK_ID,
        status: "complete",
        completed: [{ item: "AC1", evidence: "implemented per spec" }],
        incomplete: [],
      })
      .item(),
  )
  yield* llm.pushMatch(
    (hit) => executorAt(hit, 3),
    reply()
      .tool("task", {
        description: "Review implementation",
        prompt: `Audit task ${SPEC_TASK_ID}.`,
        subagent_type: "avaliador",
      })
      .item(),
  )
  yield* llm.pushMatch(
    (hit) => executorAt(hit, 4),
    reply().text("Implementação revisada e aprovada pelo avaliador.").stop().item(),
  )

  // Avaliador (subagent of workflow-executor): approves outright.
  yield* llm.pushMatch(
    (hit) => avaliadorAt(hit, 0),
    reply().tool("execution_summary_read", { task_id: SPEC_TASK_ID }).item(),
  )
  yield* llm.pushMatch(
    (hit) => avaliadorAt(hit, 1),
    reply()
      .tool("review_checklist_write", {
        task_id: SPEC_TASK_ID,
        gates: { execution_summary_complete: "pass" },
        criteria: [{ id: "AC1", status: "pass", evidence: "reviewed executor summary against spec" }],
        verdict: "approved",
      })
      .item(),
  )
  yield* llm.pushMatch((hit) => avaliadorAt(hit, 2), reply().text("Aprovado.").stop().item())
})

const BRIEF_TASK_ID = "brief-auto-cycle-demo"
const briefApproved = `brief_id: ${BRIEF_TASK_ID}
status: aprovada
task_summary: demo automatic rejection cycle
`

const scheduleRejectionCycleResponses = Effect.fn("PipelineAutomationTest.scheduleRejectionCycleResponses")(
  function* (llm: TestLLMServer["Service"]) {
    let executorTurn = 0
    const executorAt = (hit: Hit, turn: number) => {
      if (!hasMarker(hit, EXECUTOR_MARKER)) return false
      const matches = executorTurn === turn
      if (matches) executorTurn++
      return matches
    }
    let avaliadorTurn = 0
    const avaliadorAt = (hit: Hit, turn: number) => {
      if (!hasMarker(hit, AVALIADOR_MARKER)) return false
      const matches = avaliadorTurn === turn
      if (matches) avaliadorTurn++
      return matches
    }

    // workflow-executor, cycle 1 (top-level session) -> auto-delegates to avaliador.
    yield* llm.pushMatch((hit) => executorAt(hit, 0), reply().tool("cycle_tracker", { task_id: BRIEF_TASK_ID }).item())
    yield* llm.pushMatch(
      (hit) => executorAt(hit, 1),
      reply().tool("task_approval_check", { task_id: BRIEF_TASK_ID }).item(),
    )
    yield* llm.pushMatch(
      (hit) => executorAt(hit, 2),
      reply()
        .tool("execution_summary_write", {
          task_id: BRIEF_TASK_ID,
          status: "complete",
          completed: [{ item: "AC1", evidence: "login handler written, missing null check on empty password" }],
          incomplete: [],
        })
        .item(),
    )
    yield* llm.pushMatch(
      (hit) => executorAt(hit, 3),
      reply()
        .tool("task", {
          description: "Review implementation",
          prompt: `Audit task ${BRIEF_TASK_ID}.`,
          subagent_type: "avaliador",
        })
        .item(),
    )
    // Cycle 2, same executor "turn slot" sequence — this is a NEW child session, but the marker-based
    // router only cares about which prompt is talking, so it naturally continues the same counter.
    yield* llm.pushMatch((hit) => executorAt(hit, 4), reply().tool("cycle_tracker", { task_id: BRIEF_TASK_ID }).item())
    yield* llm.pushMatch(
      (hit) => executorAt(hit, 5),
      reply().tool("task_approval_check", { task_id: BRIEF_TASK_ID }).item(),
    )
    yield* llm.pushMatch(
      (hit) => executorAt(hit, 6),
      reply().tool("review_checklist_read", { task_id: BRIEF_TASK_ID }).item(),
    )
    yield* llm.pushMatch(
      (hit) => executorAt(hit, 7),
      reply()
        .tool("execution_summary_write", {
          task_id: BRIEF_TASK_ID,
          status: "complete",
          completed: [{ item: "AC1", evidence: "added null check on empty password, login now rejects it (400)" }],
          incomplete: [],
        })
        .item(),
    )
    yield* llm.pushMatch(
      (hit) => executorAt(hit, 8),
      reply()
        .tool("task", {
          description: "Review fix",
          prompt: `Audit task ${BRIEF_TASK_ID} after the fix.`,
          subagent_type: "avaliador",
        })
        .item(),
    )
    yield* llm.pushMatch(
      (hit) => executorAt(hit, 9),
      reply().text("Ciclo 2 concluído — correção revisada.").stop().item(),
    )
    yield* llm.pushMatch(
      (hit) => executorAt(hit, 10),
      reply().text("Ciclo concluído — aprovado após 1 ciclo de rejeição.").stop().item(),
    )

    // avaliador, cycle 1: rejects (real gap: missing null check), auto-delegates back to workflow-executor.
    yield* llm.pushMatch(
      (hit) => avaliadorAt(hit, 0),
      reply().tool("execution_summary_read", { task_id: BRIEF_TASK_ID }).item(),
    )
    yield* llm.pushMatch(
      (hit) => avaliadorAt(hit, 1),
      reply()
        .tool("review_checklist_write", {
          task_id: BRIEF_TASK_ID,
          gates: { execution_summary_complete: "fail" },
          criteria: [
            {
              id: "AC1",
              status: "fail",
              evidence: "login handler does not reject an empty password with 400 as AC1 requires — no null check",
            },
          ],
          verdict: "rejected",
        })
        .item(),
    )
    yield* llm.pushMatch(
      (hit) => avaliadorAt(hit, 2),
      reply()
        .tool("task", {
          description: "Fix rejected criterion",
          prompt: `Fix the rejected criterion for task ${BRIEF_TASK_ID} and try cycle 2.`,
          subagent_type: "workflow-executor",
        })
        .item(),
    )
    // avaliador, cycle 2: approves, no further delegation.
    yield* llm.pushMatch(
      (hit) => avaliadorAt(hit, 3),
      reply().tool("execution_summary_read", { task_id: BRIEF_TASK_ID }).item(),
    )
    yield* llm.pushMatch(
      (hit) => avaliadorAt(hit, 4),
      reply()
        .tool("review_checklist_write", {
          task_id: BRIEF_TASK_ID,
          gates: { execution_summary_complete: "pass" },
          criteria: [{ id: "AC1", status: "pass", evidence: "login now rejects empty password with 400" }],
          verdict: "approved",
        })
        .item(),
    )
    yield* llm.pushMatch(
      (hit) => avaliadorAt(hit, 5),
      reply().text("Aprovado após correção do ciclo 2.").stop().item(),
    )
    yield* llm.pushMatch(
      (hit) => avaliadorAt(hit, 6),
      reply().text("Correção delegada e agora aprovada.").stop().item(),
    )
  },
)

async function writeApprovedBrief(directory: string) {
  const briefPath = path.join(directory, ".opencode", "briefs", `${BRIEF_TASK_ID}.yaml`)
  await fs.mkdir(path.dirname(briefPath), { recursive: true })
  await fs.writeFile(briefPath, briefApproved, "utf-8")
}

describe("workflow pipeline end-to-end automatic delegation (TestLLMServer)", () => {
  // Two hops beyond the root session (elicitador -> workflow-executor -> avaliador): the second hop
  // (workflow-executor, itself already a subagent, delegating to avaliador) is at depth 1 relative to
  // its own session chain, so it needs subagent_depth > 1. subagent_depth: 2 is the exact minimum.
  it.live(
    "elicitador approval delegates through workflow-executor to avaliador with no manual agent switch",
    () =>
      provideTmpdirServer(
        Effect.fnUntraced(function* ({ dir, llm }) {
          const specPath = path.join(dir, SPEC_PATH)
          yield* Effect.promise(async () => {
            await fs.mkdir(path.dirname(specPath), { recursive: true })
            await fs.writeFile(specPath, specFixture, "utf-8")
          })

          yield* scheduleApprovalChainResponses(llm)

          const prompt = yield* SessionPrompt.Service
          const sessions = yield* Session.Service
          const question = yield* Question.Service
          const session = yield* sessions.create({
            title: "pipeline automation approval",
            permission: [{ permission: "*", pattern: "*", action: "allow" }],
          })

          // The only explicit agent selection in this whole test: the human starts with elicitador.
          yield* prompt.prompt({
            sessionID: session.id,
            agent: "elicitador",
            noReply: true,
            parts: [{ type: "text", text: `Aprove a spec ${SPEC_TASK_ID} e prossiga com a implementação.` }],
          })

          const promptFiber = yield* prompt.loop({ sessionID: session.id }).pipe(Effect.forkScoped)
          const pending = yield* pendingQuestion(question)
          yield* question.reply({ requestID: pending.id, answers: [["Yes"]] })
          const result = yield* Fiber.join(promptFiber)
          expect(result.info.role).toBe("assistant")

          const hits = yield* llm.hits
          expect(promptPresent(hits, (hit) => hasMarker(hit, ELICITADOR_MARKER))).toBe(true)
          expect(promptPresent(hits, (hit) => hasMarker(hit, EXECUTOR_MARKER))).toBe(true)
          expect(promptPresent(hits, (hit) => hasMarker(hit, AVALIADOR_MARKER))).toBe(true)
          expect(
            promptPresent(
              hits,
              (hit) => hasMarker(hit, ELICITADOR_MARKER) && hasMarker(hit, ELICITADOR_AUTOMATION_MARKER),
            ),
          ).toBe(true)
          expect(
            promptPresent(hits, (hit) => hasMarker(hit, EXECUTOR_MARKER) && hasMarker(hit, EXECUTOR_AUTOMATION_MARKER)),
          ).toBe(true)

          // The root session only ever saw spec_status_write and one task call — never a second
          // manual `prompt.prompt` with an explicit agent, proving the executor/avaliador hops were
          // reached purely through the agents' own `task` delegation.
          const rootTranscript = yield* completedToolTranscript(session.id)
          expect(rootTranscript.map((entry) => entry.tool)).toEqual(["spec_status_write", "task"])

          const specContent = yield* Effect.promise(() => fs.readFile(specPath, "utf-8"))
          expect(specContent).toContain("status: aprovada")

          const latestReview = yield* Effect.promise(() =>
            WorkflowReview.readLatestReviewChecklist(dir, SPEC_TASK_ID),
          )
          expect(latestReview?.payload.verdict).toBe("approved")

          const texts = yield* assistantTexts(session.id)
          expect(texts.some((text) => text.includes("aprovada e implementação concluída"))).toBe(true)
        }),
        { git: true, config: (url) => providerCfg(url, 2) },
      ),
  )

  // Three hops beyond the root: executor(root) -> avaliador(reject) -> executor(cycle2) -> avaliador
  // (approve). The deepest call (executor cycle 2 delegating to avaliador) sits at depth 2 relative to
  // its own chain, so it needs subagent_depth > 2. subagent_depth: 3 is the exact minimum for one
  // rejection-and-retry cycle; each further rejection cycle would need 2 more.
  it.live(
    "avaliador rejection auto-delegates back to workflow-executor, which retries and gets approved — no manual agent switch",
    () =>
      provideTmpdirServer(
        Effect.fnUntraced(function* ({ dir, llm }) {
          yield* Effect.promise(() => writeApprovedBrief(dir))
          yield* scheduleRejectionCycleResponses(llm)

          const prompt = yield* SessionPrompt.Service
          const sessions = yield* Session.Service
          const session = yield* sessions.create({
            title: "pipeline automation rejection cycle",
            permission: [{ permission: "*", pattern: "*", action: "allow" }],
          })

          // The only explicit agent selection in this whole test: the human starts with workflow-executor.
          yield* prompt.prompt({
            sessionID: session.id,
            agent: "workflow-executor",
            noReply: true,
            parts: [{ type: "text", text: `Implement task ${BRIEF_TASK_ID} from the approved brief.` }],
          })

          const result = yield* prompt.loop({ sessionID: session.id })
          expect(result.info.role).toBe("assistant")

          const hits = yield* llm.hits
          expect(promptPresent(hits, (hit) => hasMarker(hit, EXECUTOR_MARKER))).toBe(true)
          expect(promptPresent(hits, (hit) => hasMarker(hit, AVALIADOR_MARKER))).toBe(true)

          // The root session only ever saw its own cycle-1 gate tools plus one task call — cycle 2's
          // gates all ran inside the nested child sessions, never a manual re-selection of an agent.
          const rootTranscript = yield* completedToolTranscript(session.id)
          expect(rootTranscript.map((entry) => entry.tool)).toEqual([
            "cycle_tracker",
            "task_approval_check",
            "execution_summary_write",
            "task",
          ])

          const latestReview = yield* Effect.promise(() =>
            WorkflowReview.readLatestReviewChecklist(dir, BRIEF_TASK_ID),
          )
          expect(latestReview?.payload.verdict).toBe("approved")
          expect(latestReview?.payload.criteria[0]?.evidence).toContain("rejects empty password")

          const texts = yield* assistantTexts(session.id)
          expect(texts.some((text) => text.includes("aprovado após 1 ciclo de rejeição"))).toBe(true)
        }),
        { git: true, config: (url) => providerCfg(url, 3) },
      ),
  )
})

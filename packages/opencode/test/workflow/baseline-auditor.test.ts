/**
 * Covers the baseline-auditor subagent (workflow-pipeline-v2.md §4.9): a dedicated read-only
 * subagent that checks the 11 fixed rules in specs/xocp/baseline-global.md and reports via
 * baseline_audit_write. Four scenarios, per the implementation prompt:
 *
 * 1. baseline_audit_write rejects malformed input (bad schema, and the domain rule that
 *    overall:"pass" can't coexist with a failing item).
 * 2. The baseline-auditor finds a mechanical violation and reports overall:"fail" with
 *    file:line evidence.
 * 3. The avaliador turns that overall:"fail" into verdict:"rejected" (never "failed"),
 *    citing the baseline evidence in its own review_checklist_write.
 * 4. The workflow-executor voluntarily calls the auditor before finalizing, fixes the
 *    flagged code, and re-calls it until it passes.
 *
 * Scenarios 2 and 3 are proved by the same end-to-end test (`avaliador turns a baseline
 * failure into a rejected verdict...`) since they are inherently sequential: the auditor's
 * fail is exactly what feeds the avaliador's verdict in real usage.
 */
import { afterEach, describe, expect } from "bun:test"
import { Cause, Effect, Exit, Layer } from "effect"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { WorkflowReview } from "@opencode-ai/core/workflow-review"
import { Database } from "@opencode-ai/core/database/database"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import { SessionProjector } from "@opencode-ai/core/session/projector"
import fs from "fs/promises"
import path from "path"
import { Session } from "@/session/session"
import { SessionPrompt } from "../../src/session/prompt"
import { SessionSummary } from "../../src/session/summary"
import { MessageV2 } from "../../src/session/message-v2"
import { SessionID, MessageID } from "../../src/session/schema"
import { SessionV1 } from "@opencode-ai/core/v1/session"
import { Question } from "../../src/question"
import { EventV2Bridge } from "../../src/event-v2-bridge"
import { LSP } from "@/lsp/lsp"
import { MCP } from "../../src/mcp"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { Agent } from "../../src/agent/agent"
import { Truncate } from "@/tool/truncate"
import { Tool } from "@/tool/tool"
import { BaselineAuditWriteTool } from "../../src/tool/baseline-audit-write"
import { disposeAllInstances, TestInstance, provideTmpdirServer } from "../fixture/fixture"
import { testEffect } from "../lib/effect"
import { reply, TestLLMServer } from "../lib/llm-server"

type Hit = { body: Record<string, unknown> }
type CompletedToolPart = SessionV1.ToolPart & { state: SessionV1.ToolStateCompleted }

const EXECUTOR_MARKER = "Você é o workflow-executor"
const AVALIADOR_MARKER = "Você é o avaliador"
const AUDITOR_MARKER = "Você é o baseline-auditor"
// Specific to the real prompt's G-SEC-1 mechanical guidance — distinguishes "the auditor agent is
// selected" from "the auditor's actual instructions for this rule are present in the request".
const AUDITOR_GSEC1_GUIDANCE_MARKER = "grep por comparação direta de senha em texto"

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

const itUnit = testEffect(LayerNode.compile(LayerNode.group([Truncate.node, Agent.node])))

const ctx: Tool.Context = {
  sessionID: SessionID.make("ses_baseline-auditor-unit"),
  messageID: MessageID.make("msg_baseline-auditor-unit"),
  callID: "baseline-auditor-unit-call",
  agent: "baseline-auditor",
  abort: AbortSignal.any([]),
  messages: [],
  metadata: () => Effect.void,
  ask: () => Effect.void,
}

const providerCfg = (url: string, subagent_depth = 1) => ({
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

const completedToolTranscript = Effect.fn("BaselineAuditorTest.completedToolTranscript")(function* (
  sessionID: SessionID,
) {
  const msgs = yield* MessageV2.filterCompactedEffect(sessionID)
  return msgs
    .flatMap((msg) => msg.parts)
    .filter((part): part is CompletedToolPart => part.type === "tool" && part.state.status === "completed")
    .map((part) => part.tool)
})

describe("baseline_audit_write validation", () => {
  itUnit.effect("rejects a status value outside the pass/fail/not_applicable enum", () =>
    Effect.gen(function* () {
      const info = yield* BaselineAuditWriteTool
      const tool = yield* Tool.init(info)
      const execute = tool.execute as unknown as (args: unknown, ctx: Tool.Context) => ReturnType<typeof tool.execute>

      const exit = yield* execute(
        {
          task_id: "brief-baseline-malformed",
          items: [{ id: "G-SEC-1", status: "maybe", evidence: "n/a" }],
          overall: "fail",
        },
        ctx,
      ).pipe(Effect.exit)

      expect(Exit.isFailure(exit)).toBe(true)
      if (!Exit.isFailure(exit)) return
      const die = exit.cause.reasons.find(Cause.isDieReason)
      const error = die?.defect
      expect(error).toBeInstanceOf(Tool.InvalidArgumentsError)
      const args = error as Tool.InvalidArgumentsError
      expect(args.message).toContain("baseline_audit_write tool was called with invalid arguments")
      expect(args.message).toContain(`["items"][0]["status"]`)
    }),
  )

  itUnit.instance("rejects overall:\"pass\" while an item has status \"fail\"", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      const task_id = "brief-baseline-inconsistent"
      yield* Effect.promise(() => WorkflowReview.incrementCycle(test.directory, task_id))

      const info = yield* BaselineAuditWriteTool
      const tool = yield* Tool.init(info)
      const result = yield* tool.execute(
        {
          task_id,
          items: [{ id: "G-SEC-1", status: "fail" as const, evidence: "src/auth/login.ts:12 plaintext compare" }],
          overall: "pass" as const,
        },
        ctx,
      )

      expect(result.title).toBe("inconsistent overall")
      expect(result.output).toContain('overall cannot be "pass"')

      const saved = yield* Effect.promise(() => WorkflowReview.readLatestBaselineAudit(test.directory, task_id))
      expect(saved).toBeUndefined()
    }),
  )

  itUnit.instance("rejects an item with empty or whitespace-only evidence", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      const task_id = "brief-baseline-blank-evidence"
      yield* Effect.promise(() => WorkflowReview.incrementCycle(test.directory, task_id))

      const info = yield* BaselineAuditWriteTool
      const tool = yield* Tool.init(info)

      const empty = yield* tool.execute(
        {
          task_id,
          items: [{ id: "G-SEC-1", status: "pass" as const, evidence: "" }],
          overall: "pass" as const,
        },
        ctx,
      )
      expect(empty.title).toBe("inconsistent overall")
      expect(empty.output).toContain("G-SEC-1")
      expect(empty.output).toContain("empty or whitespace-only evidence")

      const whitespaceOnly = yield* tool.execute(
        {
          task_id,
          items: [{ id: "G-SEC-2", status: "pass" as const, evidence: "   " }],
          overall: "pass" as const,
        },
        ctx,
      )
      expect(whitespaceOnly.title).toBe("inconsistent overall")
      expect(whitespaceOnly.output).toContain("G-SEC-2")
      expect(whitespaceOnly.output).toContain("empty or whitespace-only evidence")

      const saved = yield* Effect.promise(() => WorkflowReview.readLatestBaselineAudit(test.directory, task_id))
      expect(saved).toBeUndefined()
    }),
  )
})

// Mirrors workflow-pipeline-cycle.test.ts: TestInstance-backed tmpdirs are cleaned up
// between tests so cycle-count files from one test never leak into the next.
afterEach(async () => {
  await disposeAllInstances()
})

const BRIEF_TASK_ID = "brief-baseline-review-demo"
const briefApproved = `brief_id: ${BRIEF_TASK_ID}
status: aprovada
task_summary: demo baseline-auditor review flow
`

const scheduleAvaliadorBaselineFlow = Effect.fn("BaselineAuditorTest.scheduleAvaliadorBaselineFlow")(function* (
  llm: TestLLMServer["Service"],
) {
  let avaliadorTurn = 0
  const avaliadorAt = (hit: Hit, turn: number) => {
    if (!hasMarker(hit, AVALIADOR_MARKER)) return false
    const matches = avaliadorTurn === turn
    if (matches) avaliadorTurn++
    return matches
  }
  let auditorTurn = 0
  const auditorAt = (hit: Hit, turn: number) => {
    if (!hasMarker(hit, AUDITOR_MARKER)) return false
    const matches = auditorTurn === turn
    if (matches) auditorTurn++
    return matches
  }

  const evidence = "src/auth/login.ts:12 compares password with '===' instead of bcrypt.compare"

  // avaliador (root session): reads the executor's summary, then always calls baseline-auditor
  // itself (mandatory step, independent of anything the executor may have already checked).
  yield* llm.pushMatch(
    (hit) => avaliadorAt(hit, 0),
    reply().tool("execution_summary_read", { task_id: BRIEF_TASK_ID }).item(),
  )
  yield* llm.pushMatch(
    (hit) => avaliadorAt(hit, 1),
    reply()
      .tool("task", {
        description: "Audit against Baseline Global",
        prompt: `Check task ${BRIEF_TASK_ID} against the 11 fixed baseline rules.`,
        subagent_type: "baseline-auditor",
      })
      .item(),
  )
  yield* llm.pushMatch(
    (hit) => avaliadorAt(hit, 2),
    reply()
      .tool("review_checklist_write", {
        task_id: BRIEF_TASK_ID,
        gates: { execution_summary_complete: "pass" },
        criteria: [
          { id: "AC1", status: "pass", evidence: "login endpoint implemented per brief" },
          { id: "G-SEC-1", status: "fail", evidence },
        ],
        verdict: "rejected",
      })
      .item(),
  )
  yield* llm.pushMatch(
    (hit) => avaliadorAt(hit, 3),
    reply().text("Rejeitado — o baseline-auditor encontrou uma falha de segurança real (G-SEC-1).").stop().item(),
  )

  // baseline-auditor (subagent of avaliador): finds the mechanical G-SEC-1 violation.
  yield* llm.pushMatch(
    (hit) => auditorAt(hit, 0),
    reply()
      .tool("baseline_audit_write", {
        task_id: BRIEF_TASK_ID,
        items: [
          { id: "G-SEC-1", status: "fail", evidence },
          { id: "G-SEC-2", status: "pass", evidence: "rate limit middleware present on /login" },
          { id: "G-SEC-3", status: "pass", evidence: "role check present before admin actions" },
          { id: "G-SEC-4", status: "pass", evidence: "no edits to already-applied migrations found" },
          { id: "G-SEC-5", status: "pass", evidence: "server-side validation present on login route" },
          { id: "G-SEC-6", status: "pass", evidence: "errors mapped to generic messages before response" },
          { id: "G-UX-1", status: "not_applicable", evidence: "no visual UI in this brief" },
          { id: "G-UX-2", status: "not_applicable", evidence: "no visual UI in this brief" },
          { id: "G-UX-3", status: "not_applicable", evidence: "no visual UI in this brief" },
          { id: "G-UX-4", status: "not_applicable", evidence: "no visual UI in this brief" },
          { id: "G-UX-5", status: "not_applicable", evidence: "no visual UI in this brief" },
        ],
        overall: "fail",
      })
      .item(),
  )
  yield* llm.pushMatch(
    (hit) => auditorAt(hit, 1),
    reply().text(`Auditoria concluída: G-SEC-1 falhou (${evidence}).`).stop().item(),
  )
})

async function writeApprovedBrief(directory: string) {
  const briefPath = path.join(directory, ".opencode", "briefs", `${BRIEF_TASK_ID}.yaml`)
  await fs.mkdir(path.dirname(briefPath), { recursive: true })
  await fs.writeFile(briefPath, briefApproved, "utf-8")
}

describe("baseline-auditor end-to-end (TestLLMServer)", () => {
  // avaliador runs as the root session (depth 0), so its own `task` call to baseline-auditor
  // is a single hop and needs no elevated subagent_depth beyond the default (1).
  it.live(
    "avaliador turns a baseline failure into a rejected verdict, citing the auditor's evidence",
    () =>
      provideTmpdirServer(
        Effect.fnUntraced(function* ({ dir, llm }) {
          yield* Effect.promise(async () => {
            await WorkflowReview.incrementCycle(dir, BRIEF_TASK_ID)
            await WorkflowReview.writeExecutionSummary(dir, {
              task_id: BRIEF_TASK_ID,
              completed: [{ item: "AC1", evidence: "login endpoint implemented" }],
              incomplete: [],
              status: "complete",
            })
          })

          yield* scheduleAvaliadorBaselineFlow(llm)

          const prompt = yield* SessionPrompt.Service
          const sessions = yield* Session.Service
          const session = yield* sessions.create({
            title: "baseline-auditor rejected verdict",
            permission: [{ permission: "*", pattern: "*", action: "allow" }],
          })

          yield* prompt.prompt({
            sessionID: session.id,
            agent: "avaliador",
            noReply: true,
            parts: [{ type: "text", text: `Revise o task ${BRIEF_TASK_ID}.` }],
          })

          const result = yield* prompt.loop({ sessionID: session.id })
          expect(result.info.role).toBe("assistant")

          const hits = yield* llm.hits
          expect(promptPresent(hits, (hit) => hasMarker(hit, AVALIADOR_MARKER))).toBe(true)
          expect(promptPresent(hits, (hit) => hasMarker(hit, AUDITOR_MARKER))).toBe(true)

          const rootTranscript = yield* completedToolTranscript(session.id)
          expect(rootTranscript).toEqual(["execution_summary_read", "task", "review_checklist_write"])

          // Scenario 2: the auditor's own record shows the mechanical failure with file:line evidence.
          const auditRecord = yield* Effect.promise(() => WorkflowReview.readLatestBaselineAudit(dir, BRIEF_TASK_ID))
          expect(auditRecord?.payload.overall).toBe("fail")
          const secItem = auditRecord?.payload.items.find((item) => item.id === "G-SEC-1")
          expect(secItem?.status).toBe("fail")
          expect(secItem?.evidence).toContain("login.ts:12")

          // Scenario 3: the avaliador's verdict is "rejected" (never "failed") and cites that same evidence.
          const review = yield* Effect.promise(() => WorkflowReview.readLatestReviewChecklist(dir, BRIEF_TASK_ID))
          expect(review?.payload.verdict).toBe("rejected")
          const cited = review?.payload.criteria.find((c) => c.id === "G-SEC-1")
          expect(cited?.status).toBe("fail")
          expect(cited?.evidence).toContain("login.ts:12")
        }),
        { git: true, config: (url) => providerCfg(url, 1) },
      ),
  )

  // workflow-executor runs as the root session. Both of its `task` calls to baseline-auditor,
  // and the final `task` call to avaliador, are single hops from the root — depth stays 0 for
  // the executor itself at every call, so the default subagent_depth (1) is enough.
  it.live(
    "workflow-executor voluntarily audits before finalizing, fixes the flagged code, and re-audits",
    () =>
      provideTmpdirServer(
        Effect.fnUntraced(function* ({ dir, llm }) {
          const loginPath = path.join(dir, "src", "auth", "login.ts")
          yield* Effect.promise(async () => {
            await writeApprovedBrief(dir)
            await fs.mkdir(path.dirname(loginPath), { recursive: true })
          })

          const insecure = `export async function login(email, password) {
  const user = await findUser(email)
  if (!user || user.password !== password) throw new Error("login failed")
  return { ok: true, userId: user.id }
}
`
          const secure = `import bcrypt from "bcrypt"

export async function login(email, password) {
  const user = await findUser(email)
  if (!user) return { ok: false, error: "Invalid credentials" }
  const match = await bcrypt.compare(password, user.passwordHash)
  if (!match) return { ok: false, error: "Invalid credentials" }
  return { ok: true, userId: user.id }
}
`
          const evidence = `${loginPath}:3 compares password with '!==' instead of bcrypt.compare`

          let executorTurn = 0
          const executorAt = (hit: Hit, turn: number) => {
            if (!hasMarker(hit, EXECUTOR_MARKER)) return false
            const matches = executorTurn === turn
            if (matches) executorTurn++
            return matches
          }
          let auditorTurn = 0
          const auditorAt = (hit: Hit, turn: number) => {
            if (!hasMarker(hit, AUDITOR_MARKER)) return false
            const matches = auditorTurn === turn
            if (matches) auditorTurn++
            return matches
          }
          let avaliadorTurn = 0
          const avaliadorAt = (hit: Hit, turn: number) => {
            if (!hasMarker(hit, AVALIADOR_MARKER)) return false
            const matches = avaliadorTurn === turn
            if (matches) avaliadorTurn++
            return matches
          }

          yield* llm.pushMatch(
            (hit) => executorAt(hit, 0),
            reply().tool("cycle_tracker", { task_id: BRIEF_TASK_ID }).item(),
          )
          yield* llm.pushMatch(
            (hit) => executorAt(hit, 1),
            reply().tool("task_approval_check", { task_id: BRIEF_TASK_ID }).item(),
          )
          // Step 5: implement (first pass, still insecure).
          yield* llm.pushMatch(
            (hit) => executorAt(hit, 2),
            reply().tool("write", { filePath: loginPath, content: insecure }).item(),
          )
          // Step 6: voluntary pre-finalization audit.
          yield* llm.pushMatch(
            (hit) => executorAt(hit, 3),
            reply()
              .tool("task", {
                description: "Voluntary baseline check",
                prompt: `Check task ${BRIEF_TASK_ID} against the 11 fixed baseline rules before finalizing.`,
                subagent_type: "baseline-auditor",
              })
              .item(),
          )
          // Fix the flagged code.
          yield* llm.pushMatch(
            (hit) => executorAt(hit, 4),
            reply().tool("write", { filePath: loginPath, content: secure }).item(),
          )
          // Re-audit.
          yield* llm.pushMatch(
            (hit) => executorAt(hit, 5),
            reply()
              .tool("task", {
                description: "Re-audit after fix",
                prompt: `Re-check task ${BRIEF_TASK_ID} against the 11 fixed baseline rules after the fix.`,
                subagent_type: "baseline-auditor",
              })
              .item(),
          )
          // Step 7: finalize.
          yield* llm.pushMatch(
            (hit) => executorAt(hit, 6),
            reply()
              .tool("execution_summary_write", {
                task_id: BRIEF_TASK_ID,
                status: "complete",
                completed: [{ item: "AC1", evidence: "login implemented with hashed passwords" }],
                incomplete: [],
              })
              .item(),
          )
          // Step 8: mandatory delegation to avaliador.
          yield* llm.pushMatch(
            (hit) => executorAt(hit, 7),
            reply()
              .tool("task", {
                description: "Review implementation",
                prompt: `Audit task ${BRIEF_TASK_ID}.`,
                subagent_type: "avaliador",
              })
              .item(),
          )
          yield* llm.pushMatch(
            (hit) => executorAt(hit, 8),
            reply().text("Ciclo concluído — auditado, corrigido, re-auditado e aprovado.").stop().item(),
          )

          // baseline-auditor, first call: reports the mechanical failure.
          yield* llm.pushMatch(
            (hit) => auditorAt(hit, 0),
            reply()
              .tool("baseline_audit_write", {
                task_id: BRIEF_TASK_ID,
                items: [
                  { id: "G-SEC-1", status: "fail", evidence },
                  { id: "G-SEC-2", status: "pass", evidence: "no auth endpoint without rate limiting found" },
                  { id: "G-SEC-3", status: "not_applicable", evidence: "single-role brief, no RBAC surface" },
                  { id: "G-SEC-4", status: "pass", evidence: "no edits to already-applied migrations found" },
                  { id: "G-SEC-5", status: "pass", evidence: "validation runs server-side in login handler" },
                  { id: "G-SEC-6", status: "pass", evidence: "errors mapped to generic messages" },
                  { id: "G-UX-1", status: "not_applicable", evidence: "no visual UI in this brief" },
                  { id: "G-UX-2", status: "not_applicable", evidence: "no visual UI in this brief" },
                  { id: "G-UX-3", status: "not_applicable", evidence: "no visual UI in this brief" },
                  { id: "G-UX-4", status: "not_applicable", evidence: "no visual UI in this brief" },
                  { id: "G-UX-5", status: "not_applicable", evidence: "no visual UI in this brief" },
                ],
                overall: "fail",
              })
              .item(),
          )
          yield* llm.pushMatch(
            (hit) => auditorAt(hit, 1),
            reply().text(`Falha encontrada: G-SEC-1 (${evidence}).`).stop().item(),
          )

          // baseline-auditor, second call (after the fix): reports pass.
          yield* llm.pushMatch(
            (hit) => auditorAt(hit, 2),
            reply()
              .tool("baseline_audit_write", {
                task_id: BRIEF_TASK_ID,
                items: [
                  { id: "G-SEC-1", status: "pass", evidence: "login.ts now uses bcrypt.compare, no plaintext compare" },
                  { id: "G-SEC-2", status: "pass", evidence: "no auth endpoint without rate limiting found" },
                  { id: "G-SEC-3", status: "not_applicable", evidence: "single-role brief, no RBAC surface" },
                  { id: "G-SEC-4", status: "pass", evidence: "no edits to already-applied migrations found" },
                  { id: "G-SEC-5", status: "pass", evidence: "validation runs server-side in login handler" },
                  { id: "G-SEC-6", status: "pass", evidence: "errors mapped to generic messages" },
                  { id: "G-UX-1", status: "not_applicable", evidence: "no visual UI in this brief" },
                  { id: "G-UX-2", status: "not_applicable", evidence: "no visual UI in this brief" },
                  { id: "G-UX-3", status: "not_applicable", evidence: "no visual UI in this brief" },
                  { id: "G-UX-4", status: "not_applicable", evidence: "no visual UI in this brief" },
                  { id: "G-UX-5", status: "not_applicable", evidence: "no visual UI in this brief" },
                ],
                overall: "pass",
              })
              .item(),
          )
          yield* llm.pushMatch((hit) => auditorAt(hit, 3), reply().text("Tudo certo agora.").stop().item())

          // avaliador (subagent of the executor root): simple approval, no need to re-exercise
          // its own mandatory baseline-auditor call here — that path is already covered by the
          // previous test. This test's focus is the executor's own audit/fix/re-audit loop.
          yield* llm.pushMatch(
            (hit) => avaliadorAt(hit, 0),
            reply().tool("execution_summary_read", { task_id: BRIEF_TASK_ID }).item(),
          )
          yield* llm.pushMatch(
            (hit) => avaliadorAt(hit, 1),
            reply()
              .tool("review_checklist_write", {
                task_id: BRIEF_TASK_ID,
                gates: { execution_summary_complete: "pass" },
                criteria: [{ id: "AC1", status: "pass", evidence: "login now hashes passwords with bcrypt" }],
                verdict: "approved",
              })
              .item(),
          )
          yield* llm.pushMatch((hit) => avaliadorAt(hit, 2), reply().text("Aprovado.").stop().item())

          const prompt = yield* SessionPrompt.Service
          const sessions = yield* Session.Service
          const session = yield* sessions.create({
            title: "baseline-auditor voluntary audit-fix-reaudit",
            permission: [{ permission: "*", pattern: "*", action: "allow" }],
          })

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
          expect(promptPresent(hits, (hit) => hasMarker(hit, AUDITOR_MARKER))).toBe(true)

          // Scenario 4: exactly this sequence proves the executor implemented, audited itself
          // voluntarily, fixed the flagged code, and re-audited — all before ever calling
          // execution_summary_write or delegating to the avaliador.
          const rootTranscript = yield* completedToolTranscript(session.id)
          expect(rootTranscript).toEqual([
            "cycle_tracker",
            "task_approval_check",
            "write",
            "task",
            "write",
            "task",
            "execution_summary_write",
            "task",
          ])

          const finalAudit = yield* Effect.promise(() => WorkflowReview.readLatestBaselineAudit(dir, BRIEF_TASK_ID))
          expect(finalAudit?.payload.overall).toBe("pass")

          const finalCode = yield* Effect.promise(() => fs.readFile(loginPath, "utf-8"))
          expect(finalCode).toContain("bcrypt.compare")
          expect(finalCode).not.toContain("!== password")

          const latestReview = yield* Effect.promise(() =>
            WorkflowReview.readLatestReviewChecklist(dir, BRIEF_TASK_ID),
          )
          expect(latestReview?.payload.verdict).toBe("approved")
        }),
        { git: true, config: (url) => providerCfg(url, 1) },
      ),
  )
})

// Both tests below call the baseline-auditor agent directly (never via avaliador/executor
// delegation) to isolate the auditor's own decision from the caller's reaction to it — the tests
// above already cover that reaction. The scripted response is gated on the real prompt's G-SEC-1
// guidance text being present in the request, mirroring the marker-gating technique in
// workflow-pipeline-prompt.test.ts: this proves the auditor's specific instructions are what
// produce the "fail" decision, not a hand-picked "correct" answer that would fire regardless of
// prompt content.
describe("baseline-auditor decides independently, driven by its own prompt (TestLLMServer)", () => {
  const STANDALONE_TASK_ID = "brief-baseline-standalone-audit"
  const vulnerableSnippet = `export async function login(email, password) {
  const user = await findUser(email)
  if (!user || user.password !== password) throw new Error("login failed")
  return { ok: true, userId: user.id }
}`
  const auditPrompt = [
    `Audite o task ${STANDALONE_TASK_ID} contra as 11 regras do Baseline Global.`,
    "Aqui está o trecho relevante de src/auth/login.ts:",
    "",
    vulnerableSnippet,
  ].join("\n")

  it.live(
    "baseline-auditor decides G-SEC-1 fail on its own when given plaintext password comparison",
    () =>
      provideTmpdirServer(
        Effect.fnUntraced(function* ({ dir, llm }) {
          yield* Effect.promise(() => WorkflowReview.incrementCycle(dir, STANDALONE_TASK_ID))

          yield* llm.pushMatch(
            (hit) =>
              hasMarker(hit, AUDITOR_GSEC1_GUIDANCE_MARKER) && hasMarker(hit, "user.password !== password"),
            reply()
              .tool("baseline_audit_write", {
                task_id: STANDALONE_TASK_ID,
                items: [
                  {
                    id: "G-SEC-1",
                    status: "fail",
                    evidence:
                      "src/auth/login.ts: `user.password !== password` compares plaintext, no bcrypt/argon2/scrypt call",
                  },
                ],
                overall: "fail",
              })
              .item(),
          )
          yield* llm.pushMatch(
            (hit) => hasMarker(hit, AUDITOR_GSEC1_GUIDANCE_MARKER),
            reply().text("G-SEC-1 falhou: comparação de senha em texto puro.").stop().item(),
          )

          const prompt = yield* SessionPrompt.Service
          const sessions = yield* Session.Service
          const session = yield* sessions.create({
            title: "baseline-auditor standalone decision",
            permission: [{ permission: "*", pattern: "*", action: "allow" }],
          })

          yield* prompt.prompt({
            sessionID: session.id,
            agent: "baseline-auditor",
            noReply: true,
            parts: [{ type: "text", text: auditPrompt }],
          })

          const result = yield* prompt.loop({ sessionID: session.id })
          expect(result.info.role).toBe("assistant")

          const hits = yield* llm.hits
          expect(promptPresent(hits, (hit) => hasMarker(hit, AUDITOR_GSEC1_GUIDANCE_MARKER))).toBe(true)

          const audit = yield* Effect.promise(() => WorkflowReview.readLatestBaselineAudit(dir, STANDALONE_TASK_ID))
          expect(audit?.payload.overall).toBe("fail")
          const item = audit?.payload.items.find((entry) => entry.id === "G-SEC-1")
          expect(item?.status).toBe("fail")
          expect(item?.evidence).toContain("!==")
        }),
        { git: true, config: (url) => providerCfg(url, 1) },
      ),
  )

  it.live(
    "baseline-auditor fails to catch G-SEC-1 when its prompt is broken, proving the real prompt drives the decision above",
    () =>
      provideTmpdirServer(
        Effect.fnUntraced(function* ({ dir, llm }) {
          yield* Effect.promise(() => WorkflowReview.incrementCycle(dir, STANDALONE_TASK_ID))

          // With the prompt overridden, the G-SEC-1 guidance marker never appears in the request —
          // the only scripted branch left is a blind "pass", standing in for a generic agent with no
          // specific instruction to catch this particular rule.
          yield* llm.pushMatch(
            (hit) => !hasMarker(hit, AUDITOR_GSEC1_GUIDANCE_MARKER),
            reply()
              .tool("baseline_audit_write", {
                task_id: STANDALONE_TASK_ID,
                items: [{ id: "G-SEC-1", status: "pass", evidence: "looks fine" }],
                overall: "pass",
              })
              .item(),
          )
          yield* llm.pushMatch(
            (hit) => !hasMarker(hit, AUDITOR_GSEC1_GUIDANCE_MARKER),
            reply().text("Tudo certo.").stop().item(),
          )

          const prompt = yield* SessionPrompt.Service
          const sessions = yield* Session.Service
          const session = yield* sessions.create({
            title: "baseline-auditor broken prompt",
            permission: [{ permission: "*", pattern: "*", action: "allow" }],
          })

          yield* prompt.prompt({
            sessionID: session.id,
            agent: "baseline-auditor",
            noReply: true,
            parts: [{ type: "text", text: auditPrompt }],
          })

          yield* prompt.loop({ sessionID: session.id })

          const hits = yield* llm.hits
          expect(promptPresent(hits, (hit) => hasMarker(hit, AUDITOR_GSEC1_GUIDANCE_MARKER))).toBe(false)

          const audit = yield* Effect.promise(() => WorkflowReview.readLatestBaselineAudit(dir, STANDALONE_TASK_ID))
          // Opposite outcome of the test above — the plaintext comparison goes uncaught without the
          // real prompt's mechanical guidance, proving that guidance (not just agent selection) is
          // what causes the "fail" decision there.
          expect(audit?.payload.overall).toBe("pass")
        }),
        {
          git: true,
          config: (url) => ({
            ...providerCfg(url, 1),
            agent: {
              "baseline-auditor": {
                prompt: "You are baseline-auditor. Report everything as pass without checking.",
              },
            },
          }),
        },
      ),
  )
})

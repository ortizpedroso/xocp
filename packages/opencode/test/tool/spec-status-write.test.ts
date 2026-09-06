import { afterEach, describe, expect } from "bun:test"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { Effect, Fiber, Queue } from "effect"
import path from "path"
import fs from "fs/promises"
import { SpecStatusWriteTool } from "../../src/tool/spec-status-write"
import { Question } from "../../src/question"
import { Truncate } from "@/tool/truncate"
import { Agent } from "../../src/agent/agent"
import { SessionID, MessageID } from "../../src/session/schema"
import { EventV2Bridge } from "../../src/event-v2-bridge"
import { Tool } from "@/tool/tool"
import { disposeAllInstances, TestInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

const ctx = {
  sessionID: SessionID.make("ses_test-spec-status"),
  messageID: MessageID.make("msg_test-spec-status"),
  callID: "test-call",
  agent: "elicitador",
  abort: AbortSignal.any([]),
  messages: [],
  metadata: () => Effect.void,
  ask: () => Effect.void,
}

afterEach(async () => {
  await disposeAllInstances()
})

const it = testEffect(
  LayerNode.compile(LayerNode.group([Question.node, EventV2Bridge.node, Truncate.node, Agent.node])),
)

const init = Effect.fn("SpecStatusWriteTest.init")(function* () {
  const info = yield* SpecStatusWriteTool
  return yield* info.init()
})

const run = Effect.fn("SpecStatusWriteTest.run")(function* (
  args: Tool.InferParameters<typeof SpecStatusWriteTool>,
) {
  const tool = yield* init()
  return yield* tool.execute(args, ctx)
})

const pendingQuestion = Effect.fn("SpecStatusWriteTest.pendingQuestion")(function* (question: Question.Interface) {
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

const specFixture = `---
arquivo: specs/demo.md
versao: "1.0"
data: 2026-01-01T00:00:00.000Z
status: aguardando_aprovacao
---

# Spec: Demo
`

describe("tool.spec_status_write", () => {
  it.instance("declines aprovada without affirmative UI confirmation", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      const specPath = path.join(test.directory, "specs", "demo.md")
      yield* Effect.promise(() => fs.mkdir(path.dirname(specPath), { recursive: true }))
      yield* Effect.promise(() => fs.writeFile(specPath, specFixture, "utf-8"))

      const question = yield* Question.Service
      const fiber = yield* run({
        task_id: "spec:demo:G1",
        new_status: "aprovada",
      }).pipe(Effect.forkScoped)

      const item = yield* pendingQuestion(question)
      yield* question.reply({ requestID: item.id, answers: [["No"]] })

      const result = yield* Fiber.join(fiber)
      const content = yield* Effect.promise(() => fs.readFile(specPath, "utf-8"))

      expect(result.metadata.applied).toBe(false)
      expect(result.output).toContain("declined")
      expect(content).toContain("status: aguardando_aprovacao")
      expect(content).not.toContain("status: aprovada")
    }),
  )

  it.instance("updates aprovada when UI confirmation is affirmative", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      const specPath = path.join(test.directory, "specs", "demo.md")
      yield* Effect.promise(() => fs.mkdir(path.dirname(specPath), { recursive: true }))
      yield* Effect.promise(() => fs.writeFile(specPath, specFixture, "utf-8"))

      const question = yield* Question.Service
      const fiber = yield* run({
        task_id: "spec:demo:G1",
        new_status: "aprovada",
      }).pipe(Effect.forkScoped)

      const item = yield* pendingQuestion(question)
      yield* question.reply({ requestID: item.id, answers: [["Yes"]] })

      const result = yield* Fiber.join(fiber)
      const content = yield* Effect.promise(() => fs.readFile(specPath, "utf-8"))

      expect(result.metadata.applied).toBe(true)
      expect(content).toContain("status: aprovada")
      expect(content).not.toContain("status: aguardando_aprovacao")
    }),
  )

  it.instance("updates non-aprovada transitions without asking", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      const specPath = path.join(test.directory, "specs", "demo.md")
      const draft = specFixture.replace("aguardando_aprovacao", "rascunho")
      yield* Effect.promise(() => fs.mkdir(path.dirname(specPath), { recursive: true }))
      yield* Effect.promise(() => fs.writeFile(specPath, draft, "utf-8"))

      const question = yield* Question.Service
      const result = yield* run({
        task_id: "spec:demo:G1",
        new_status: "aguardando_aprovacao",
      })

      const pending = yield* question.list()
      const content = yield* Effect.promise(() => fs.readFile(specPath, "utf-8"))

      expect(pending).toHaveLength(0)
      expect(result.metadata.applied).toBe(true)
      expect(content).toContain("status: aguardando_aprovacao")
      expect(content).not.toContain("status: rascunho")
    }),
  )
})

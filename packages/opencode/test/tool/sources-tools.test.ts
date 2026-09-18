import { afterEach, describe, expect } from "bun:test"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { Effect } from "effect"
import path from "path"
import fs from "fs/promises"
import { SourcesQueryTool } from "../../src/tool/sources-query"
import { SourcesListTool } from "../../src/tool/sources-list"
import { SourcesIngestTool } from "../../src/tool/sources-ingest"
import { EvolutionIncidentWriteTool } from "../../src/tool/evolution-incident-write"
import { SessionID, MessageID } from "../../src/session/schema"
import { Tool } from "@/tool/tool"
import { disposeAllInstances, TestInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"
import { Truncate } from "@/tool/truncate"
import { Agent } from "../../src/agent/agent"
import { PermissionV1 } from "@opencode-ai/core/v1/permission"
import { Permission } from "../../src/permission"
import { ToolRegistry } from "@/tool/registry"
import { TestConfig } from "../fixture/config"
import { Config } from "@/config/config"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { InstanceState } from "@/effect/instance-state"

function newCtx(agent: string): Tool.Context {
  return {
    sessionID: SessionID.make("ses_test-sources-tools"),
    messageID: MessageID.make("msg_test-sources-tools"),
    callID: "test-call",
    agent,
    abort: AbortSignal.any([]),
    messages: [],
    metadata: () => Effect.void,
    ask: () => Effect.void,
  }
}

afterEach(async () => {
  await disposeAllInstances()
})

const it = testEffect(LayerNode.compile(LayerNode.group([Truncate.node, Agent.node])))

const configLayer = TestConfig.layer({
  directories: () => Effect.map(InstanceState.directory, (dir) => [path.join(dir, ".opencode")]),
})
const registryRoot = LayerNode.group([ToolRegistry.node, Agent.node])
const registryReplacements = [
  [Config.node, configLayer],
  [RuntimeFlags.node, RuntimeFlags.layer()],
] as const
const itRegistry = testEffect(LayerNode.compile(registryRoot, registryReplacements))

function evalPerm(agent: Agent.Info | undefined, permission: string): PermissionV1.Action | undefined {
  if (!agent) return undefined
  return Permission.evaluate(permission, "*", agent.permission).action
}

const SNIPPET = `export function add(a: number, b: number): number {
  return a + b
}`

describe("tool.sources_ingest", () => {
  it.instance(
    "elicitador/analista/research-operator podem ingerir; workflow-executor/avaliador são bloqueados",
    () =>
      Effect.gen(function* () {
        const test = yield* TestInstance
        const dir = test.directory
        const tool = yield* SourcesIngestTool
        const init = yield* tool.init()

        const ok = yield* init.execute(
          { source_type: "snippet", source_id: "add-helper", title: "Add helper", raw_content: SNIPPET, language: "ts" },
          newCtx("research-operator"),
        )
        expect(ok.title).toContain("ingested add-helper")
        expect(ok.output).toContain("normalized")
        const normalized = path.join(dir, ".opencode", "sources", "normalized", "add-helper.md")
        const content = yield* Effect.promise(() => fs.readFile(normalized, "utf8"))
        expect(content).toContain('source_id: "add-helper"')

        const denyExecutor = yield* init.execute(
          { source_type: "snippet", source_id: "blocked", raw_content: SNIPPET },
          newCtx("workflow-executor"),
        )
        expect(denyExecutor.title).toContain("sources permission denied")

        const denyAvaliador = yield* init.execute(
          { source_type: "snippet", source_id: "blocked2", raw_content: SNIPPET },
          newCtx("avaliador"),
        )
        expect(denyAvaliador.title).toContain("sources permission denied")
      }),
  )

  it.instance("re-ingest com mesmo source_id atualiza a fonte (upsert)", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      const tool = yield* SourcesIngestTool
      const init = yield* tool.init()

      yield* init.execute(
        { source_type: "snippet", source_id: "upsert-demo", title: "V1", raw_content: "const a = 1", language: "ts" },
        newCtx("elicitador"),
      )
      const second = yield* init.execute(
        { source_type: "snippet", source_id: "upsert-demo", title: "V2", raw_content: "const b = 2", language: "ts" },
        newCtx("elicitador"),
      )
      expect(second.output).toContain("V2")
    }),
  )
})

describe("tool.sources_list", () => {
  it.instance("elicitador lista fontes; workflow-executor é bloqueado", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      const ingest = yield* SourcesIngestTool
      const ingestInit = yield* ingest.init()
      yield* ingestInit.execute(
        { source_type: "snippet", source_id: "listed-src", title: "Listed", raw_content: SNIPPET, language: "ts" },
        newCtx("analista"),
      )

      const tool = yield* SourcesListTool
      const init = yield* tool.init()
      const ok = yield* init.execute({}, newCtx("elicitador"))
      expect(ok.output).toContain("listed-src")

      const denied = yield* init.execute({}, newCtx("workflow-executor"))
      expect(denied.title).toContain("sources permission denied")
    }),
  )
})

describe("tool.sources_query", () => {
  it.instance("user_objective dispara busca por intenção e retorna chunks relevantes", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      const ingest = yield* SourcesIngestTool
      const ingestInit = yield* ingest.init()
      yield* ingestInit.execute(
        {
          source_type: "snippet",
          source_id: "intent-src",
          title: "Adder",
          raw_content: `## Implementation\n\nThis function adds two numbers and returns the sum in typescript:\nexport function add(a: number, b: number): number {\n  return a + b\n}`,
          language: "ts",
        },
        newCtx("analista"),
      )

      const tool = yield* SourcesQueryTool
      const init = yield* tool.init()
      const result = yield* init.execute(
        { user_objective: "need to add two numbers in typescript" },
        newCtx("elicitador"),
      )
      expect(result.title).toContain("sources query")
      expect(result.output).toContain("intent-src")

      const denied = yield* init.execute(
        { user_objective: "somando numeros" },
        newCtx("workflow-executor"),
      )
      expect(denied.title).toContain("sources permission denied")
    }),
  )

  it.instance("query full-text via FTS5 retorna as fontes correspondentes", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      const ingest = yield* SourcesIngestTool
      const ingestInit = yield* ingest.init()
      yield* ingestInit.execute(
        { source_type: "snippet", source_id: "fts-doc", title: "TS Docs", raw_content: "blue widget documentation", language: "md" },
        newCtx("analista"),
      )

      const tool = yield* SourcesQueryTool
      const init = yield* tool.init()
      const result = yield* init.execute({ query: "blue widget" }, newCtx("analista"))
      expect(result.output).toContain("fts-doc")

      const empty = yield* init.execute({}, newCtx("analista"))
      expect(empty.output).toContain('Informe "user_objective" e/ou "query"')
    }),
  )
})

describe("tool.evolution_incident_write", () => {
  it.instance("evolution-incident-reporter grava incidente; outros agentes são bloqueados", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      const dir = test.directory
      const tool = yield* EvolutionIncidentWriteTool
      const init = yield* tool.init()

      const ok = yield* init.execute(
        {
          task_id: "brief-failing",
          cycles_used: 3,
          root_cause_category: "cycle_threshold_reached",
          symptom: "executor não conseguiu validar as evidências",
          context_snapshot: { verdict: "rejected" },
        },
        newCtx("evolution-incident-reporter"),
      )
      expect(ok.title).toContain("incident")

      const existing = yield* Effect.promise(() => fs.readdir(path.join(dir, ".opencode", "evolution")))
      const jsonFiles = existing.filter((f) => f.startsWith("incident-") && f.endsWith(".json"))
      expect(jsonFiles.length).toBe(1)
      const payload = yield* Effect.promise(async () =>
        JSON.parse(await fs.readFile(path.join(dir, ".opencode", "evolution", jsonFiles[0]), "utf8")),
      )
      expect(payload.task_id).toBe("brief-failing")
      expect(payload.root_cause_category).toBe("cycle_threshold_reached")
      expect(payload.context_snapshot).toEqual({ verdict: "rejected" })

      const denied = yield* init.execute(
        {
          task_id: "brief-failing",
          cycles_used: 3,
          root_cause_category: "cycle_threshold_reached",
          symptom: "tentativa sem permissão",
          context_snapshot: {},
        },
        newCtx("workflow-executor"),
      )
      expect(denied.title).toContain("evolution incident write denied")
    }),
  )
})

describe("agent registration", () => {
  it.instance("research-operator e evolution-incident-reporter estão registrados com as permissões esperadas", () =>
    Effect.gen(function* () {
      const agents = yield* Agent.Service.use((svc) => svc.list())
      const names = agents.map((a) => a.name)

      expect(names).toContain("research-operator")
      expect(names).toContain("evolution-incident-reporter")

      const research = agents.find((a) => a.name === "research-operator")
      expect(research?.mode).toBe("subagent")
      expect(evalPerm(research, "sources_ingest")).toBe("allow")
      expect(evalPerm(research, "sources_query")).toBe("deny")
      expect(evalPerm(research, "gen")).toBe("deny")

      const reporter = agents.find((a) => a.name === "evolution-incident-reporter")
      expect(reporter?.mode).toBe("subagent")
      expect(evalPerm(reporter, "evolution_incident_write")).toBe("allow")
      expect(evalPerm(reporter, "edit")).toBe("deny")
    }),
  )

  it.instance("elicitador/analista mantêm acesso de leitura a sources", () =>
    Effect.gen(function* () {
      const agents = yield* Agent.Service.use((svc) => svc.list())
      const elicitador = agents.find((a) => a.name === "elicitador")
      const analista = agents.find((a) => a.name === "analista")
      expect(evalPerm(elicitador, "sources_query")).toBe("allow")
      expect(evalPerm(analista, "sources_query")).toBe("allow")
      expect(evalPerm(elicitador, "sources_list")).toBe("allow")
    }),
  )
})

describe("tool registry integration", () => {
  itRegistry.instance("as 4 novas tools estão registradas no ToolRegistry.ids()", () =>
    Effect.gen(function* () {
      const registry = yield* ToolRegistry.Service
      const ids = yield* registry.ids()

      expect(ids).toContain("sources_query")
      expect(ids).toContain("sources_list")
      expect(ids).toContain("sources_ingest")
      expect(ids).toContain("evolution_incident_write")
    }),
  )
})
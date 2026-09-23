import { describe, expect } from "bun:test"
import { mkdirSync, existsSync } from "node:fs"
import path from "node:path"
import { Database } from "bun:sqlite"
import { Effect } from "effect"
import { HANDOFF_NOTICE } from "@opencode-ai/core/handoff/notice"
import { reply } from "../lib/llm-server"
import { cliIt } from "../lib/cli-process"

function agentInputs(inputs: Array<Record<string, unknown>>) {
  return inputs.filter((body) => !JSON.stringify(body).includes("Generate a title for this conversation"))
}

const waitForHandoff = (home: string, projectDir: string) =>
  Effect.gen(function* () {
    const dbPath = path.join(home, ".local/share/opencode/opencode.db")
    for (let attempt = 0; attempt < 40; attempt++) {
      if (existsSync(dbPath)) {
        const db = new Database(dbPath, { readonly: true })
        const rows = db.query("select directory, content from session_handoff where directory = ?").all(projectDir) as Array<{
          directory: string
          content: string
        }>
        if (rows.length > 0) return rows
      }
      yield* Effect.sleep("50 millis")
    }
    return []
  })

describe("handoff cli integration", () => {
  cliIt.live(
    "opencode run includes the handoff notice when a prior handoff exists for the directory",
    ({ home, llm, opencode }) =>
      Effect.gen(function* () {
        const projectDir = path.join(home, "handoff-project")
        mkdirSync(projectDir, { recursive: true })

        yield* llm.push(
          reply().tool("handoff_write", { content: "Continue the API migration work." }),
          reply().text("saved").stop(),
        )
        const write = yield* opencode.run("Write a handoff summary for this project.", {
          extraArgs: ["--dir", projectDir, "--dangerously-skip-permissions"],
        })
        opencode.expectExit(write, 0)
        expect(`${write.stdout}\n${write.stderr}`).toContain("handoff saved")
        expect((yield* waitForHandoff(home, projectDir)).length).toBeGreaterThan(0)

        yield* llm.reset
        yield* llm.push(reply().text("hello").stop())
        const run = yield* opencode.run("Say hello.", {
          extraArgs: ["--dir", projectDir, "--dangerously-skip-permissions"],
        })
        opencode.expectExit(run, 0)

        const input = JSON.stringify(agentInputs(yield* llm.inputs))
        expect(input).toContain(HANDOFF_NOTICE)
      }),
    120_000,
  )

  cliIt.live(
    "opencode run omits the handoff notice when no handoff exists for the directory",
    ({ home, llm, opencode }) =>
      Effect.gen(function* () {
        const projectDir = path.join(home, "empty-project")
        mkdirSync(projectDir, { recursive: true })

        yield* llm.push(reply().text("hello").stop())
        const run = yield* opencode.run("Say hello.", {
          extraArgs: ["--dir", projectDir, "--dangerously-skip-permissions"],
        })
        opencode.expectExit(run, 0)

        const input = JSON.stringify(agentInputs(yield* llm.inputs))
        expect(input).not.toContain(HANDOFF_NOTICE)
      }),
    60_000,
  )

  cliIt.live(
    "handoff_write returns a readable error when content exceeds 2000 characters",
    ({ home, llm, opencode }) =>
      Effect.gen(function* () {
        const projectDir = path.join(home, "handoff-long")
        mkdirSync(projectDir, { recursive: true })

        yield* llm.push(
          reply().tool("handoff_write", { content: "x".repeat(2001) }),
          reply().text("I will shorten the summary.").stop(),
        )
        const run = yield* opencode.run("Save this handoff summary.", {
          extraArgs: ["--dir", projectDir, "--dangerously-skip-permissions", "--format", "json"],
        })
        opencode.expectExit(run, 0)

        const output = `${run.stdout}\n${run.stderr}`
        expect(output).toContain("2001 characters")
        expect(output).toContain("maximum is 2000")
      }),
    60_000,
  )

  cliIt.live(
    "handoff_read returns the stored summary for the project directory",
    ({ home, llm, opencode }) =>
      Effect.gen(function* () {
        const projectDir = path.join(home, "handoff-read")
        mkdirSync(projectDir, { recursive: true })

        yield* llm.push(
          reply().tool("handoff_write", { content: "Ship pagination next." }),
          reply().text("saved").stop(),
          reply().tool("handoff_read", {}),
          reply().text("read complete").stop(),
        )
        const run = yield* opencode.run("Write a handoff, then read it back.", {
          extraArgs: ["--dir", projectDir, "--dangerously-skip-permissions", "--format", "json"],
        })
        opencode.expectExit(run, 0)

        const output = `${run.stdout}\n${run.stderr}`
        expect(output).toContain("Ship pagination next.")
      }),
    120_000,
  )
})

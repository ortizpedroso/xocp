import path from "node:path"
import fs from "node:fs/promises"
import os from "node:os"
import { describe, expect, test } from "bun:test"
import { runExecutorSelfTest, resolveSelfTestExecDir } from "../../src/workflow-executor/self-test"

describe("workflow-executor/self-test Pre-Flight Guard", () => {
  test("Validates that runExecutorSelfTest blocks submission when bun test fails (exitCode !== 0)", async () => {
    const mockRunner = async (cmd: string, cwd: string) => {
      return {
        exitCode: 1,
        output: "AssertionError: expected 'approved' but got 'rejected'",
      }
    }

    const result = await runExecutorSelfTest(
      "/workspace",
      "test/auth/token.test.ts",
      mockRunner
    )

    expect(result.success).toBe(false)
    expect(result.exitCode).toBe(1)
    expect(result.authorizedForSubmission).toBe(false)
    expect(result.error).toContain("Pre-flight self-test failed with exit code 1")
    expect(result.output).toContain("AssertionError")
  })

  test("Validates that successful test runs authorize submission (exitCode === 0)", async () => {
    const mockRunner = async (cmd: string, cwd: string) => {
      return {
        exitCode: 0,
        output: "2 pass 0 fail",
      }
    }

    const result = await runExecutorSelfTest(
      "/workspace",
      "test/auth/token.test.ts",
      mockRunner
    )

    expect(result.success).toBe(true)
    expect(result.exitCode).toBe(0)
    expect(result.authorizedForSubmission).toBe(true)
    expect(result.error).toBeUndefined()
    expect(result.output).toContain("2 pass 0 fail")
  })

  test("default runner invokes bun test without a POSIX shell (cross-platform)", async () => {
    const cwd = process.cwd()
    const result = await runExecutorSelfTest(cwd, "test/cluster/scope-conflict.test.ts")

    expect(result.success).toBe(true)
    expect(result.exitCode).toBe(0)
    expect(result.authorizedForSubmission).toBe(true)
    expect(result.error).toBeUndefined()
    expect(result.output).toContain("pass")
  })

  test("default runner surfaces a failing test as a blocked submission", async () => {
    const cwd = process.cwd()
    const result = await runExecutorSelfTest(cwd, "test/evolution/does-not-exist.test.ts")

    expect(result.success).toBe(false)
    expect(result.exitCode).not.toBe(0)
    expect(result.authorizedForSubmission).toBe(false)
    expect(result.error).toContain("Pre-flight self-test failed")
  })
})

describe("workflow-executor/self-test monorepo exec-dir resolution", () => {
  test("pins runner to the package root below the workspace when one exists", async () => {
    const ws = await fs.mkdtemp(path.join(os.tmpdir(), "self-test-mono-"))
    const pkgBun = path.join(ws, "packages", "opencode")
    const testDir = path.join(pkgBun, "test", "tool")
    await fs.mkdir(testDir, { recursive: true })
    await fs.writeFile(path.join(pkgBun, "package.json"), "{}")
    await fs.writeFile(
      path.join(testDir, "sample.test.ts"),
      'import { test, expect } from "bun:test"\ntest("ok", () => expect(1).toBe(1))\n'
    )

    const execDir = resolveSelfTestExecDir(ws, path.join("packages", "opencode", "test", "tool", "sample.test.ts"))
    expect(execDir).toBe(pkgBun)

    let capturedCwd = ""
    let capturedCmd = ""
    const result = await runExecutorSelfTest(
      ws,
      path.join("packages", "opencode", "test", "tool", "sample.test.ts"),
      async (cmd: string, cwd: string) => {
        capturedCmd = cmd
        capturedCwd = cwd
        return { exitCode: 0, output: "1 pass 0 fail" }
      }
    )

    expect(result.success).toBe(true)
    expect(capturedCwd).toBe(pkgBun)
    expect(capturedCmd).toBe("bun test test/tool/sample.test.ts")

    await fs.rm(ws, { recursive: true, force: true })
  })

  test("falls back to the workspace root for a flat project", () => {
    const ws = process.cwd()
    expect(resolveSelfTestExecDir(ws, "test/workflow-executor/self-test.test.ts")).toBe(ws)
  })

  test("default runner runs the monorepo case from the package dir and passes", async () => {
    const root = path.resolve(__dirname, "..", "..", "..", "..")
    const result = await runExecutorSelfTest(root, "packages/core/test/cluster/scope-conflict.test.ts")
    expect(result.success).toBe(true)
    expect(result.execDir).toBe(path.join(root, "packages", "core"))
    expect(result.output).toContain("pass")
  })
})
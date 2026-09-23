import { describe, expect, test } from "bun:test"
import { runExecutorSelfTest } from "../../src/workflow-executor/self-test"

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
})

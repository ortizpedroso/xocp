import path from "node:path"
import fs from "node:fs"

export interface SelfTestResult {
  success: boolean
  exitCode: number
  testFilePath: string
  output: string
  authorizedForSubmission: boolean
  error?: string
  execDir?: string
}

export interface SelfTestRunnerOptions {
  workspaceDir: string
  testFilePath: string
  runner?: (command: string, cwd: string) => Promise<{ exitCode: number; output: string }>
}

/**
 * Resolves the directory from which `bun test` must run for a monorepo:
 * the closest ancestor of the test file (starting at the workspace root)
 * that is itself a package root (has its own package.json / bunfig.toml).
 *
 * Example: workspace = "C:/projetos/xocp", testFilePath = "packages/core/test/x.test.ts"
 * -> package root = "C:/projetos/xocp/packages/core", command = "bun test test/x.test.ts".
 * For a single-package project the workspace root is returned unchanged.
 */
export function resolveSelfTestExecDir(workspaceDir: string, testFilePath: string): string {
  const absoluteTest = path.resolve(workspaceDir, testFilePath)
  const workspaceAbs = path.resolve(workspaceDir)
  let dir = path.dirname(absoluteTest)

  while (dir.startsWith(workspaceAbs) && dir !== workspaceAbs) {
    const hasPackageJson = fs.existsSync(path.join(dir, "package.json"))
    const hasBunfig = fs.existsSync(path.join(dir, "bunfig.toml"))
    if (hasPackageJson || hasBunfig) {
      return dir
    }
    dir = path.dirname(dir)
  }
  return workspaceAbs
}

/**
 * Executor Pre-Flight Self-Test Guard
 * When the workflow-executor completes file modifications inside files_scope.allow_modify:
 * - It MUST generate or update a unit test (<module>.test.ts) covering its changes.
 * - It invokes runExecutorSelfTest(workspaceDir, testFilePath).
 * - Hard gate:
 *   - If exitCode !== 0: Execution submission is BLOCKED. Executor must fix code locally.
 *   - If exitCode === 0: Authorized to call task_approval_check.
 * Reviewer Blindness: Self-test logs are strictly local guards and NOT injected into Avaliador.
 */
export async function runExecutorSelfTest(
  workspaceDir: string,
  testFilePath: string,
  customRunner?: (command: string, cwd: string) => Promise<{ exitCode: number; output: string }>,
  execDirOverride?: string
): Promise<SelfTestResult> {
  const runner = customRunner || (async (cmd: string, cwd: string) => {
    try {
      const argv = ["bun", "test", ...cmd.replace(/^bun test\s*/, "").split(/\s+/).filter(Boolean)]
      const proc = Bun.spawnSync(argv, { cwd })
      const stdout = proc.stdout ? Buffer.from(proc.stdout).toString() : ""
      const stderr = proc.stderr ? Buffer.from(proc.stderr).toString() : ""
      return {
        exitCode: proc.exitCode ?? 1,
        output: (stdout + "\n" + stderr).trim(),
      }
    } catch (err: any) {
      return {
        exitCode: 1,
        output: err?.message || String(err),
      }
    }
  })

  const execDir = execDirOverride ?? resolveSelfTestExecDir(workspaceDir, testFilePath)
  const relativeTest = path.relative(execDir, path.resolve(workspaceDir, testFilePath)).replace(/\\/g, "/")
  const command = `bun test ${relativeTest}`
  const { exitCode, output } = await runner(command, execDir)

  const success = exitCode === 0

  return {
    success,
    exitCode,
    testFilePath,
    output,
    authorizedForSubmission: success,
    execDir,
    error: success ? undefined : `Pre-flight self-test failed with exit code ${exitCode}. You must correct code locally before calling task_approval_check.`,
  }
}
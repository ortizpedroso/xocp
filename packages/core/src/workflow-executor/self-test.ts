export interface SelfTestResult {
  success: boolean
  exitCode: number
  testFilePath: string
  output: string
  authorizedForSubmission: boolean
  error?: string
}

export interface SelfTestRunnerOptions {
  workspaceDir: string
  testFilePath: string
  runner?: (command: string, cwd: string) => Promise<{ exitCode: number; output: string }>
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
  customRunner?: (command: string, cwd: string) => Promise<{ exitCode: number; output: string }>
): Promise<SelfTestResult> {
  const runner = customRunner || (async (cmd: string, cwd: string) => {
    try {
      const proc = Bun.spawnSync(["sh", "-c", cmd], { cwd })
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

  const command = `bun test ${testFilePath}`
  const { exitCode, output } = await runner(command, workspaceDir)

  const success = exitCode === 0

  return {
    success,
    exitCode,
    testFilePath,
    output,
    authorizedForSubmission: success,
    error: success ? undefined : `Pre-flight self-test failed with exit code ${exitCode}. You must correct code locally before calling task_approval_check.`,
  }
}

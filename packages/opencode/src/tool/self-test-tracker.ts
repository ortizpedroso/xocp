import { Effect, Schema } from "effect"
import { runExecutorSelfTest } from "@opencode-ai/core/workflow-executor/self-test"
import {
  incrementSelfTestCycle,
  recordSelfTestAttempt,
  readLastSelfTestAttempt,
  writeSelfTestEscalation,
  SelfTestCycleLimitExceeded,
} from "@opencode-ai/core/workflow-executor/self-test-tracker"
import { InstanceState } from "@/effect/instance-state"
import * as Tool from "./tool"
import DESCRIPTION from "./self-test-tracker.txt"

export const Parameters = Schema.Struct({
  task_id: Schema.String.annotate({
    description: "Brief id or Spec task id (spec:<slug>:G<N>) — same task_id used for cycle_tracker",
  }),
  test_file_path: Schema.String.annotate({
    description: "Path (relative to the workspace root) to the unit test covering this change, e.g. <module>.test.ts",
  }),
})

export const SelfTestTrackerTool = Tool.define(
  "self_test_tracker",
  Effect.succeed({
    description: DESCRIPTION,
    parameters: Parameters,
    execute: (params: Schema.Schema.Type<typeof Parameters>, _ctx: Tool.Context) =>
      Effect.gen(function* () {
        const instance = yield* InstanceState.context
        const result = yield* Effect.promise(async () => {
          let cycle: number
          try {
            cycle = await incrementSelfTestCycle(instance.directory, params.task_id)
          } catch (error) {
            if (error instanceof SelfTestCycleLimitExceeded) {
              const last = await readLastSelfTestAttempt(instance.directory, params.task_id)
              const escalation = await writeSelfTestEscalation(instance.directory, {
                task_id: params.task_id,
                last_exit_code: last?.exitCode ?? -1,
                test_file_path: last?.testFilePath ?? params.test_file_path,
              })
              return {
                title: "self-test limit reached",
                output: `Self-test cycle limit (3) exceeded for task_id "${params.task_id}" — do NOT call execution_summary_write, do NOT delegate to the avaliador (it must never learn this loop ran). Escalate directly to the human now via a chat message, using the last self-test output from this conversation. Minimal record saved to ${escalation.relativePath}.`,
                metadata: {},
              }
            }
            throw error
          }

          const test = await runExecutorSelfTest(instance.directory, params.test_file_path)
          await recordSelfTestAttempt(instance.directory, params.task_id, {
            exitCode: test.exitCode,
            testFilePath: params.test_file_path,
          })

          if (!test.success) {
            return {
              title: `self-test failed (${cycle}/3)`,
              output: `Self-test cycle ${cycle}/3 for "${params.test_file_path}" failed with exit code ${test.exitCode}. Fix the code and call self_test_tracker again — do not call execution_summary_write yet.\n\n${test.output}`,
              metadata: {},
            }
          }

          return {
            title: `self-test passed (${cycle}/3)`,
            output: `Self-test cycle ${cycle}/3 for "${params.test_file_path}" passed. Authorized to proceed to execution_summary_write.`,
            metadata: {},
          }
        })
        return result
      }),
  } satisfies Tool.DefWithoutID<typeof Parameters>),
)

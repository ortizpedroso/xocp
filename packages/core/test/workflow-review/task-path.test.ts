import { afterEach, describe, expect, test } from "bun:test"
import fs from "fs/promises"
import os from "os"
import path from "path"
import {
  SPEC_TASK_ID,
  taskKind,
  sanitizeTaskId,
  contractRelativePath,
  reviewsRelativeDir,
} from "../../src/workflow-review/task-path"

describe("task-path", () => {
  test("SPEC_TASK_ID matches both root specs and backlog chunks", () => {
    // Root specs
    expect(SPEC_TASK_ID.test("spec:workflow-pipeline-v2")).toBe(true)
    expect(SPEC_TASK_ID.test("spec:auth-system")).toBe(true)

    // Backlog chunks with :G<N>
    expect(SPEC_TASK_ID.test("spec:workflow-pipeline-v2:G1")).toBe(true)
    expect(SPEC_TASK_ID.test("spec:workflow-pipeline-v2:G12")).toBe(true)

    // Non-spec tasks (briefs)
    expect(SPEC_TASK_ID.test("brief-core-setup")).toBe(false)
    expect(SPEC_TASK_ID.test("task:some-thing")).toBe(false)
    expect(SPEC_TASK_ID.test("spec_invalid")).toBe(false)
  })

  test("taskKind returns 'spec' for root and chunk specs, 'brief' otherwise", () => {
    expect(taskKind("spec:workflow-pipeline-v2")).toBe("spec")
    expect(taskKind("spec:workflow-pipeline-v2:G1")).toBe("spec")
    expect(taskKind("brief-core-setup")).toBe("brief")
    expect(taskKind("feature-xyz")).toBe("brief")
  })

  test("sanitizeTaskId removes or replaces Windows-illegal filename characters", () => {
    // Windows illegal: < > : " / \ | ? *
    const dangerous = 'spec:test<one>two"three/four\\five|six?seven*eight'
    const sanitized = sanitizeTaskId(dangerous)

    expect(sanitized).not.toMatch(/[<>:"/\\|?*]/)
    expect(sanitized).toBe("spec_test_one_two_three_four_five_six_seven_eight")
  })

  test("contractRelativePath resolves specs to specs/${slug}.md for both root and chunk tasks", () => {
    expect(contractRelativePath("spec:workflow-pipeline-v2")).toBe("specs/workflow-pipeline-v2.md")
    expect(contractRelativePath("spec:workflow-pipeline-v2:G1")).toBe("specs/workflow-pipeline-v2.md")
    expect(contractRelativePath("spec:auth-flow:G3")).toBe("specs/auth-flow.md")
  })

  test("contractRelativePath resolves briefs with sanitized path", () => {
    expect(contractRelativePath("brief-demo-01")).toBe(path.join(".opencode", "briefs", "brief-demo-01.yaml"))
    expect(contractRelativePath("brief:sub/module*01")).toBe(path.join(".opencode", "briefs", "brief_sub_module_01.yaml"))
  })

  test("reviewsRelativeDir produces Windows-safe directory name", () => {
    expect(reviewsRelativeDir("spec:workflow-pipeline-v2:G1")).toBe(
      path.join(".opencode", "reviews", "spec_workflow-pipeline-v2_G1")
    )
    expect(reviewsRelativeDir("brief-123")).toBe(path.join(".opencode", "reviews", "brief-123"))
  })
})

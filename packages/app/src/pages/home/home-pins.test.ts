import { describe, expect, test } from "bun:test"
import type { Session } from "@opencode-ai/sdk/v2/client"
import type { HomeSessionRecord } from "./home-sessions-controller"
import { homeSessionPinKey } from "./home-pins"

describe("home-pins", () => {
  test("homeSessionPinKey is stable per directory and session id", () => {
    const record = {
      session: { id: "sess-1", directory: "/workspace/a" } as Session,
      project: { worktree: "/workspace/a", expanded: true },
      projectName: "A",
    } satisfies HomeSessionRecord
    expect(homeSessionPinKey(record)).toBe("/workspace/a:sess-1")
  })
})

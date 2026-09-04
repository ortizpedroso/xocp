import { describe, expect, test } from "bun:test"
import { homeSessionPinKey } from "./home-pins"

describe("home-pins", () => {
  test("homeSessionPinKey is stable per directory and session id", () => {
    const record = {
      session: { id: "sess-1", directory: "/workspace/a" },
      project: { worktree: "/workspace/a", expanded: true },
      projectName: "A",
    } as const
    expect(homeSessionPinKey(record)).toBe("/workspace/a:sess-1")
  })
})

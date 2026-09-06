import { describe, expect, test } from "bun:test"
import path from "path"

describe("AGENTS.md specialized roles bootstrap", () => {
  test("points agents to workflow-pipeline-v2 and elicitador spec docs", async () => {
    const agentsMd = await Bun.file(path.join(import.meta.dirname, "../../../AGENTS.md")).text()
    expect(agentsMd.includes("## Papéis especializados deste projeto")).toBe(true)
    expect(agentsMd.includes("specs/xocp/workflow-pipeline-v2.md")).toBe(true)
    expect(agentsMd.includes("specs/xocp/elicitador-spec-system.md")).toBe(true)
    expect(agentsMd.includes("Isso não é opcional")).toBe(true)
  })

  test("referenced spec documents exist in the repository", async () => {
    const root = path.join(import.meta.dirname, "../../..")
    expect(await Bun.file(path.join(root, "specs/xocp/workflow-pipeline-v2.md")).exists()).toBe(true)
    expect(await Bun.file(path.join(root, "specs/xocp/elicitador-spec-system.md")).exists()).toBe(true)
  })
})

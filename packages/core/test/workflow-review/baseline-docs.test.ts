import { describe, expect, test } from "bun:test"
import path from "path"

describe("specs/xocp/baseline-global.md baseline documentation assertions", () => {
  test("static assertion: baseline-global.md exists and contains all 11 exact rule identifiers", async () => {
    const specPath = path.resolve(__dirname, "../../../../specs/xocp/baseline-global.md")
    const exists = await Bun.file(specPath).exists()
    expect(exists).toBe(true)

    const content = await Bun.file(specPath).text()

    // Assert all 6 Security rules
    const securityRules = [
      "G-SEC-1",
      "G-SEC-2",
      "G-SEC-3",
      "G-SEC-4",
      "G-SEC-5",
      "G-SEC-6",
    ]

    for (const rule of securityRules) {
      expect(content).toContain(rule)
    }

    // Assert all 5 UI/UX rules
    const uxRules = [
      "G-UX-1",
      "G-UX-2",
      "G-UX-3",
      "G-UX-4",
      "G-UX-5",
    ]

    for (const rule of uxRules) {
      expect(content).toContain(rule)
    }
  })
})

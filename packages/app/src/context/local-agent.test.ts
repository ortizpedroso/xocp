import { describe, expect, test } from "bun:test"
import { hasCustomAgent, resolveAgent } from "./local-agent"

describe("hasCustomAgent", () => {
  test("detects explicitly custom agents", () => {
    expect(hasCustomAgent([{ native: true }, { native: false }])).toBe(true)
  })

  test("ignores built-in and unclassified agents", () => {
    expect(hasCustomAgent([{ native: true }, {}])).toBe(false)
  })

  test("detects XOCP pipeline agents", () => {
    expect(hasCustomAgent([{ native: true, pipeline: true }, { native: true }])).toBe(true)
  })
})

describe("@ mention agent filter", () => {
  const mentionable = (agents: Array<{ name: string; mode?: string; hidden?: boolean }>) =>
    agents.filter((agent) => !agent.hidden && agent.mode !== "primary")

  test("excludes primary pipeline agents from @ suggestions", () => {
    const agents = [
      { name: "elicitador", mode: "primary", hidden: false },
      { name: "workflow-triador", mode: "primary", hidden: false },
      { name: "explore", mode: "subagent", hidden: false },
      { name: "general", mode: "subagent", hidden: false },
    ]

    expect(mentionable(agents).map((agent) => agent.name)).toEqual(["explore", "general"])
  })
})

describe("resolveAgent", () => {
  const agents = [{ name: "plan" }, { name: "build" }, { name: "custom" }]

  test("uses the requested available agent", () => {
    expect(resolveAgent(agents, "custom")?.name).toBe("custom")
  })

  test("defaults to build", () => {
    expect(resolveAgent(agents)?.name).toBe("build")
    expect(resolveAgent(agents, "missing")?.name).toBe("build")
  })

  test("uses the first agent when build is unavailable", () => {
    expect(resolveAgent([{ name: "custom" }], "missing")?.name).toBe("custom")
  })
})

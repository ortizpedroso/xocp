import { afterEach, describe, expect, test } from "bun:test"
import fs from "fs/promises"
import os from "os"
import path from "path"
import { shouldTriggerGraphify, executeGraphifyTriage } from "../../src/graphify/trigger"

const dirs: string[] = []

afterEach(async () => {
  for (const dir of dirs.splice(0)) {
    await fs.rm(dir, { recursive: true, force: true })
  }
})

async function tmpdir() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "graphify-trigger-"))
  dirs.push(dir)
  return dir
}

describe("graphify/trigger", () => {
  test("bypass rule: returns false for tasks categorized as research, documentation, or isolated script", async () => {
    const dir = await tmpdir()
    await Bun.write(path.join(dir, "package.json"), "{}")

    // Pure research
    expect(
      await shouldTriggerGraphify(dir, {
        category: "research",
        action: "FLUXO_NORMAL",
      })
    ).toBe(false)

    // Documentation (.md)
    expect(
      await shouldTriggerGraphify(dir, {
        category: "documentation",
        target_files: ["docs/readme.md"],
      })
    ).toBe(false)

    // Script execution
    expect(
      await shouldTriggerGraphify(dir, {
        category: "script",
        target_files: ["deploy.sh"],
      })
    ).toBe(false)

    // Target files all markdown without DIVIDIR
    expect(
      await shouldTriggerGraphify(dir, {
        target_files: ["specs/auth.md", "README.md"],
        action: "FLUXO_NORMAL",
      })
    ).toBe(false)
  })

  test("trigger rule: returns true if workspace contains manifest and intent is DIVIDIR or multi-module refactor", async () => {
    const dir = await tmpdir()
    await Bun.write(path.join(dir, "package.json"), "{}")

    // DIVIDIR action on package.json project
    expect(
      await shouldTriggerGraphify(dir, {
        action: "DIVIDIR",
        category: "feature",
      })
    ).toBe(true)

    // Multi-module refactor
    expect(
      await shouldTriggerGraphify(dir, {
        category: "refactor",
        is_multi_module: true,
      })
    ).toBe(true)

    // Normal single-file fix should not trigger
    expect(
      await shouldTriggerGraphify(dir, {
        action: "FLUXO_NORMAL",
        category: "bugfix",
        is_multi_module: false,
      })
    ).toBe(false)
  })

  test("returns false when workspace has no manifest (Cargo, go.mod, package.json, pyproject.toml)", async () => {
    const dir = await tmpdir()
    // Empty directory, no manifest

    expect(
      await shouldTriggerGraphify(dir, {
        action: "DIVIDIR",
        category: "refactor",
      })
    ).toBe(false)
  })

  test("executeGraphifyTriage degrades gracefully with warning if uv binary missing", async () => {
    const dir = await tmpdir()
    await Bun.write(path.join(dir, "package.json"), "{}")

    const result = await executeGraphifyTriage(dir, {
      action: "DIVIDIR",
      category: "refactor",
    })

    // In environments without uv or with uv, either triggered is true or warning is populated
    if (!result.triggered) {
      expect(result.warning).toContain("Graphify.UvNotFound")
    } else {
      expect(result.triggered).toBe(true)
    }
  })
})

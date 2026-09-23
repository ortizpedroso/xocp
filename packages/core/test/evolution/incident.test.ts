import { afterEach, describe, expect, test } from "bun:test"
import fs from "fs/promises"
import os from "os"
import path from "path"
import { recordIncident, type IncidentPayload } from "../../src/evolution/incident"

const dirs: string[] = []

afterEach(async () => {
  for (const dir of dirs.splice(0)) {
    await fs.rm(dir, { recursive: true, force: true })
  }
})

async function tmpdir() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "incident-test-"))
  dirs.push(dir)
  return dir
}

describe("evolution/incident", () => {
  test("persists structured incident JSON in .opencode/evolution/ on cycle threshold or contract failure", async () => {
    const dir = await tmpdir()

    const recorded = await recordIncident(dir, {
      task_id: "brief-auth-jwt-01",
      cycles_used: 4,
      root_cause_category: "cycle_threshold_reached",
      symptom: "Cycle limit exceeded (4 > 3)",
      context_snapshot: {
        last_error: "Verification failed on unit test",
        affected_files: ["src/auth.ts"],
      },
    })

    expect(recorded.id).toMatch(/^inc-/)
    expect(recorded.task_id).toBe("brief-auth-jwt-01")
    expect(recorded.cycles_used).toBe(4)
    expect(recorded.root_cause_category).toBe("cycle_threshold_reached")

    // Verify file on disk
    const incidentPath = path.join(dir, ".opencode", "evolution", `incident-${recorded.id}.json`)
    expect(await Bun.file(incidentPath).exists()).toBe(true)

    const diskContent = (await Bun.file(incidentPath).json()) as IncidentPayload
    expect(diskContent.id).toBe(recorded.id)
    expect(diskContent.task_id).toBe("brief-auth-jwt-01")
    expect(diskContent.context_snapshot).toEqual({
      last_error: "Verification failed on unit test",
      affected_files: ["src/auth.ts"],
    })
  })
})

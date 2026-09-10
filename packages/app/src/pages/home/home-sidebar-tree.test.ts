import { describe, expect, test } from "bun:test"
import type { Session } from "@opencode-ai/sdk/v2/client"
import type { LocalProject } from "@/context/layout"
import {
  buildAllHomeSessionRecords,
  buildHomeSidebarTree,
  sessionBelongsToOpenProject,
  sessionMatchesProject,
} from "./home-sidebar-tree"
import { homeSessionPinKey } from "./home-pins"

const projectA: LocalProject = {
  id: "proj-a",
  worktree: "/workspace/a",
  expanded: true,
  sandboxes: [],
}

const projectB: LocalProject = {
  id: "proj-b",
  worktree: "/workspace/b",
  expanded: true,
  sandboxes: [],
}

function session(id: string, directory: string, projectID = "proj-a"): Session {
  return {
    id,
    projectID,
    directory,
    title: id,
    time: { created: 1, updated: 1 },
  } as Session
}

describe("home-sidebar-tree", () => {
  test("sessionMatchesProject matches worktree and projectID", () => {
    expect(sessionMatchesProject(session("s1", "/workspace/a"), projectA)).toBe(true)
    expect(sessionMatchesProject(session("s2", "/other", "proj-a"), projectA)).toBe(true)
    expect(sessionMatchesProject(session("s3", "/workspace/b", "proj-b"), projectA)).toBe(false)
  })

  test("buildAllHomeSessionRecords keeps sessions with known projects", () => {
    const records = buildAllHomeSessionRecords({
      sessions: () => [session("s1", "/workspace/a"), session("s2", "/workspace/b", "proj-b")],
      projects: () => [projectA, projectB],
      projectByID: () => new Map([
        ["proj-a", projectA],
        ["proj-b", projectB],
      ]),
    })
    expect(records.map((record) => record.session.id)).toEqual(["s1", "s2"])
  })

  test("loose sessions appear at top level when project is not open", () => {
    const records = buildAllHomeSessionRecords({
      sessions: () => [session("loose", "/workspace/b", "proj-b")],
      projects: () => [projectA, projectB],
      projectByID: () => new Map([
        ["proj-a", projectA],
        ["proj-b", projectB],
      ]),
    })
    const tree = buildHomeSidebarTree({
      projects: [projectA],
      records,
      pinnedProjects: [],
      pinnedSessions: [],
    })
    expect(tree.looseSessions.map((record) => record.session.id)).toEqual(["loose"])
    expect(tree.projects).toHaveLength(1)
    expect(tree.projects[0]?.sessions).toHaveLength(0)
  })

  test("pinned projects and sessions sort to the top of their groups", () => {
    const records = buildAllHomeSessionRecords({
      sessions: () => {
        const old = session("s-old", "/workspace/a")
        const newer = session("s-new", "/workspace/a")
        old.time.updated = 1
        newer.time.updated = 2
        return [old, newer, session("s-b", "/workspace/b", "proj-b")]
      },
      projects: () => [projectA, projectB],
      projectByID: () => new Map([
        ["proj-a", projectA],
        ["proj-b", projectB],
      ]),
    })
    const oldRecord = records.find((record) => record.session.id === "s-old")!
    const pinnedSession = homeSessionPinKey(oldRecord)
    const tree = buildHomeSidebarTree({
      projects: [projectA, projectB],
      records,
      pinnedProjects: [projectB.worktree],
      pinnedSessions: [pinnedSession],
    })
    expect(tree.projects[0]?.project.worktree).toBe(projectB.worktree)
    expect(tree.projects[1]?.sessions.map((record) => record.session.id)).toEqual(["s-old", "s-new"])
  })

  test("sessionBelongsToOpenProject requires an open project match", () => {
    expect(sessionBelongsToOpenProject(session("s1", "/workspace/a"), [projectA])).toBe(true)
    expect(sessionBelongsToOpenProject(session("s2", "/workspace/b", "proj-b"), [projectA])).toBe(false)
  })

  test("hidden sessions are excluded from the tree and counted per group", () => {
    const records = buildAllHomeSessionRecords({
      sessions: () => [
        session("visible", "/workspace/a"),
        session("hidden", "/workspace/a"),
        session("loose-hidden", "/workspace/b", "proj-b"),
      ],
      projects: () => [projectA, projectB],
      projectByID: () => new Map([
        ["proj-a", projectA],
        ["proj-b", projectB],
      ]),
    })
    const hiddenRecord = records.find((record) => record.session.id === "hidden")!
    const looseHiddenRecord = records.find((record) => record.session.id === "loose-hidden")!
    const tree = buildHomeSidebarTree({
      projects: [projectA],
      records,
      pinnedProjects: [],
      pinnedSessions: [],
      hiddenSessions: [homeSessionPinKey(hiddenRecord), homeSessionPinKey(looseHiddenRecord)],
    })
    expect(tree.projects[0]?.sessions.map((record) => record.session.id)).toEqual(["visible"])
    expect(tree.projects[0]?.hiddenCount).toBe(1)
    expect(tree.looseSessions.map((record) => record.session.id)).toEqual([])
    expect(tree.looseHiddenCount).toBe(1)
  })
})

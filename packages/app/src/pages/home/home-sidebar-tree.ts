import type { Session } from "@opencode-ai/sdk/v2/client"
import type { LocalProject } from "@/context/layout"
import { compareSessionTime, displayName, projectForSession } from "@/pages/layout/helpers"
import { pathKey } from "@/utils/path-key"
import type { HomeSessionRecord } from "./home-sessions-controller"
import { homeSessionPinKey } from "./home-pins"

export type HomeSidebarProjectNode = {
  project: LocalProject
  sessions: HomeSessionRecord[]
  pinned: boolean
  hiddenCount: number
}

export type HomeSidebarTree = {
  looseSessions: HomeSessionRecord[]
  looseHiddenCount: number
  projects: HomeSidebarProjectNode[]
}

export function buildAllHomeSessionRecords(input: {
  sessions: () => Session[]
  projects: () => LocalProject[]
  projectByID: () => Map<string, LocalProject>
}) {
  return [...new Map(input.sessions().map((session) => [session.id, session] as const)).values()]
    .sort(compareSessionTime)
    .map((session) => {
      const project =
        projectForSession(session, input.projects(), input.projectByID()) ??
        ({
          worktree: session.directory,
          expanded: false,
        } satisfies LocalProject)
      return { session, project, projectName: displayName(project) }
    })
}

export function projectDirectories(project: LocalProject) {
  return [project.worktree, ...(project.sandboxes ?? [])]
}

export function sessionMatchesProject(session: Session, project: LocalProject) {
  const directory = pathKey(session.directory)
  return (
    pathKey(project.worktree) === directory ||
    project.sandboxes?.some((sandbox) => pathKey(sandbox) === directory) ||
    (!!session.projectID && project.id === session.projectID)
  )
}

export function sessionBelongsToOpenProject(session: Session, projects: LocalProject[]) {
  return projects.some((project) => sessionMatchesProject(session, project))
}

export function buildHomeSidebarTree(input: {
  projects: LocalProject[]
  records: HomeSessionRecord[]
  pinnedProjects: string[]
  pinnedSessions: string[]
  hiddenSessions?: string[]
}) {
  const hidden = new Set(input.hiddenSessions ?? [])
  const visible = (records: HomeSessionRecord[]) =>
    records.filter((record) => !hidden.has(homeSessionPinKey(record)))
  const openProjects = input.projects
  const looseRecords = input.records.filter((record) => !sessionBelongsToOpenProject(record.session, openProjects))
  const looseSessions = sortSessions(visible(looseRecords), input.pinnedSessions)
  const looseHiddenCount = looseRecords.filter((record) => hidden.has(homeSessionPinKey(record))).length
  const projects = sortProjects(openProjects, input.pinnedProjects).map((project) => {
    const projectRecords = input.records.filter((record) => sessionMatchesProject(record.session, project))
    return {
      project,
      pinned: input.pinnedProjects.includes(project.worktree),
      sessions: sortSessions(visible(projectRecords), input.pinnedSessions),
      hiddenCount: projectRecords.filter((record) => hidden.has(homeSessionPinKey(record))).length,
    }
  })
  return { looseSessions, looseHiddenCount, projects }
}

function sortProjects(projects: LocalProject[], pinned: string[]) {
  const pinnedSet = new Set(pinned)
  const pinnedItems = pinned.flatMap((worktree) => {
    const project = projects.find((item) => item.worktree === worktree)
    return project ? [project] : []
  })
  const rest = projects.filter((project) => !pinnedSet.has(project.worktree))
  return [...pinnedItems, ...rest]
}

function sortSessions(records: HomeSessionRecord[], pinned: string[]) {
  const pinnedSet = new Set(pinned)
  const pinnedItems = pinned.flatMap((key) => {
    const record = records.find((item) => homeSessionPinKey(item) === key)
    return record ? [record] : []
  })
  const rest = records.filter((record) => !pinnedSet.has(homeSessionPinKey(record)))
  return [...pinnedItems, ...rest]
}

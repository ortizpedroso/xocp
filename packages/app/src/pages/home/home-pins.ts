import { ServerConnection } from "@/context/server"
import { Persist, persisted } from "@/utils/persist"
import { pathKey } from "@/utils/path-key"
import { createResource, type Accessor } from "solid-js"
import { createStore } from "solid-js/store"
import type { HomeSessionRecord } from "./home-sessions-controller"

export type HomePinsState = {
  projects: Record<string, string[]>
  sessions: Record<string, string[]>
}

export function homeSessionPinKey(record: HomeSessionRecord) {
  return `${pathKey(record.session.directory)}:${record.session.id}`
}

export function createHomePinsController(serverKey: Accessor<ServerConnection.Key>) {
  const [_state, setState, _, ready] = persisted(
    Persist.global("home.pins", ["home.pins.v1"]),
    createStore<HomePinsState>({ projects: {}, sessions: {} }),
  )
  const [state] = createResource(
    () => ready.promise ?? Promise.resolve(),
    (promise) => promise.then(() => _state),
    { initialValue: _state },
  )

  function pinnedProjects() {
    return state().projects[serverKey()] ?? []
  }

  function pinnedSessions() {
    return state().sessions[serverKey()] ?? []
  }

  function toggleProject(worktree: string) {
    const key = serverKey()
    const current = pinnedProjects()
    const next = current.includes(worktree) ? current.filter((item) => item !== worktree) : [worktree, ...current]
    setState("projects", key, next)
  }

  function toggleSession(sessionKey: string) {
    const key = serverKey()
    const current = pinnedSessions()
    const next = current.includes(sessionKey) ? current.filter((item) => item !== sessionKey) : [sessionKey, ...current]
    setState("sessions", key, next)
  }

  function isProjectPinned(worktree: string) {
    return pinnedProjects().includes(worktree)
  }

  function isSessionPinned(sessionKey: string) {
    return pinnedSessions().includes(sessionKey)
  }

  return {
    pinnedProjects,
    pinnedSessions,
    toggleProject,
    toggleSession,
    isProjectPinned,
    isSessionPinned,
  }
}

export type HomePinsController = ReturnType<typeof createHomePinsController>

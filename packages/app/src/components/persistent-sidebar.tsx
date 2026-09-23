import type { Session } from "@opencode-ai/sdk/v2/client"
import { createEffect, createMemo, For, Show, startTransition, type Accessor } from "solid-js"
import { createStore } from "solid-js/store"
import { useNavigate } from "@solidjs/router"
import { useLanguage } from "@/context/language"
import { ServerConnection } from "@/context/server"
import { sessionHasOpenTab, useTabs } from "@/context/tabs"
import { Persist, persisted } from "@/utils/persist"
import { pathKey } from "@/utils/path-key"
import { displayName, toggleHomeProjectSelection } from "@/pages/layout/helpers"
import {
  groupSessionsByProject,
  type HomeSessionRecord,
} from "@/pages/home/home-sessions-controller"
import type { HomeController } from "@/pages/home/home-controller"

/**
 * Persistent left sidebar (Claude/Gemini style).
 *
 * Always visible on the home route, showing:
 * - a "New chat" action that opens a session without requiring a project;
 * - all projects as collapsible sections with their sessions nested inside;
 * - a standalone "Chats sem projeto" section for sessions outside any project.
 */
export function PersistentSidebar(props: { home: HomeController }) {
  const navigate = useNavigate()
  const tabs = useTabs()
  const language = useLanguage()
  const home = props.home

  const [state, setState] = persisted(
    Persist.global("home.sidebar", ["home.sidebar.v1"]),
    createStore({ collapsed: {} as Record<string, boolean> }),
  )

  const selectedDirectory = createMemo(() => home.selection.value().directory)
  const focusedConn = createMemo(() => home.server.focused())

  const isCollapsed = (key: string) => state.collapsed[key] ?? false
  const toggleCollapsed = (key: string) => setState("collapsed", key, !isCollapsed(key))

  // All sessions of the focused server (no HOME_SESSION_LIMIT cap here so the
  // sidebar can list every session grouped by its project).
  const allRecords = createMemo<HomeSessionRecord[]>(() => {
    const ctx = home.server.focusedContext()
    if (!ctx) return []
    const seen = new Set<string>()
    const sessions = home.project.list().flatMap((project) => {
      const directories = [project.worktree, ...(project.sandboxes ?? [])].map(pathKey)
      const store = ctx.sync.child(project.worktree, { bootstrap: false })[0]
      return (store.session ?? []).filter(
        (session: Session) =>
          directories.includes(pathKey(session.directory)) &&
          !session.parentID &&
          !session.time?.archived &&
          !seen.has(session.id) &&
          seen.add(session.id) !== undefined,
      )
    })
    return [...sessions]
      .sort((a, b) => (b.time.updated ?? b.time.created) - (a.time.updated ?? a.time.created))
      .map((session) => ({
        session,
        project:
          home.project
            .list()
            .find(
              (item) =>
                pathKey(item.worktree) === pathKey(session.directory) ||
                item.sandboxes?.some((sandbox) => pathKey(sandbox) === pathKey(session.directory)),
            ) ?? home.project.list()[0]!,
        projectName: "",
      }))
      .filter((record) => !!record.project)
      .map((record) => ({ ...record, projectName: displayName(record.project) }))
  })

  const recordsForProject = (worktree: string) =>
    allRecords().filter((record) => pathKey(record.project.worktree) === pathKey(worktree))

  const orphanGroups = createMemo(() => {
    const knownDirectories = new Set(home.project.list().flatMap((project) => [project.worktree, ...(project.sandboxes ?? [])]))
    const orphans = allRecords().filter((record) => !knownDirectories.has(record.session.directory))
    return groupSessionsByProject(orphans)
  })

  function openSession(session: Session) {
    const conn = focusedConn()
    if (!conn) return
    const server = ServerConnection.key(conn)
    startTransition(() => {
      const tab = tabs.addSessionTab({ server, sessionId: session.id })
      tabs.select(tab)
    })
  }

  function selectProject(directory: string | undefined) {
    const conn = focusedConn()
    if (!conn) return
    const key = ServerConnection.key(conn)
    home.selection.set(
      directory ? toggleHomeProjectSelection({ server: key }, key, directory) : { server: key },
    )
  }

  function newChat() {
    const project = home.project.newSession()
    const conn = focusedConn()
    if (project && conn) {
      home.project.openProjectNewSession(conn, project.worktree)
      return
    }
    navigate("/new-session")
  }

  // Keep the selected project expanded automatically when navigating to it.
  createEffect(() => {
    const directory = selectedDirectory()
    if (!directory) return
    if (isCollapsed(pathKey(directory))) setState("collapsed", pathKey(directory), false)
  })

  const isOpen = (record: HomeSessionRecord) =>
    sessionHasOpenTab(tabs.store, home.selection.value().server, record.session)

  return (
    <nav
      aria-label={language.t("sidebar.projects.title")}
      class="w-[260px] shrink-0 h-full flex flex-col border-r border-border-weak-base bg-background-base min-h-0"
    >
      <div class="p-3 pb-2 shrink-0">
        <button
          type="button"
          onClick={newChat}
          data-action="sidebar-new-chat"
          class="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left transition-colors hover:bg-surface-raised-base-hover active:bg-surface-raised-base-active text-text-strong text-14-medium"
        >
          <span class="text-icon-large-plus w-4 h-4 shrink-0" aria-hidden />
          <span>{language.t("command.session.new")}</span>
        </button>
      </div>

      <div class="flex-1 min-h-0 overflow-y-auto no-scrollbar px-2 pb-3 flex flex-col gap-1">
        <Show
          when={home.project.list().length > 0}
          fallback={
            <div class="px-3 py-6 text-center text-12-regular text-text-weak">
              {language.t("sidebar.projects.empty")}
            </div>
          }
        >
          <For each={home.project.list()}>
            {(project) => {
              const key = () => pathKey(project.worktree)
              const sessions = () => recordsForProject(project.worktree)
              const collapsed = () => isCollapsed(key())
              const selected = () => selectedDirectory() === project.worktree
              return (
                <div
                  classList={{
                    "rounded-lg transition-colors": true,
                    "bg-surface-base-selected": selected(),
                  }}
                >
                  <button
                    type="button"
                    data-action="sidebar-project-toggle"
                    onClick={() => {
                      selectProject(project.worktree)
                      toggleCollapsed(key())
                    }}
                    class="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left hover:bg-surface-raised-base-hover min-w-0"
                  >
                    <span
                      class="shrink-0 text-icon-base transition-transform duration-150"
                      classList={{ "rotate-90": !collapsed() }}
                      aria-hidden
                    >
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                        <path
                          d="M4 2.5L8 6L4 9.5"
                          stroke="currentColor"
                          stroke-width="1.5"
                          stroke-linecap="round"
                          stroke-linejoin="round"
                        />
                      </svg>
                    </span>
                    <span class="truncate text-13-medium text-text-strong">{displayName(project)}</span>
                    <Show when={sessions().length > 0}>
                      <span class="ml-auto shrink-0 text-11-regular text-text-weak tabular-nums">
                        {sessions().length}
                      </span>
                    </Show>
                  </button>
                  <Show when={!collapsed()}>
                    <div class="pl-3 pr-1 pb-1 flex flex-col gap-0.5">
                      <Show
                        when={sessions().length > 0}
                        fallback={
                          <div class="px-2 py-1 text-12-regular text-text-weak">
                            {language.t("sidebar.project.noSessions")}
                          </div>
                        }
                      >
                        <For each={sessions()}>{(record) => <SessionRow record={record} onOpen={openSession} active={isOpen(record)} />}</For>
                      </Show>
                      <button
                        type="button"
                        data-action="sidebar-project-new-session"
                        onClick={() => {
                          const conn = focusedConn()
                          if (conn) home.project.openProjectNewSession(conn, project.worktree)
                        }}
                        class="w-full flex items-center gap-2 px-2 py-1 rounded-md text-left text-12-regular text-text-weak hover:text-text-base hover:bg-surface-raised-base-hover"
                      >
                        <span aria-hidden>+</span>
                        <span>{language.t("command.session.new")}</span>
                      </button>
                    </div>
                  </Show>
                </div>
              )
            }}
          </For>

          <Show when={orphans().length > 0}>
            <div class="mt-2 pt-2 border-t border-border-weak-base flex flex-col gap-1">
              <For each={orphans()}>
                {(group) => (
                  <div>
                    <button
                      type="button"
                      onClick={() => toggleCollapsed(group.id)}
                      class="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left hover:bg-surface-raised-base-hover"
                    >
                      <span
                        class="shrink-0 text-icon-base transition-transform duration-150"
                        classList={{ "rotate-90": !isCollapsed(group.id) }}
                        aria-hidden
                      >
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                          <path
                            d="M4 2.5L8 6L4 9.5"
                            stroke="currentColor"
                            stroke-width="1.5"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                          />
                        </svg>
                      </span>
                      <span class="truncate text-13-medium text-text-base">{group.title}</span>
                    </button>
                    <Show when={!isCollapsed(group.id)}>
                      <div class="pl-3 pr-1 pb-1 flex flex-col gap-0.5">
                        <For each={group.sessions}>{(record) => <SessionRow record={record} onOpen={openSession} active={isOpen(record)} />}</For>
                      </div>
                    </Show>
                  </div>
                )}
              </For>
            </div>
          </Show>
        </Show>
      </div>

      <div class="shrink-0 p-2 border-t border-border-weak-base">
        <button
          type="button"
          onClick={() => navigate("/documentacao")}
          class="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left text-12-regular text-text-weak hover:text-text-base hover:bg-surface-raised-base-hover"
        >
          <span>{language.t("sidebar.documentation")}</span>
        </button>
      </div>
    </nav>
  )
}

function SessionRow(props: {
  record: HomeSessionRecord
  active: Accessor<boolean>
  onOpen: (session: Session) => void
}) {
  const title = () => props.record.session.title || props.record.session.id
  return (
    <button
      type="button"
      data-action="sidebar-session-open"
      onClick={() => props.onOpen(props.record.session)}
      classList={{
        "w-full truncate px-2 py-1 rounded-md text-left text-12-regular transition-colors": true,
        "text-text-base hover:bg-surface-raised-base-hover": !props.active(),
        "text-text-strong font-medium bg-surface-raised-base-hover": props.active(),
      }}
      title={title()}
    >
      {title()}
    </button>
  )
}

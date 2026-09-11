import { createMemo, For, Show, type JSX } from "solid-js"
import { createStore } from "solid-js/store"
import { A, useLocation, useNavigate, useParams } from "@solidjs/router"
import type { Session } from "@opencode-ai/sdk/v2/client"
import { Icon as IconV2 } from "@opencode-ai/ui/v2/icon"
import { getFilename } from "@opencode-ai/core/util/path"
import { useLayout, type LocalProject } from "@/context/layout"
import { useServer } from "@/context/server"
import { useServerSDK } from "@/context/server-sdk"
import { useServerSync } from "@/context/server-sync"
import { useLanguage } from "@/context/language"
import { pathKey } from "@/utils/path-key"
import { sessionHref } from "@/utils/session-route"
import { displayName, sortedRootSessions } from "@/pages/layout/helpers"
import { ProjectIcon, SessionItem, SessionSkeleton, type SessionItemProps } from "@/pages/layout/sidebar-items"

const sidebarExpanded = () => true
const noop = () => {}

function ProjectSection(props: {
  directory: string
  isLocal: boolean
  expanded: boolean
  onToggle: () => void
  sessionProps: Omit<SessionItemProps, "session" | "list" | "slug" | "mobile" | "dense">
}): JSX.Element {
  const serverSync = useServerSync()
  const language = useLanguage()
  // Mounted only while the parent project is expanded, so always bootstrap here regardless of
  // this section's own (purely visual) expanded state -- it can be toggled open later.
  const [store] = serverSync().child(props.directory, { bootstrap: true })
  const sessions = createMemo(() => sortedRootSessions(store, Date.now()))
  const label = createMemo(() => {
    const kind = props.isLocal ? language.t("workspace.type.local") : language.t("workspace.type.sandbox")
    const branch = store.vcs?.branch
    return `${kind} : ${branch ?? getFilename(props.directory)}`
  })

  return (
    <div class="flex flex-col">
      <button
        type="button"
        class="flex min-w-0 items-center gap-1.5 rounded-md py-1 pl-6 pr-2 text-left hover:bg-v2-background-bg-hover"
        onClick={props.onToggle}
        aria-expanded={props.expanded}
      >
        <IconV2
          name="chevron-down"
          size="small"
          class={`shrink-0 text-v2-icon-icon-muted transition-transform ${props.expanded ? "" : "-rotate-90"}`}
        />
        <span class="min-w-0 flex-1 truncate text-13-medium text-v2-text-text-muted">{label()}</span>
      </button>
      <Show when={props.expanded}>
        <div class="flex flex-col pl-4">
          <Show when={sessions().length > 0} fallback={<SessionSkeleton count={2} />}>
            <For each={sessions()}>
              {(session) => (
                <SessionItem
                  {...props.sessionProps}
                  session={session}
                  list={sessions()}
                  slug=""
                  dense
                />
              )}
            </For>
          </Show>
        </div>
      </Show>
    </div>
  )
}

function ProjectNode(props: {
  project: LocalProject
  sessionProps: Omit<SessionItemProps, "session" | "list" | "slug" | "mobile" | "dense">
  sectionsExpanded: Record<string, boolean>
  onToggleSection: (directory: string) => void
}): JSX.Element {
  const layout = useLayout()
  const serverSync = useServerSync()
  const directories = createMemo(() => [props.project.worktree, ...(props.project.sandboxes ?? [])])
  const isWorking = createMemo(() =>
    directories().some((directory) => {
      return Object.keys(serverSync().session.data.session_status).some((id) => {
        if (serverSync().session.get(id)?.directory !== directory) return false
        return serverSync().session.data.session_working(id)
      })
    }),
  )
  const sectionExpanded = (directory: string) => props.sectionsExpanded[pathKey(directory)] ?? true

  return (
    <div class="flex flex-col">
      <button
        type="button"
        class="flex min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-v2-background-bg-hover"
        onClick={() => (props.project.expanded ? layout.projects.collapse : layout.projects.expand)(props.project.worktree)}
        aria-expanded={props.project.expanded}
      >
        <IconV2
          name="chevron-down"
          size="small"
          class={`shrink-0 text-v2-icon-icon-muted transition-transform ${props.project.expanded ? "" : "-rotate-90"}`}
        />
        <ProjectIcon project={props.project} working={isWorking()} class="!size-6" />
        <span class="min-w-0 flex-1 truncate text-14-medium text-v2-text-text-strong">
          {displayName(props.project)}
        </span>
      </button>
      <Show when={props.project.expanded}>
        <Show
          when={directories().length > 1}
          fallback={
            <ProjectSection
              directory={props.project.worktree}
              isLocal
              expanded={sectionExpanded(props.project.worktree)}
              onToggle={() => props.onToggleSection(props.project.worktree)}
              sessionProps={props.sessionProps}
            />
          }
        >
          <For each={directories()}>
            {(directory) => (
              <ProjectSection
                directory={directory}
                isLocal={directory === props.project.worktree}
                expanded={sectionExpanded(directory)}
                onToggle={() => props.onToggleSection(directory)}
                sessionProps={props.sessionProps}
              />
            )}
          </For>
        </Show>
      </Show>
    </div>
  )
}

export function NewSidebar(): JSX.Element {
  const layout = useLayout()
  const server = useServer()
  const serverSDK = useServerSDK()
  const serverSync = useServerSync()
  const language = useLanguage()
  const params = useParams()
  const location = useLocation()
  const navigate = useNavigate()

  const [sections, setSections] = createStore<Record<string, boolean>>({})

  const hidden = createMemo(() => location.pathname === "/")

  async function archiveSession(session: Session) {
    if ((await serverSDK().protocol) !== "v1") return
    await serverSDK().client.session.update({
      sessionID: session.id,
      directory: session.directory,
      time: { archived: Date.now() },
    })
    if (session.id === params.id) navigate("/")
  }

  const sessionProps: Omit<SessionItemProps, "session" | "list" | "slug" | "mobile" | "dense"> = {
    href: (session) => sessionHref(server.key, session.id),
    showTooltip: false,
    sidebarExpanded,
    clearHoverProjectSoon: noop,
    prefetchSession: (session, priority) => {
      void serverSync()
        .session.prefetch(session.id, priority === "high" ? 40 : 10)
        .catch(() => {})
    },
    archiveSession,
  }

  return (
    <Show when={!hidden()}>
      <nav
        aria-label={language.t("sidebar.nav.projectsAndSessions")}
        class="hidden w-64 shrink-0 flex-col gap-1 overflow-y-auto border-r border-v2-border-border-subtle bg-v2-background-bg-base p-2 md:flex"
      >
        <Show
          when={layout.projects.list().length > 0}
          fallback={
            <div class="flex flex-col gap-1 px-2 py-4 text-center">
              <div class="text-13-medium text-v2-text-text-strong">{language.t("sidebar.empty.title")}</div>
              <div class="text-12-regular text-v2-text-text-muted">{language.t("sidebar.empty.description")}</div>
            </div>
          }
        >
          <For each={layout.projects.list()}>
            {(project) => (
              <ProjectNode
                project={project}
                sessionProps={sessionProps}
                sectionsExpanded={sections}
                onToggleSection={(directory) => {
                  const key = pathKey(directory)
                  setSections(key, (value) => !(value ?? true))
                }}
              />
            )}
          </For>
        </Show>
        <div class="mt-auto pt-2">
          <A
            href="/documentacao"
            class="flex items-center gap-2 rounded-md px-2 py-1.5 text-13-medium text-v2-text-text-muted hover:bg-v2-background-bg-hover [&.active]:bg-v2-background-bg-hover [&.active]:text-v2-text-text-strong"
          >
            <IconV2 name="help" size="small" class="shrink-0" />
            <span class="min-w-0 flex-1 truncate">{language.t("sidebar.documentation")}</span>
          </A>
        </div>
      </nav>
    </Show>
  )
}

import type { Session } from "@opencode-ai/sdk/v2/client"
import { ProjectAvatar } from "@opencode-ai/ui/v2/project-avatar-v2"
import { Icon as IconV2 } from "@opencode-ai/ui/v2/icon"
import { IconButtonV2 } from "@opencode-ai/ui/v2/icon-button-v2"
import { TooltipV2 } from "@opencode-ai/ui/v2/tooltip-v2"
import { ScrollView } from "@opencode-ai/ui/scroll-view"
import { useLocation, useNavigate } from "@solidjs/router"
import { createEffect, createMemo, For, type JSX, Show, splitProps, untrack } from "solid-js"
import { useDirectoryPicker } from "@/components/directory-picker"
import { useSettingsCommand } from "@/components/settings-dialog"
import { getProjectAvatarVariant, useLayout, type LocalProject } from "@/context/layout"
import { useLanguage } from "@/context/language"
import { useServer } from "@/context/server"
import { useServerSync } from "@/context/server-sync"
import { sessionHasOpenTab, useTabs } from "@/context/tabs"
import { displayName, getProjectAvatarSource, sortedRootSessions } from "@/pages/layout/helpers"
import { pathKey } from "@/utils/path-key"

// Persistent left menu for the new layout: projects + their sessions ("seções")
// stay visible across every route (home, session, documentation). Multiple
// projects can be expanded at once, reusing the existing `layout.projects`
// expanded flag (already per-project and persisted) instead of new state.
// Sessions replace the old horizontal tab strip as the way to switch between
// open sessions — see layout-new.tsx / titlebar.tsx for the wiring, and the
// PR description for the decision on keeping multiple "open" sessions.

const NAV_LABEL = "min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap"
const SIDEBAR_SESSION_LIMIT = 20

export function NewLayoutSidebar() {
  const layout = useLayout()
  const server = useServer()
  const serverSync = useServerSync()
  const tabs = useTabs()
  const language = useLanguage()
  const navigate = useNavigate()
  const location = useLocation()
  const pickDirectory = useDirectoryPicker()
  const openSettings = useSettingsCommand()

  const route = layout.route
  const projects = layout.projects.list

  const activeSessionId = createMemo(() => {
    const value = route()
    if (value.type !== "session") return undefined
    if (value.server && value.server !== server.key) return undefined
    return value.sessionId
  })

  // Keep the project that owns the active session expanded, so navigating to a
  // session (from a link, a draft, or another tab) always surfaces it in the menu.
  createEffect(() => {
    const sessionId = activeSessionId()
    if (!sessionId) return
    const directory = serverSync().session.lineage.peek(sessionId)?.session.directory
    if (!directory) return
    const key = pathKey(directory)
    const project = untrack(projects).find(
      (item) => pathKey(item.worktree) === key || item.sandboxes?.some((sandbox) => pathKey(sandbox) === key),
    )
    if (!project || project.expanded) return
    layout.projects.expand(project.worktree)
  })

  function addProject() {
    const conn = server.current
    if (!conn) return
    pickDirectory({
      server: conn,
      title: language.t("command.project.open"),
      multiple: true,
      onSelect: (result) => {
        const list = Array.isArray(result) ? result : result ? [result] : []
        for (const directory of list) layout.projects.open(directory)
      },
    })
  }

  function newSessionFor(project: LocalProject) {
    layout.projects.expand(project.worktree)
    void tabs.newDraft({ server: server.key, directory: project.worktree })
  }

  function openSession(session: Session) {
    const tab = tabs.addSessionTab({ server: server.key, sessionId: session.id })
    tabs.select(tab)
  }

  return (
    <aside
      class={`
        hidden w-[260px] shrink-0 flex-col gap-2 border-r border-v2-border-border-subtle
        bg-v2-background-bg-deep py-3 lg:flex
      `}
      aria-label={language.t("home.projects")}
    >
      <div class="flex h-7 shrink-0 items-center justify-between px-3">
        <span class="text-v2-text-text-muted [font-weight:530]">{language.t("home.projects")}</span>
        <TooltipV2 placement="bottom" value={language.t("home.project.add")}>
          <IconButtonV2
            variant="ghost-muted"
            size="large"
            icon={<IconV2 name="folder-add-left" />}
            aria-label={language.t("home.project.add")}
            onClick={addProject}
          />
        </TooltipV2>
      </div>
      <div class="flex shrink-0 flex-col gap-1 px-2">
        <SidebarNavButton
          active={route().type === "home"}
          icon="grid-plus"
          label={language.t("home.title")}
          onClick={() => navigate("/")}
        />
      </div>
      <ScrollView class="min-h-0 flex-1 px-2">
        <div class="flex min-w-0 flex-col gap-1">
          <For each={projects()}>
            {(project) => (
              <SidebarProject
                project={project}
                active={activeSessionId()}
                onToggle={() =>
                  project.expanded ? layout.projects.collapse(project.worktree) : layout.projects.expand(project.worktree)
                }
                onNewSession={() => newSessionFor(project)}
                onOpenSession={openSession}
              />
            )}
          </For>
        </div>
      </ScrollView>
      <div class="flex shrink-0 flex-col gap-1 px-2">
        <SidebarNavButton
          active={location.pathname === "/documentacao"}
          icon="outline-copy"
          label={language.t("sidebar.documentation")}
          onClick={() => navigate("/documentacao")}
        />
        <SidebarNavButton icon="settings-gear" label={language.t("sidebar.settings")} onClick={openSettings} />
      </div>
    </aside>
  )
}

function SidebarProject(props: {
  project: LocalProject
  active: string | undefined
  onToggle: () => void
  onNewSession: () => void
  onOpenSession: (session: Session) => void
}) {
  const language = useLanguage()
  return (
    <div class="flex min-w-0 flex-col gap-0.5">
      <div class="group/sidebar-project relative flex h-7 min-w-0 items-center rounded-[6px]">
        <button
          type="button"
          class={`
            flex h-7 w-full min-w-0 shrink-0 cursor-default items-center gap-1.5 rounded-[6px] bg-transparent
            pr-7 pl-1.5 text-left text-v2-text-text-muted [font-weight:440]
            transition-[background-color,color] duration-[120ms] ease-in-out
            hover:bg-v2-background-bg-layer-01 hover:text-v2-text-text-base
          `}
          aria-expanded={props.project.expanded}
          onClick={props.onToggle}
        >
          <span
            class="-ml-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-[4px] text-v2-icon-icon-muted"
            aria-hidden="true"
          >
            <IconV2
              name="chevron-down"
              size="small"
              class="transition-transform duration-150 ease-in-out"
              style={{ transform: `rotate(${props.project.expanded ? 0 : -90}deg)` }}
            />
          </span>
          <ProjectAvatar
            fallback={displayName(props.project)}
            src={getProjectAvatarSource(props.project.id, props.project.icon)}
            variant={getProjectAvatarVariant(props.project.icon?.color)}
          />
          <span class={NAV_LABEL}>{displayName(props.project)}</span>
        </button>
        <div
          class={`
            absolute right-1 top-1/2 flex -translate-y-1/2 items-center opacity-0
            group-hover/sidebar-project:opacity-100 focus-within:opacity-100
          `}
        >
          <TooltipV2 placement="bottom" value={language.t("command.session.new")}>
            <IconButtonV2
              variant="ghost-muted"
              size="small"
              icon={<IconV2 name="plus" />}
              aria-label={language.t("command.session.new")}
              onClick={(event) => {
                event.stopPropagation()
                props.onNewSession()
              }}
            />
          </TooltipV2>
        </div>
      </div>
      <Show when={props.project.expanded}>
        <SidebarProjectSessions project={props.project} active={props.active} onOpenSession={props.onOpenSession} />
      </Show>
    </div>
  )
}

function SidebarProjectSessions(props: {
  project: LocalProject
  active: string | undefined
  onOpenSession: (session: Session) => void
}) {
  const serverSync = useServerSync()
  const server = useServer()
  const tabs = useTabs()
  const language = useLanguage()
  const sessions = createMemo(() => {
    const [store] = serverSync().child(props.project.worktree, { bootstrap: true })
    return sortedRootSessions(store, Date.now()).slice(0, SIDEBAR_SESSION_LIMIT)
  })

  return (
    <div class="flex min-w-0 flex-col gap-0.5 py-0.5 pl-6">
      <For each={sessions()}>
        {(session) => (
          <button
            type="button"
            data-active={session.id === props.active ? "" : undefined}
            class={`
              flex h-6 w-full min-w-0 shrink-0 cursor-default items-center gap-1.5 rounded-[6px] bg-transparent
              px-1.5 text-left text-v2-text-text-muted [font-weight:440]
              transition-[background-color,color] duration-[120ms] ease-in-out
              hover:bg-v2-background-bg-layer-01 hover:text-v2-text-text-base
              data-[active]:bg-v2-background-bg-layer-03 data-[active]:text-v2-text-text-base
            `}
            onClick={() => props.onOpenSession(session)}
          >
            <span
              class="size-1.5 shrink-0 rounded-full"
              classList={{ "bg-v2-icon-icon-accent": sessionHasOpenTab(tabs.store, server.key, session) }}
              aria-hidden="true"
            />
            <span class={NAV_LABEL}>{session.title || language.t("session.tab.unknown")}</span>
          </button>
        )}
      </For>
    </div>
  )
}

function SidebarNavButton(
  props: JSX.ButtonHTMLAttributes<HTMLButtonElement> & { icon: string; label: string; active?: boolean },
) {
  const [local, rest] = splitProps(props, ["icon", "label", "active", "class"])
  return (
    <button
      {...rest}
      type="button"
      data-selected={local.active ? "" : undefined}
      class={`
        flex h-7 min-w-0 w-full shrink-0 cursor-default items-center gap-2 rounded-[6px] bg-transparent px-1.5 text-left
        text-v2-text-text-muted [font-weight:440] transition-[background-color,color] duration-[120ms] ease-in-out
        hover:bg-v2-background-bg-layer-01 hover:text-v2-text-text-base
        data-[selected]:bg-v2-background-bg-layer-03 data-[selected]:text-v2-text-text-base
        ${local.class ?? ""}
      `}
    >
      <IconV2 name={local.icon} size="small" />
      <span class={NAV_LABEL}>{local.label}</span>
    </button>
  )
}

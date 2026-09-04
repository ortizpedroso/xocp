import { useDirectoryPicker } from "@/components/directory-picker"
import { useServerManagementController } from "@/components/dialog-select-server"
import { useSettingsCommand } from "@/components/settings-dialog"
import { DialogServerV2 } from "@/components/settings-v2/dialog-server-v2"
import { type LocalProject } from "@/context/layout"
import { useLanguage } from "@/context/language"
import { useNotification } from "@/context/notification"
import { usePlatform } from "@/context/platform"
import { ServerConnection } from "@/context/server"
import { closeHomeProject, errorMessage, homeProjectDirectories } from "@/pages/layout/helpers"
import { Persist, persisted } from "@/utils/persist"
import { showToast } from "@/utils/toast"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { useNavigate } from "@solidjs/router"
import { createMemo, createResource } from "solid-js"
import { createStore } from "solid-js/store"
import type { HomeController } from "./home-controller"
import { createHomePinsController, homeSessionPinKey } from "./home-pins"
import { buildHomeSidebarTree } from "./home-sidebar-tree"
import type { HomeSessionsController } from "./home-sessions-controller"
import { pathKey } from "@/utils/path-key"

export function createHomeProjectsController(home: HomeController, sessions?: HomeSessionsController) {
  const navigate = useNavigate()
  const platform = usePlatform()
  const pickDirectory = useDirectoryPicker()
  const dialog = useDialog()
  const language = useLanguage()
  const notification = useNotification()
  const openSettings = useSettingsCommand()
  const serverManagement = useServerManagementController({ navigateOnAdd: false })
  const pins = createHomePinsController(() => home.selection.value().server)
  const [_state, setState, _, ready] = persisted(
    Persist.global("home.servers", ["home.servers.v1"]),
    createStore({ collapsed: {} as Record<string, boolean> }),
  )
  const [state] = createResource(
    () => ready.promise ?? Promise.resolve(),
    (promise) => promise.then(() => _state),
    { initialValue: _state },
  )
  function directories(project: LocalProject) {
    return [project.worktree, ...(project.sandboxes ?? [])]
  }

  function canRevealProject(conn: ServerConnection.Any) {
    return platform.platform === "desktop" && !!platform.openPath && ServerConnection.local(conn)
  }

  const sidebar = createMemo(() => {
    if (!sessions) return undefined
    return buildHomeSidebarTree({
      projects: home.project.list(),
      records: sessions.data.sidebarRecords(),
      pinnedProjects: pins.pinnedProjects(),
      pinnedSessions: pins.pinnedSessions(),
      hiddenSessions: pins.hiddenSessions(),
    })
  })

  return {
    copy: {
      language,
    },
    selection: {
      value: home.selection.value,
    },
    server: {
      list: home.server.list,
      health: home.server.health,
      projects: home.project.forServer,
      collapsed: (conn: ServerConnection.Any) => state().collapsed[ServerConnection.key(conn)] ?? false,
      toggleCollapsed: (conn: ServerConnection.Any) => {
        const key = ServerConnection.key(conn)
        setState("collapsed", key, !state().collapsed[key])
      },
      canDefault: serverManagement.canDefault,
      defaultKey: serverManagement.defaultKey,
      setDefault: (conn: ServerConnection.Any | undefined) =>
        serverManagement.setDefault(conn ? ServerConnection.key(conn) : null),
      remove: (conn: ServerConnection.Any) => serverManagement.handleRemove(ServerConnection.key(conn)),
      edit: (conn: ServerConnection.Http) => dialog.show(() => <DialogServerV2 mode="edit" server={conn} />),
      focus: home.selection.focusServer,
    },
    project: {
      list: home.project.list,
      recentlyClosed: home.project.recentlyClosed,
      homedir: home.project.homedir,
      select: home.project.select,
      add: home.project.add,
      openNewSession: home.project.openProjectNewSession,
      edit: (conn: ServerConnection.Any, project: LocalProject) => {
        void import("@/components/dialog-edit-project-v2").then(({ DialogEditProjectV2 }) => {
          void dialog.show(() => <DialogEditProjectV2 server={conn} project={project} />)
        })
      },
      unseenCount: (conn: ServerConnection.Any, project: LocalProject) => {
        const state = notification.ensureServerState(ServerConnection.key(conn))
        return directories(project).reduce((total, directory) => total + state.project.unseenCount(directory), 0)
      },
      clearNotifications: (conn: ServerConnection.Any, project: LocalProject) => {
        const state = notification.ensureServerState(ServerConnection.key(conn))
        directories(project)
          .filter((directory) => state.project.unseenCount(directory) > 0)
          .forEach((directory) => state.project.markViewed(directory))
      },
      choose: (conn: ServerConnection.Any) => {
        if (home.server.health(conn)?.healthy === false) return
        pickDirectory({
          server: conn,
          title: language.t("command.project.open"),
          multiple: true,
          onSelect: (result) => home.project.add(conn, homeProjectDirectories(result)),
        })
      },
      close: (conn: ServerConnection.Any, directory: string) => {
        const next = closeHomeProject(
          home.selection.value(),
          ServerConnection.key(conn),
          home.server.context(conn).projects,
          directory,
        )
        if (next) home.selection.set(next)
      },
      move: (conn: ServerConnection.Any, worktree: string, index: number) => {
        home.server.context(conn).projects.move(worktree, index)
      },
      toggleExpanded: (conn: ServerConnection.Any, directory: string) => {
        const ctx = home.server.context(conn)
        const project = ctx.projects.list().find((item) => item.worktree === directory)
        if (!project) return
        if (project.expanded) ctx.projects.collapse(directory)
        else ctx.projects.expand(directory)
      },
      canReveal: canRevealProject,
      reveal: (conn: ServerConnection.Any, project: LocalProject) => {
        if (!platform.openPath || !canRevealProject(conn)) return
        platform.openPath(project.worktree).catch((cause: unknown) =>
          showToast({
            title: language.t("common.requestFailed"),
            description: errorMessage(cause, language.t("common.requestFailed")),
          }),
        )
      },
    },
    utility: {
      settings: openSettings,
      documentation: () => navigate("/documentacao"),
      help: () => platform.openExternal("https://opencode.ai/desktop-feedback"),
    },
    sidebar,
    pins,
    sessions: sessions
      ? {
          open: sessions.session.open,
          create: sessions.session.create,
          isOpenTab: sessions.tab.isOpen,
          server: sessions.session.server,
          showHidden: (worktree: string) => {
            const project = home.project.list().find((item) => item.worktree === worktree)
            if (!project) return
            sessions.data
              .sidebarRecords()
              .filter((record) => {
                const directory = pathKey(record.session.directory)
                return (
                  pathKey(project.worktree) === directory ||
                  project.sandboxes?.some((sandbox) => pathKey(sandbox) === directory) ||
                  (!!record.session.projectID && project.id === record.session.projectID)
                )
              })
              .forEach((record) => {
                const key = homeSessionPinKey(record)
                if (pins.isSessionHidden(key)) pins.toggleSessionHidden(key)
              })
          },
          showLooseHidden: () => {
            sessions.data
              .sidebarRecords()
              .filter(
                (record) =>
                  !home
                    .project.list()
                    .some((project) => {
                      const directory = pathKey(record.session.directory)
                      return (
                        pathKey(project.worktree) === directory ||
                        project.sandboxes?.some((sandbox) => pathKey(sandbox) === directory) ||
                        (!!record.session.projectID && project.id === record.session.projectID)
                      )
                    }),
              )
              .forEach((record) => {
                const key = homeSessionPinKey(record)
                if (pins.isSessionHidden(key)) pins.toggleSessionHidden(key)
              })
          },
        }
      : undefined,
  }
}

export type HomeProjectsController = ReturnType<typeof createHomeProjectsController>

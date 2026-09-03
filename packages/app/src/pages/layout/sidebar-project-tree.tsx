import { createEffect, createMemo, For, Show, type Accessor, type JSX } from "solid-js"
import { DragDropProvider, DragDropSensors, DragOverlay, SortableProvider, closestCenter } from "@thisbeyond/solid-dnd"
import type { DragEvent } from "@thisbeyond/solid-dnd"
import { createSortable } from "@thisbeyond/solid-dnd"
import { base64Encode } from "@opencode-ai/core/util/encode"
import { Button } from "@opencode-ai/ui/button"
import { Collapsible } from "@opencode-ai/ui/collapsible"
import { DropdownMenu } from "@opencode-ai/ui/dropdown-menu"
import { Icon } from "@opencode-ai/ui/icon"
import { IconButton } from "@opencode-ai/ui/icon-button"
import { Tooltip, TooltipKeybind } from "@opencode-ai/ui/tooltip"
import { useLayout, type LocalProject } from "@/context/layout"
import { useLanguage } from "@/context/language"
import { useNotification } from "@/context/notification"
import { ConstrainDragXAxis } from "@/utils/solid-dnd"
import { displayName } from "./helpers"
import { ProjectIcon } from "./sidebar-items"
import {
  LocalWorkspace,
  SortableWorkspace,
  WorkspaceDragOverlay,
  type WorkspaceSidebarContext,
} from "./sidebar-workspace"
import type { ProjectSidebarContext } from "./sidebar-project"

export type SidebarProjectTreeContext = {
  projects: Accessor<LocalProject[]>
  currentProject: Accessor<LocalProject | undefined>
  projectSidebar: ProjectSidebarContext
  workspaceSidebar: WorkspaceSidebarContext
  workspaceIds: (project: LocalProject) => string[]
  workspaceLabel: (directory: string, branch?: string, projectId?: string) => string
  sortNow: Accessor<number>
  mobile?: boolean
  homedir: Accessor<string>
  chooseProject: () => void
  connectProvider: () => void
  gettingStartedDismissed: Accessor<boolean>
  dismissGettingStarted: () => void
  showPaidUpsell: Accessor<boolean>
  handleWorkspaceDragStart: (event: unknown) => void
  handleWorkspaceDragEnd: () => void
  handleWorkspaceDragOver: (event: DragEvent) => void
  handleProjectDragStart: (event: unknown) => void
  handleProjectDragEnd: () => void
  handleProjectDragOver: (event: DragEvent) => void
  renderProjectOverlay: () => JSX.Element
  activeWorkspace: Accessor<string | undefined>
  sidebarProject: Accessor<LocalProject | undefined>
  createWorkspace: (project: LocalProject) => void | Promise<void>
  navigateWithSidebarReset: (path: string) => void
  openProjectLabel: JSX.Element
  openProjectKeybind?: Accessor<string | undefined>
  onOpenProject: () => void
  settingsLabel: Accessor<string>
  settingsKeybind?: Accessor<string | undefined>
  onOpenSettings: () => void
  helpLabel: Accessor<string>
  onOpenHelp: () => void
}

const ProjectTreeRow = (props: {
  project: LocalProject
  ctx: SidebarProjectTreeContext
}): JSX.Element => {
  const layout = useLayout()
  const language = useLanguage()
  const notification = useNotification()
  const sortable = createSortable(props.project.worktree)
  const selected = createMemo(() => props.ctx.currentProject()?.worktree === props.project.worktree)
  const expanded = createMemo(() => props.project.expanded)
  const workspaces = createMemo(() => props.ctx.workspaceIds(props.project))
  const workspacesEnabled = createMemo(() => props.ctx.projectSidebar.workspacesEnabled(props.project))
  const slug = createMemo(() => base64Encode(props.project.worktree))
  const unseenCount = createMemo(() =>
    workspaces().reduce((total, directory) => total + notification.project.unseenCount(directory), 0),
  )
  const canToggle = createMemo(() => props.project.vcs === "git" || workspacesEnabled())
  const homedir = createMemo(() => props.ctx.homedir())

  const clearNotifications = () =>
    workspaces()
      .filter((directory) => notification.project.unseenCount(directory) > 0)
      .forEach((directory) => notification.project.markViewed(directory))

  const toggleExpanded = (open: boolean) => {
    if (open) layout.projects.expand(props.project.worktree)
    else layout.projects.collapse(props.project.worktree)
  }

  createEffect(() => {
    if (!selected()) return
    if (props.project.expanded) return
    layout.projects.expand(props.project.worktree)
  })

  return (
    <div
      // @ts-ignore
      use:sortable
      classList={{
        "opacity-30": sortable.isActiveDraggable,
        "border-b border-border-weaker-base last:border-b-0": true,
      }}
      data-component="sidebar-project-tree-item"
      data-project={slug()}
    >
      <Collapsible variant="ghost" open={expanded()} onOpenChange={toggleExpanded}>
        <div class="group/project flex items-start gap-0.5 py-2 pl-1 pr-0">
          <button
            type="button"
            class="shrink-0 mt-0.5 size-6 flex items-center justify-center rounded-md hover:bg-surface-base-hover"
            aria-label={
              expanded()
                ? language.t("sidebar.project.collapse")
                : language.t("sidebar.project.expand")
            }
            aria-expanded={expanded()}
            onClick={(event) => {
              event.preventDefault()
              event.stopPropagation()
              toggleExpanded(!expanded())
            }}
          >
            <Icon
              name="chevron-down"
              size="small"
              class="text-icon-base transition-transform duration-150"
              classList={{ "-rotate-90": !expanded() }}
            />
          </button>

          <button
            type="button"
            classList={{
              "flex flex-1 min-w-0 items-start gap-2 rounded-md py-0.5 pr-1 text-left hover:bg-surface-base-hover": true,
              "bg-surface-base-hover": selected(),
            }}
            data-action="project-switch"
            data-project={slug()}
            onClick={() => {
              if (selected()) {
                layout.sidebar.toggle()
                return
              }
              props.ctx.projectSidebar.navigateToProject(props.project.worktree)
            }}
          >
            <ProjectIcon project={props.project} class="shrink-0 mt-0.5" />
            <div class="flex flex-col min-w-0">
              <span class="text-14-medium text-text-strong truncate">{displayName(props.project)}</span>
              <Tooltip placement="bottom" value={props.project.worktree} gutter={2}>
                <span class="text-12-regular text-text-base truncate select-text">
                  {props.project.worktree.replace(homedir(), "~")}
                </span>
              </Tooltip>
            </div>
          </button>

          <DropdownMenu modal={!props.ctx.projectSidebar.sidebarHovering()}>
            <DropdownMenu.Trigger
              as={IconButton}
              icon="dot-grid"
              variant="ghost"
              data-action="project-menu"
              data-project={slug()}
              class="shrink-0 size-6 rounded-md opacity-0 group-hover/project:opacity-100 group-focus-within/project:opacity-100 data-[expanded]:opacity-100"
              aria-label={language.t("common.moreOptions")}
            />
            <DropdownMenu.Portal>
              <DropdownMenu.Content class="mt-1">
                <DropdownMenu.Item
                  onSelect={() => props.ctx.projectSidebar.showEditProjectDialog(props.project)}
                >
                  <DropdownMenu.ItemLabel>{language.t("common.edit")}</DropdownMenu.ItemLabel>
                </DropdownMenu.Item>
                <DropdownMenu.Item
                  data-action="project-workspaces-toggle"
                  data-project={slug()}
                  disabled={!canToggle()}
                  onSelect={() => props.ctx.projectSidebar.toggleProjectWorkspaces(props.project)}
                >
                  <DropdownMenu.ItemLabel>
                    {workspacesEnabled()
                      ? language.t("sidebar.workspaces.disable")
                      : language.t("sidebar.workspaces.enable")}
                  </DropdownMenu.ItemLabel>
                </DropdownMenu.Item>
                <DropdownMenu.Item
                  data-action="project-clear-notifications"
                  data-project={slug()}
                  disabled={unseenCount() === 0}
                  onSelect={clearNotifications}
                >
                  <DropdownMenu.ItemLabel>{language.t("sidebar.project.clearNotifications")}</DropdownMenu.ItemLabel>
                </DropdownMenu.Item>
                <DropdownMenu.Separator />
                <DropdownMenu.Item
                  data-action="project-close-menu"
                  data-project={slug()}
                  onSelect={() => props.ctx.projectSidebar.closeProject(props.project.worktree)}
                >
                  <DropdownMenu.ItemLabel>{language.t("common.close")}</DropdownMenu.ItemLabel>
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu>
        </div>

        <Collapsible.Content>
          <div class="pb-3 pl-3 pr-1 flex flex-col gap-3">
            <Show
              when={workspacesEnabled()}
              fallback={
                <>
                  <Button
                    size="large"
                    class="w-full"
                    onClick={() => {
                      props.ctx.navigateWithSidebarReset(`/${slug()}/session`)
                    }}
                  >
                    {language.t("command.session.new")}
                  </Button>
                  <LocalWorkspace
                    ctx={props.ctx.workspaceSidebar}
                    project={props.project}
                    sortNow={props.ctx.sortNow}
                    mobile={props.ctx.mobile}
                  />
                </>
              }
            >
              <>
                <Button
                  size="large"
                  icon="plus-small"
                  class="w-full"
                  onClick={() => {
                    void props.ctx.createWorkspace(props.project)
                  }}
                >
                  {language.t("workspace.new")}
                </Button>
                <DragDropProvider
                  onDragStart={props.ctx.handleWorkspaceDragStart}
                  onDragEnd={props.ctx.handleWorkspaceDragEnd}
                  onDragOver={props.ctx.handleWorkspaceDragOver}
                  collisionDetector={closestCenter}
                >
                  <DragDropSensors />
                  <ConstrainDragXAxis />
                  <div class="flex flex-col gap-4">
                    <SortableProvider ids={workspaces()}>
                      <For each={workspaces()}>
                        {(directory) => (
                          <SortableWorkspace
                            ctx={props.ctx.workspaceSidebar}
                            directory={directory}
                            project={props.project}
                            sortNow={props.ctx.sortNow}
                            mobile={props.ctx.mobile}
                          />
                        )}
                      </For>
                    </SortableProvider>
                  </div>
                  <DragOverlay>
                    <WorkspaceDragOverlay
                      sidebarProject={props.ctx.sidebarProject}
                      activeWorkspace={props.ctx.activeWorkspace}
                      workspaceLabel={props.ctx.workspaceLabel}
                    />
                  </DragOverlay>
                </DragDropProvider>
              </>
            </Show>
          </div>
        </Collapsible.Content>
      </Collapsible>
    </div>
  )
}

export const SidebarProjectTree = (props: { ctx: SidebarProjectTreeContext }): JSX.Element => {
  const language = useLanguage()
  const empty = createMemo(() => props.ctx.projects().length === 0)

  return (
    <div class="flex flex-col min-h-0 min-w-0 h-full bg-background-base border-e border-border-weaker-base">
      <div class="shrink-0 flex items-center justify-between gap-2 px-3 py-3 border-b border-border-weaker-base">
        <div class="text-12-medium text-text-weak uppercase tracking-wide">{language.t("sidebar.nav.projectsAndSessions")}</div>
        <div class="flex items-center gap-1">
          <Tooltip
            placement="bottom"
            value={
              <div class="flex items-center gap-2">
                <span>{props.ctx.openProjectLabel}</span>
                <Show when={props.ctx.openProjectKeybind?.()}>
                  {(keybind) => <span class="text-icon-base text-12-medium">{keybind()}</span>}
                </Show>
              </div>
            }
          >
            <IconButton
              icon="plus"
              variant="ghost"
              size="large"
              onClick={props.ctx.onOpenProject}
              aria-label={typeof props.ctx.openProjectLabel === "string" ? props.ctx.openProjectLabel : undefined}
            />
          </Tooltip>
          <TooltipKeybind
            placement="bottom"
            title={props.ctx.settingsLabel()}
            keybind={props.ctx.settingsKeybind?.() ?? ""}
          >
            <IconButton
              icon="settings-gear"
              variant="ghost"
              size="large"
              onClick={props.ctx.onOpenSettings}
              aria-label={props.ctx.settingsLabel()}
            />
          </TooltipKeybind>
          <Tooltip placement="bottom" value={props.ctx.helpLabel()}>
            <IconButton
              icon="help"
              variant="ghost"
              size="large"
              onClick={props.ctx.onOpenHelp}
              aria-label={props.ctx.helpLabel()}
            />
          </Tooltip>
        </div>
      </div>

      <DragDropProvider
        onDragStart={props.ctx.handleProjectDragStart}
        onDragEnd={props.ctx.handleProjectDragEnd}
        onDragOver={props.ctx.handleProjectDragOver}
        collisionDetector={closestCenter}
      >
        <DragDropSensors />
        <ConstrainDragXAxis />
        <div
          ref={(el) => props.ctx.workspaceSidebar.setScrollContainerRef(el, props.ctx.mobile)}
          class="flex-1 min-h-0 overflow-y-auto no-scrollbar [overflow-anchor:none] px-2"
        >
          <Show
            when={!empty()}
            fallback={
              <div class="flex-1 min-h-0 flex items-center justify-center px-6 py-16 text-center">
                <div class="flex max-w-60 flex-col items-center gap-6 text-center">
                  <div class="flex flex-col gap-3">
                    <div class="text-14-medium text-text-strong">{language.t("sidebar.empty.title")}</div>
                    <div class="text-14-regular text-text-base" style={{ "line-height": "var(--line-height-normal)" }}>
                      {language.t("sidebar.empty.description")}
                    </div>
                  </div>
                  <Button size="large" icon="folder-add-left" onClick={props.ctx.chooseProject}>
                    {language.t("command.project.open")}
                  </Button>
                </div>
              </div>
            }
          >
            <SortableProvider ids={props.ctx.projects().map((project) => project.worktree)}>
              <For each={props.ctx.projects()}>{(project) => <ProjectTreeRow project={project} ctx={props.ctx} />}</For>
            </SortableProvider>
          </Show>
        </div>
        <DragOverlay>{props.ctx.renderProjectOverlay()}</DragOverlay>
      </DragDropProvider>

      <div
        class="shrink-0 px-3 py-3"
        classList={{
          hidden: props.ctx.gettingStartedDismissed() || !props.ctx.showPaidUpsell(),
        }}
      >
        <div class="rounded-xl bg-background-base shadow-xs-border-base" data-component="getting-started">
          <div class="p-3 flex flex-col gap-6">
            <div class="flex flex-col gap-2">
              <div class="text-14-medium text-text-strong">{language.t("sidebar.gettingStarted.title")}</div>
              <div class="text-14-regular text-text-base" style={{ "line-height": "var(--line-height-normal)" }}>
                {language.t("sidebar.gettingStarted.line1")}
              </div>
              <div class="text-14-regular text-text-base" style={{ "line-height": "var(--line-height-normal)" }}>
                {language.t("sidebar.gettingStarted.line2")}
              </div>
            </div>
            <div data-component="getting-started-actions">
              <Button size="large" icon="plus-small" onClick={props.ctx.connectProvider}>
                {language.t("command.provider.connect")}
              </Button>
              <Button size="large" variant="ghost" onClick={props.ctx.dismissGettingStarted}>
                {language.t("toast.update.action.notYet")}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

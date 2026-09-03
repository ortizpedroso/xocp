import type { Session } from "@opencode-ai/sdk/v2/client"
import { For, Show, createMemo } from "solid-js"
import { Icon as IconV2 } from "@opencode-ai/ui/v2/icon"
import { ServerConnection } from "@/context/server"
import { SessionTabAvatarView } from "@/pages/layout/session-tab-avatar"
import { sessionTitle } from "@/utils/session-title"
import { shouldOpenSessionInBackground } from "../home-session-open"
import {
  HomeSessionStatusController,
  type HomeSessionGroup,
  type HomeSessionRecord,
  type OpenSessionOptions,
} from "./home-sessions-controller"

const HOME_SECTION_LABEL = "text-v2-text-text-faint text-[11px] leading-4 [font-weight:440]"

function isBackgroundOpen(event: MouseEvent) {
  return shouldOpenSessionInBackground({
    button: event.button,
    mac: typeof navigator === "object" && /(Mac|iPod|iPhone|iPad)/.test(navigator.platform),
    meta: event.metaKey,
    ctrl: event.ctrlKey,
    shift: event.shiftKey,
    alt: event.altKey,
  })
}

export function HomeProjectSessions(props: {
  groups: HomeSessionGroup[]
  server: ServerConnection.Key
  isOpenTab: (record: HomeSessionRecord) => boolean
  onOpenSession: (session: Session, options?: OpenSessionOptions) => void
}) {
  return (
    <Show when={props.groups.length > 0}>
      <div class="ml-3 flex min-w-0 flex-col gap-2 border-l border-v2-border-border-base pl-2">
        <For each={props.groups}>
          {(group) => (
            <div class="flex min-w-0 flex-col gap-0.5">
              <div class={`px-1.5 py-0.5 ${HOME_SECTION_LABEL}`}>{group.title}</div>
              <For each={group.sessions}>
                {(record) => (
                  <HomeProjectSessionRow
                    record={record}
                    server={props.server}
                    isOpenTab={props.isOpenTab}
                    onOpenSession={props.onOpenSession}
                  />
                )}
              </For>
            </div>
          )}
        </For>
      </div>
    </Show>
  )
}

function HomeProjectSessionRow(props: {
  record: HomeSessionRecord
  server: ServerConnection.Key
  isOpenTab: (record: HomeSessionRecord) => boolean
  onOpenSession: (session: Session, options?: OpenSessionOptions) => void
}) {
  const title = createMemo(() => sessionTitle(props.record.session.title) || props.record.session.id)

  return (
    <button
      type="button"
      data-component="home-project-session-row"
      class={`
        flex h-7 min-w-0 w-full shrink-0 cursor-default items-center gap-2 rounded-[6px] border-0
        bg-transparent px-1.5 text-left text-v2-text-text-muted [font-weight:440]
        transition-[background-color,color] duration-[120ms] ease-in-out
        hover:bg-v2-overlay-simple-overlay-hover focus-visible:bg-v2-overlay-simple-overlay-hover focus-visible:outline-none
      `}
      onMouseDown={(event) => {
        if (event.button === 1) event.preventDefault()
      }}
      onClick={(event) => props.onOpenSession(props.record.session, { background: isBackgroundOpen(event) })}
      onAuxClick={(event) => {
        if (!isBackgroundOpen(event)) return
        event.preventDefault()
        props.onOpenSession(props.record.session, { background: true })
      }}
    >
      <HomeSessionStatusController
        server={() => props.server}
        record={props.record}
        isOpenTab={props.isOpenTab}
        render={(state) => (
          <SessionTabAvatarView
            project={props.record.project}
            directory={props.record.session.directory}
            revealProjectOnHover={false}
            unread={state.unread()}
            loading={state.loading()}
          />
        )}
      />
      <span class="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-v2-text-text-base text-[12px]">
        {title()}
      </span>
      <Show when={props.isOpenTab(props.record)}>
        <IconV2 name="chevron-right" size="small" class="shrink-0 text-v2-icon-icon-muted" />
      </Show>
    </button>
  )
}

export function HomeProjectSessionsEmpty() {
  return (
    <div class="ml-3 border-l border-v2-border-border-base pl-3 py-1 text-[11px] text-v2-text-text-faint [font-weight:440]">
      —
    </div>
  )
}

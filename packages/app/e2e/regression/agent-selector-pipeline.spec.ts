import { expect, test } from "@playwright/test"
import { mockOpenCodeServer } from "../utils/mock-server"
import { expectAppVisible } from "../utils/waits"

const draftID = "draft_agent_selector_pipeline"
const directory = "C:/OpenCode/AgentSelectorPipeline"
const server = `http://${process.env.PLAYWRIGHT_SERVER_HOST ?? "127.0.0.1"}:${process.env.PLAYWRIGHT_SERVER_PORT ?? "4096"}`

const provider = () => ({
  all: [
    {
      id: "opencode",
      name: "OpenCode",
      models: {
        "test-model": {
          id: "test-model",
          name: "Test Model",
          cost: { input: 0, output: 0 },
          limit: { context: 200_000 },
        },
      },
    },
  ],
  connected: ["opencode"],
  default: { providerID: "opencode", modelID: "test-model" },
})

const pipelineAgents = [
  { name: "build", mode: "primary", native: true },
  { name: "plan", mode: "primary", native: true },
  { name: "elicitador", mode: "primary", native: true, pipeline: true },
  { name: "workflow-triador", mode: "primary", native: true, pipeline: true },
  { name: "analista", mode: "primary", native: true, pipeline: true },
  { name: "workflow-executor", mode: "primary", native: true, pipeline: true },
  { name: "avaliador", mode: "primary", native: true, pipeline: true },
  { name: "general", mode: "subagent", native: true },
  { name: "explore", mode: "subagent", native: true },
]

test.describe("agent selector pipeline visibility", () => {
  test.beforeEach(async ({ page }) => {
    await mockOpenCodeServer(page, {
      directory,
      project: {
        id: "proj_agent_selector_pipeline",
        worktree: directory,
        vcs: "git",
        name: "agent-selector-pipeline",
        time: { created: 1700000000000, updated: 1700000000000 },
        sandboxes: [],
      },
      provider,
      sessions: [],
      pageMessages: () => ({ items: [] }),
    })

    await page.route("**/agent", async (route) => {
      await route.fulfill({ json: pipelineAgents })
    })

    await page.addInitScript(
      ({ directory, draftID, server }) => {
        localStorage.setItem(
          "settings.v3",
          JSON.stringify({
            general: {
              newLayoutDesigns: true,
              showCustomAgents: false,
              layoutTransitionEligible: false,
              newInterfaceNoticeDismissed: true,
              shouldDisplayTabsToast: false,
            },
          }),
        )
        localStorage.setItem("app-version.v1", JSON.stringify({ version: "1.17.20" }))
        localStorage.setItem(
          "opencode.window.browser.dat:tabs",
          JSON.stringify([{ type: "draft", draftID, server, directory }]),
        )
      },
      { directory, draftID, server },
    )
  })

  const promptInput = (page: import("@playwright/test").Page) => page.getByRole("textbox", { name: "Prompt" })

  test("shows agent selector with showCustomAgents disabled when pipeline agents exist", async ({ page }) => {
    await page.goto(`/new-session?draftId=${draftID}`)
    await expectAppVisible(promptInput(page))

    const agentControl = page.getByRole("button", { name: "Choose agent" })
    await expect(agentControl).toBeVisible()
    await expect(agentControl).toContainText("build")

    await page.screenshot({ path: "/opt/cursor/artifacts/agent-selector-visible-default-settings.png", fullPage: false })
  })
})

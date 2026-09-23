import { expect, test } from "@playwright/test"
import { base64Encode } from "@opencode-ai/core/util/encode"
import { mockOpenCodeServer } from "../utils/mock-server"
import { expectAppVisible } from "../utils/waits"

const draftID = "draft_elicitador_suggestion"
const directory = "C:/OpenCode/ElicitadorSuggestion"
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

test.describe("elicitador suggestion banner", () => {
  test.beforeEach(async ({ page }) => {
    await mockOpenCodeServer(page, {
      directory,
      project: {
        id: "proj_elicitador_suggestion",
        worktree: directory,
        vcs: "git",
        name: "elicitador-suggestion",
        time: { created: 1700000000000, updated: 1700000000000 },
        sandboxes: [],
      },
      provider,
      sessions: [],
      pageMessages: () => ({ items: [] }),
    })
    await page.addInitScript(
      ({ directory, draftID, server }) => {
        localStorage.setItem(
          "settings.v3",
          JSON.stringify({
            general: {
              newLayoutDesigns: true,
              showCustomAgents: true,
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

  const typePrompt = async (page: import("@playwright/test").Page, text: string) => {
    const input = promptInput(page)
    await input.click()
    await page.keyboard.type(text, { delay: 5 })
  }

  test("shows banner for greenfield project prompt on new session", async ({ page }) => {
    await page.goto(`/new-session?draftId=${draftID}`)
    await expectAppVisible(promptInput(page))
    await typePrompt(page, "quero criar um sistema de agendamento pra uma clínica")
    await expect(page.locator('[data-component="session-elicitador-suggestion"]')).toBeVisible()
    await expect(page.locator('[data-component="session-elicitador-suggestion"]')).toContainText("Elicitador")
  })

  test("hides banner for bug-fix prompt", async ({ page }) => {
    await page.goto(`/new-session?draftId=${draftID}`)
    await expectAppVisible(promptInput(page))
    await typePrompt(page, "corrige esse bug no arquivo X")
    await expect(page.locator('[data-component="session-elicitador-suggestion"]')).toHaveCount(0)
  })

  test("dismiss hides banner for the session scope", async ({ page }) => {
    await page.goto(`/new-session?draftId=${draftID}`)
    await expectAppVisible(promptInput(page))
    await typePrompt(page, "quero criar um sistema de agendamento pra uma clínica")
    const banner = page.locator('[data-component="session-elicitador-suggestion"]')
    await expect(banner).toBeVisible()
    await banner.getByLabel("Dismiss").click()
    await expect(banner).toHaveCount(0)
    const input = promptInput(page)
    await input.click()
    await page.keyboard.press("Control+A")
    await typePrompt(page, "quero criar um sistema de vendas online")
    await expect(banner).toHaveCount(0)
  })

  test("accept selects elicitador agent", async ({ page }) => {
    await page.goto(`/new-session?draftId=${draftID}`)
    await expectAppVisible(promptInput(page))
    await typePrompt(page, "quero criar um sistema de agendamento pra uma clínica")
    const banner = page.locator('[data-component="session-elicitador-suggestion"]')
    await expect(banner).toBeVisible()
    await banner.getByRole("button", { name: "Use Elicitador" }).click()
    await expect(page.getByRole("button", { name: "Choose agent" })).toContainText("elicitador")
  })
})

test.describe("elicitador ambiguity prompt", () => {
  test.beforeEach(async ({ page }) => {
    await mockOpenCodeServer(page, {
      directory,
      project: {
        id: "proj_elicitador_suggestion",
        worktree: directory,
        vcs: "git",
        name: "elicitador-suggestion",
        time: { created: 1700000000000, updated: 1700000000000 },
        sandboxes: [],
      },
      provider,
      sessions: [],
      pageMessages: () => ({ items: [] }),
    })
    await page.addInitScript(
      ({ directory, draftID, server }) => {
        localStorage.setItem(
          "settings.v3",
          JSON.stringify({
            general: {
              newLayoutDesigns: true,
              showCustomAgents: true,
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
        sessionStorage.clear()
      },
      { directory, draftID, server },
    )
  })

  const promptInput = (page: import("@playwright/test").Page) => page.getByRole("textbox", { name: "Prompt" })

  const typePrompt = async (page: import("@playwright/test").Page, text: string) => {
    const input = promptInput(page)
    await input.click()
    await page.keyboard.type(text, { delay: 5 })
  }

  const submitPrompt = async (page: import("@playwright/test").Page) => {
    await page.locator('[data-action="prompt-submit"]').click()
  }

  test("shows ambiguity question on submit for ambiguous prompt", async ({ page }) => {
    await page.goto(`/new-session?draftId=${draftID}`)
    await expectAppVisible(promptInput(page))
    await typePrompt(page, "preciso melhorar o sistema de login")
    await expect(page.locator('[data-component="session-elicitador-suggestion"]')).toHaveCount(0)
    await submitPrompt(page)
    const ambiguity = page.locator('[data-component="session-elicitador-ambiguity"]')
    await expect(ambiguity).toBeVisible()
    await expect(ambiguity).toContainText("formal project")
    await expect(page).toHaveURL(new RegExp(`/new-session\\?draftId=${draftID}`))
  })

  test("point-task answer continues without repeating the question", async ({ page }) => {
    await page.goto(`/new-session?draftId=${draftID}`)
    await expectAppVisible(promptInput(page))
    await typePrompt(page, "preciso melhorar o sistema de login")
    await submitPrompt(page)
    const ambiguity = page.locator('[data-component="session-elicitador-ambiguity"]')
    await expect(ambiguity).toBeVisible()
    await ambiguity.getByRole("radio", { name: "Just a question" }).click()
    await expect(ambiguity).toHaveCount(0)

    const input = promptInput(page)
    await input.click()
    await page.keyboard.press("Control+A")
    await page.keyboard.press("Backspace")
    await typePrompt(page, "quero uma dashboard para vendas")
    await submitPrompt(page)
    await expect(ambiguity).toHaveCount(0)
  })

  test("project answer selects elicitador agent", async ({ page }) => {
    await page.goto(`/new-session?draftId=${draftID}`)
    await expectAppVisible(promptInput(page))
    await typePrompt(page, "preciso melhorar o sistema de login")
    await submitPrompt(page)
    const ambiguity = page.locator('[data-component="session-elicitador-ambiguity"]')
    await expect(ambiguity).toBeVisible()
    await ambiguity.getByRole("radio", { name: "New project" }).click()
    await expect(page.getByRole("button", { name: "Choose agent" })).toContainText("elicitador")
  })
})

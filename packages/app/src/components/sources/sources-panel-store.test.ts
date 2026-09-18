import { describe, expect, it } from "bun:test"
import {
  closeSourcesPanel,
  isSourcesComposerMounted,
  isSourcesPanelOpen,
  openSourcesPanel,
  setSourcesComposerMounted,
  toggleSourcesPanel,
} from "./sources-panel-store"

describe("sources-panel-store", () => {
  it("starts closed with composer unmounted", () => {
    expect(isSourcesPanelOpen()).toBe(false)
    expect(isSourcesComposerMounted()).toBe(false)
  })

  it("openSourcesPanel opens and closeSourcesPanel closes", () => {
    openSourcesPanel()
    expect(isSourcesPanelOpen()).toBe(true)
    closeSourcesPanel()
    expect(isSourcesPanelOpen()).toBe(false)
  })

  it("toggleSourcesPanel toggles the open state", () => {
    toggleSourcesPanel()
    expect(isSourcesPanelOpen()).toBe(true)
    toggleSourcesPanel()
    expect(isSourcesPanelOpen()).toBe(false)
  })

  it("setSourcesComposerMounted tracks the composer lifecycle", () => {
    setSourcesComposerMounted(true)
    expect(isSourcesComposerMounted()).toBe(true)
    setSourcesComposerMounted(false)
    expect(isSourcesComposerMounted()).toBe(false)
  })
})
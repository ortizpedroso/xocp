import { createSignal } from "solid-js"

const [sourcesPanelOpen, setSourcesPanelOpen] = createSignal(false)
const [composerMounted, setComposerMounted] = createSignal(false)

export const openSourcesPanel = () => setSourcesPanelOpen(true)
export const closeSourcesPanel = () => setSourcesPanelOpen(false)
export const toggleSourcesPanel = () => setSourcesPanelOpen((value) => !value)
export const isSourcesPanelOpen = () => sourcesPanelOpen()
export const setSourcesComposerMounted = setComposerMounted
export const isSourcesComposerMounted = () => composerMounted()
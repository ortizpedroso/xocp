import { createSignal, createResource, For, Show } from "solid-js"

export interface ActiveSourceItem {
  id: string
  title: string
  source_type: "url" | "pdf" | "html" | "transcript" | "snippet"
  summary: string
  ingested_at: string
}

type SourcesDrawerProps = {
  isOpen: boolean
  onClose: () => void
  docked?: boolean
}

export function SourcesDrawer(props: SourcesDrawerProps) {
  const [activeTab, setActiveTab] = createSignal<"upload" | "links" | "snippet" | "active">("active")

  // Form states - zero-friction single fields
  const [urlLink, setUrlLink] = createSignal("")
  const [snippetCode, setSnippetCode] = createSignal("")
  const [selectedFiles, setSelectedFiles] = createSignal<File[]>([])

  const [isSubmitting, setIsSubmitting] = createSignal(false)
  const [statusMessage, setStatusMessage] = createSignal<string | null>(null)

  let fileInputRef: HTMLInputElement | undefined

  // Fetch active sources
  const fetchSources = async (): Promise<ActiveSourceItem[]> => {
    try {
      const res = await fetch("/api/sources/list")
      if (!res.ok) return []
      const data = await res.json()
      return data.sources || []
    } catch {
      return []
    }
  }

  const [sources, { refetch }] = createResource(fetchSources)

  const readError = async (res: Response, fallback: string): Promise<string> => {
    try {
      const body = await res.json()
      return body?.error || fallback
    } catch {
      return fallback
    }
  }

  const handleIngestJson = async (payload: {
    title?: string
    source_type?: string
    original_uri?: string
    raw_content: string
    language?: string
    summary?: string
  }) => {
    setIsSubmitting(true)
    setStatusMessage(null)
    try {
      const res = await fetch("/api/sources/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        throw new Error(await readError(res, "Failed to ingest source"))
      }
      setStatusMessage("Source ingested and indexed successfully!")
      refetch()
      setActiveTab("active")
    } catch (err: any) {
      setStatusMessage(`Error: ${err.message}`)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleIngestMultipart = async (payload: {
    title?: string
    source_type?: string
    original_uri?: string
    raw_content: string
    language?: string
    summary?: string
  }) => {
    setIsSubmitting(true)
    setStatusMessage(null)
    try {
      const formData = new FormData()
      if (payload.title) formData.append("title", payload.title)
      if (payload.source_type) formData.append("source_type", payload.source_type)
      if (payload.original_uri) formData.append("original_uri", payload.original_uri)
      formData.append("raw_content", payload.raw_content)
      if (payload.language) formData.append("language", payload.language)
      if (payload.summary) formData.append("summary", payload.summary)
      const res = await fetch("/api/sources/ingest", {
        method: "POST",
        body: formData,
      })
      if (!res.ok) {
        throw new Error(await readError(res, "Failed to ingest source"))
      }
      setStatusMessage("Source ingested and indexed successfully!")
      refetch()
      setActiveTab("active")
    } catch (err: any) {
      setStatusMessage(`Error: ${err.message}`)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleUploadFiles = async (e: Event) => {
    e.preventDefault()
    const files = selectedFiles()
    if (!files.length) return

    setIsSubmitting(true)
    setStatusMessage(null)
    try {
      let count = 0
      for (const file of files) {
        const formData = new FormData()
        formData.append("file", file)
        const res = await fetch("/api/sources/ingest", {
          method: "POST",
          body: formData,
        })
        if (!res.ok) {
          throw new Error(await readError(res, `Failed to upload ${file.name}`))
        }
        count++
      }
      setStatusMessage(`Successfully uploaded and indexed ${count} file${count > 1 ? "s" : ""}!`)
      setSelectedFiles([])
      if (fileInputRef) fileInputRef.value = ""
      refetch()
      setActiveTab("active")
    } catch (err: any) {
      setStatusMessage(`Error: ${err.message}`)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/sources/${id}`, { method: "DELETE" })
      if (res.ok) {
        refetch()
      }
    } catch {}
  }

  const panelBody = (
    <>
      {/* Header */}
          <div class="flex items-center justify-between p-4 border-b border-neutral-800">
            <div>
              <h2 class="text-base font-semibold tracking-wide text-neutral-100">Research Sources</h2>
              <p class="text-xs text-neutral-400">Indexed strictly for Elicitador & Analista</p>
            </div>
            <button
              id="sources-drawer-close"
              type="button"
              class="text-neutral-400 hover:text-white p-1 rounded-md"
              onClick={props.onClose}
            >
              ✕
            </button>
          </div>

          {/* Tabs */}
          <div class="flex border-b border-neutral-800 text-xs font-medium">
            <button
              id="tab-active-sources"
              type="button"
              class={`flex-1 py-2.5 text-center border-b-2 transition-colors ${
                activeTab() === "active"
                  ? "border-amber-500 text-amber-400 font-semibold"
                  : "border-transparent text-neutral-400 hover:text-neutral-200"
              }`}
              onClick={() => setActiveTab("active")}
            >
              Active Sources
            </button>
            <button
              id="tab-upload-source"
              type="button"
              class={`flex-1 py-2.5 text-center border-b-2 transition-colors ${
                activeTab() === "upload"
                  ? "border-amber-500 text-amber-400 font-semibold"
                  : "border-transparent text-neutral-400 hover:text-neutral-200"
              }`}
              onClick={() => setActiveTab("upload")}
            >
              Upload
            </button>
            <button
              id="tab-links-source"
              type="button"
              class={`flex-1 py-2.5 text-center border-b-2 transition-colors ${
                activeTab() === "links"
                  ? "border-amber-500 text-amber-400 font-semibold"
                  : "border-transparent text-neutral-400 hover:text-neutral-200"
              }`}
              onClick={() => setActiveTab("links")}
            >
              Links
            </button>
            <button
              id="tab-snippet-source"
              type="button"
              class={`flex-1 py-2.5 text-center border-b-2 transition-colors ${
                activeTab() === "snippet"
                  ? "border-amber-500 text-amber-400 font-semibold"
                  : "border-transparent text-neutral-400 hover:text-neutral-200"
              }`}
              onClick={() => setActiveTab("snippet")}
            >
              Snippet
            </button>
          </div>

          {/* Notification banner */}
          <Show when={statusMessage()}>
            <div class="p-2.5 text-xs bg-amber-500/10 border-b border-amber-500/20 text-amber-300">
              {statusMessage()}
            </div>
          </Show>

          {/* Drawer Body */}
          <div class="flex-1 overflow-y-auto p-4 space-y-4">
            {/* TAB: ACTIVE SOURCES */}
            <Show when={activeTab() === "active"}>
              <div class="space-y-3">
                <Show when={sources.loading}>
                  <div class="text-xs text-neutral-400 py-6 text-center">Loading sources catalog...</div>
                </Show>

                <Show when={!sources.loading && (sources()?.length ?? 0) === 0}>
                  <div class="text-center py-10 space-y-2">
                    <p class="text-sm text-neutral-400">No sources ingested yet.</p>
                    <p class="text-xs text-neutral-500">
                      Upload files, drop links, or paste snippets to ground agent requirements.
                    </p>
                  </div>
                </Show>

                <For each={sources()}>
                  {(item) => (
                    <div
                      id={`source-card-${item.id}`}
                      class="p-3 bg-neutral-800/60 border border-neutral-700/60 rounded-lg flex flex-col gap-1.5 hover:border-neutral-600 transition-colors"
                    >
                      <div class="flex items-start justify-between gap-2">
                        <div class="font-medium text-xs text-neutral-200 break-words flex-1">
                          {item.title}
                        </div>
                        <span class="text-[10px] px-1.5 py-0.5 rounded bg-neutral-700 text-neutral-300 uppercase tracking-wider">
                          {item.source_type}
                        </span>
                      </div>
                      <p class="text-xs text-neutral-400 line-clamp-2">{item.summary || "No summary available"}</p>
                      <div class="flex items-center justify-between pt-1 text-[11px] text-neutral-500">
                        <span>{new Date(item.ingested_at).toLocaleDateString()}</span>
                        <button
                          type="button"
                          class="text-red-400 hover:text-red-300 text-xs px-1"
                          onClick={() => handleDelete(item.id)}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  )}
                </For>
              </div>
            </Show>

            {/* TAB: UPLOAD (Native File Picker) */}
            <Show when={activeTab() === "upload"}>
              <form class="space-y-4" onSubmit={handleUploadFiles}>
                <div class="border-2 border-dashed border-neutral-700 hover:border-neutral-500 rounded-lg p-6 text-center transition-colors">
                  <input
                    ref={fileInputRef}
                    id="sources-file-input"
                    type="file"
                    multiple
                    accept=".pdf,.html,.htm,.txt,.md,.json"
                    class="hidden"
                    onChange={(e) => {
                      const files = Array.from(e.currentTarget.files || [])
                      setSelectedFiles(files)
                    }}
                  />
                  <label
                    for="sources-file-input"
                    class="cursor-pointer flex flex-col items-center justify-center space-y-2"
                  >
                    <svg
                      width="32"
                      height="32"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="1.5"
                      class="text-neutral-400"
                    >
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="17 8 12 3 7 8" />
                      <line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                    <span class="text-xs font-medium text-amber-400 hover:text-amber-300">
                      Choose PDF, HTML, or text files
                    </span>
                    <span class="text-[11px] text-neutral-500">
                      Auto-detects format, extracts text, and generates summary
                    </span>
                  </label>
                </div>

                <Show when={selectedFiles().length > 0}>
                  <div class="space-y-1.5">
                    <div class="text-[11px] text-neutral-400 font-medium">Selected files ({selectedFiles().length}):</div>
                    <div class="max-h-32 overflow-y-auto space-y-1">
                      <For each={selectedFiles()}>
                        {(file) => (
                          <div class="flex items-center justify-between text-xs bg-neutral-800/80 px-2.5 py-1.5 rounded border border-neutral-700/50">
                            <span class="truncate max-w-[280px] text-neutral-300">{file.name}</span>
                            <span class="text-[10px] text-neutral-500">
                              {(file.size / 1024).toFixed(0)} KB
                            </span>
                          </div>
                        )}
                      </For>
                    </div>
                  </div>
                </Show>

                <button
                  type="submit"
                  disabled={isSubmitting() || selectedFiles().length === 0}
                  class="w-full py-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-medium text-xs rounded transition-colors"
                >
                  {isSubmitting() ? "Ingesting..." : "Ingest & Index Files"}
                </button>
              </form>
            </Show>

            {/* TAB: LINKS (Auto-detecting URL / YouTube field) */}
            <Show when={activeTab() === "links"}>
              <form
                class="space-y-3"
                onSubmit={(e) => {
                  e.preventDefault()
                  if (!urlLink().trim()) return
                  handleIngestJson({
                    original_uri: urlLink().trim(),
                    raw_content: urlLink().trim(),
                  })
                }}
              >
                <div>
                  <label class="block text-xs text-neutral-400 mb-1">Target URL</label>
                  <input
                    id="sources-url-input"
                    type="url"
                    placeholder="https://example.com/docs or YouTube URL"
                    class="w-full bg-neutral-800 border border-neutral-700 rounded p-2 text-xs text-neutral-200 placeholder:text-neutral-500 focus:border-amber-500 focus:outline-none"
                    value={urlLink()}
                    onInput={(e) => setUrlLink(e.currentTarget.value)}
                    required
                  />
                  <p class="text-[11px] text-neutral-500 mt-1">
                    Auto-detects web articles, documentation, or YouTube videos to extract transcripts.
                  </p>
                </div>
                <button
                  type="submit"
                  disabled={isSubmitting() || !urlLink().trim()}
                  class="w-full py-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-medium text-xs rounded transition-colors"
                >
                  {isSubmitting() ? "Ingesting..." : "Ingest & Index Link"}
                </button>
              </form>
            </Show>

            {/* TAB: SNIPPET (Zero-Friction Paste) */}
            <Show when={activeTab() === "snippet"}>
              <form
                class="space-y-3"
                onSubmit={(e) => {
                  e.preventDefault()
                  if (!snippetCode().trim()) return
                  const content = snippetCode().trim()
                  if (content.length > 64_000) {
                    handleIngestMultipart({
                      source_type: "snippet",
                      raw_content: content,
                    })
                  } else {
                    handleIngestJson({
                      source_type: "snippet",
                      raw_content: content,
                    })
                  }
                }}
              >
                <div>
                  <label class="block text-xs text-neutral-400 mb-1">Paste Code or Text</label>
                  <textarea
                    id="sources-snippet-textarea"
                    rows={10}
                    placeholder="Paste code snippet, architecture note, or specification..."
                    class="w-full bg-neutral-800 border border-neutral-700 rounded p-2 text-xs text-neutral-200 font-mono placeholder:text-neutral-500 focus:border-amber-500 focus:outline-none"
                    value={snippetCode()}
                    onInput={(e) => setSnippetCode(e.currentTarget.value)}
                    required
                  />
                  <p class="text-[11px] text-neutral-500 mt-1">
                    Title and language will be inferred automatically upon normalization.
                  </p>
                </div>
                <button
                  type="submit"
                  disabled={isSubmitting() || !snippetCode().trim()}
                  class="w-full py-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-medium text-xs rounded transition-colors"
                >
                  {isSubmitting() ? "Normalizing..." : "Normalize & Ingest Snippet"}
</button>
               </form>
             </Show>
</div>
     </>
   )

  return (
    <Show when={props.isOpen}>
      <Show
        when={props.docked}
        fallback={
          <div
            id="sources-drawer-backdrop"
            class="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex justify-end"
            onClick={props.onClose}
          >
            <div
              id="sources-drawer-panel"
              class="w-full max-w-md bg-neutral-900 text-neutral-100 h-full shadow-2xl flex flex-col border-l border-neutral-800"
              onClick={(e) => e.stopPropagation()}
            >
              {panelBody}
            </div>
          </div>
        }
      >
        <div id="sources-drawer-panel" class="w-full bg-neutral-900 text-neutral-100 shadow-2xl flex flex-col border border-neutral-800 rounded-lg overflow-hidden max-h-[min(560px,70vh)]">
          {panelBody}
        </div>
      </Show>
    </Show>
  )
}

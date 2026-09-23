import { marked } from "marked"
import { ScrollView } from "@opencode-ai/ui/scroll-view"
import { IconButtonV2 } from "@opencode-ai/ui/v2/icon-button-v2"
import { Icon as IconV2 } from "@opencode-ai/ui/v2/icon"
import { useNavigate } from "@solidjs/router"
import mermaid from "mermaid"
import { createEffect, createMemo, createSignal, onMount } from "solid-js"
import { documentacaoMarkdown } from "@/generated/documentacao"
import { useLanguage } from "@/context/language"

function renderMermaid(container: HTMLElement) {
  const blocks = container.querySelectorAll("pre code.language-mermaid")
  if (blocks.length === 0) return
  blocks.forEach((block, index) => {
    const pre = block.parentElement
    if (!pre) return
    const graph = block.textContent ?? ""
    const div = document.createElement("div")
    div.className = "mermaid my-6 flex justify-center overflow-x-auto"
    div.textContent = graph
    div.dataset.mermaidId = `doc-${index}`
    pre.replaceWith(div)
  })
  void mermaid.run({ nodes: container.querySelectorAll(".mermaid") })
}

export default function DocumentacaoPage() {
  const navigate = useNavigate()
  const language = useLanguage()
  const [root, setRoot] = createSignal<HTMLDivElement>()
  const html = createMemo(() => marked.parse(documentacaoMarkdown) as string)

  onMount(() => {
    mermaid.initialize({
      startOnLoad: false,
      theme: document.documentElement.dataset.colorScheme === "dark" ? "dark" : "default",
      securityLevel: "strict",
    })
  })

  createEffect(() => {
    const el = root()
    const content = html()
    if (!el) return
    el.innerHTML = content
    renderMermaid(el)
  })

  return (
    <div class="m-2 flex min-h-0 flex-1 flex-col self-stretch overflow-hidden rounded-[10px] bg-v2-background-bg-base shadow-[var(--v2-elevation-raised)]">
      <header class="flex shrink-0 items-center gap-2 border-b border-v2-border-border-subtle px-4 py-3">
        <IconButtonV2
          variant="ghost-muted"
          size="large"
          icon={<IconV2 name="reset" />}
          aria-label={language.t("common.goBack")}
          onClick={() => navigate(-1)}
        />
        <h1 class="text-16-medium text-v2-text-text-strong">{language.t("documentation.title")}</h1>
      </header>
      <ScrollView class="min-h-0 flex-1">
        <article
          ref={setRoot}
          class={`
            documentacao-content mx-auto max-w-3xl px-6 py-8 text-v2-text-text-base
            [&_a]:text-v2-text-text-link [&_a]:underline
            [&_code]:rounded [&_code]:bg-v2-background-bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-13-regular
            [&_h1]:mb-4 [&_h1]:text-24-medium [&_h1]:text-v2-text-text-strong
            [&_h2]:mb-3 [&_h2]:mt-8 [&_h2]:text-18-medium [&_h2]:text-v2-text-text-strong
            [&_h3]:mb-2 [&_h3]:mt-6 [&_h3]:text-16-medium [&_h3]:text-v2-text-text-strong
            [&_hr]:my-8 [&_hr]:border-v2-border-border-subtle
            [&_li]:text-14-regular [&_li]:leading-relaxed
            [&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-6
            [&_p]:my-3 [&_p]:text-14-regular [&_p]:leading-relaxed
            [&_pre]:my-4 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-v2-background-bg-muted [&_pre]:p-4 [&_pre]:text-13-regular
            [&_table]:my-4 [&_table]:w-full [&_table]:border-collapse
            [&_td]:border [&_td]:border-v2-border-border-subtle [&_td]:px-3 [&_td]:py-2 [&_td]:text-13-regular
            [&_th]:border [&_th]:border-v2-border-border-subtle [&_th]:bg-v2-background-bg-muted [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:text-13-medium
            [&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-6
          `}
        />
      </ScrollView>
    </div>
  )
}

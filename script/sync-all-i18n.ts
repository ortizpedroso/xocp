import { readdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { dict as en } from "../packages/app/src/i18n/en.ts"

const ptTranslations: Record<string, string> = {
  "settings.general.row.enableGraphify.title": "Ativar Graphify (mapeamento estrutural de código)",
  "settings.general.row.enableGraphify.description": "Mapeia a estrutura de código (chamadas, imports, dependências) sob demanda. Requer `uv` instalado na máquina.",
  "settings.providers.omniroute.activate.action": "Ativar OmniRoute",
  "settings.providers.omniroute.activate.loading": "Ativando...",
  "settings.providers.omniroute.activate.downloading": "Baixando...",
  "settings.providers.omniroute.activate.configuring": "Configurando...",
  "settings.providers.omniroute.activate.ready": "OmniRoute está pronto",
  "settings.providers.omniroute.activate.error.npm": "npm/npx não está disponível nesta máquina.",
  "settings.providers.omniroute.activate.error.empty": "A ativação do OmniRoute terminou sem saída.",
  "settings.providers.omniroute.activate.error.failed": "Falha na ativação do OmniRoute",
  "settings.providers.omniroute.activate.error.timeout": "Tempo limite esgotado para ativação do OmniRoute. Tente novamente em instantes.",
  "settings.providers.headroom.title": "Conectar Headroom",
  "settings.providers.headroom.description": "Proxy LLM local com compressão de contexto (porta padrão 8787).",
  "settings.providers.headroom.activate.action": "Ativar Headroom",
  "settings.providers.headroom.activate.loading": "Ativando...",
  "settings.providers.headroom.activate.installing": "Instalando...",
  "settings.providers.headroom.activate.starting": "Iniciando proxy...",
  "settings.providers.headroom.activate.ready": "Headroom está pronto",
  "settings.providers.headroom.activate.error.uv": "uv não está disponível nesta máquina.",
  "settings.providers.headroom.activate.error.empty": "A ativação do Headroom terminou sem saída.",
  "settings.providers.headroom.activate.error.failed": "Falha na ativação do Headroom",
  "settings.providers.headroom.activate.error.timeout": "Tempo limite esgotado para ativação do Headroom. Tente novamente em instantes.",
}

const dir = path.join(import.meta.dir, "../packages/app/src/i18n")
const files = (await readdir(dir)).filter(
  (file) =>
    file.endsWith(".ts") &&
    file !== "en.ts" &&
    file !== "parity.test.ts" &&
    file !== "desktop-native.ts" &&
    !file.endsWith(".test.ts"),
)

let totalUpdated = 0

for (const file of files) {
  const filePath = path.join(dir, file)
  const mod = await import(filePath)
  const missing = Object.keys(en).filter((k) => !(k in mod.dict))
  if (missing.length === 0) continue

  let content = await readFile(filePath, "utf8")
  
  // Find the last closing brace before EOF or satisfies
  const lastBraceIndex = content.lastIndexOf("}")
  if (lastBraceIndex === -1) {
    throw new Error(`No closing brace found in ${file}`)
  }

  const linesToAdd = missing.map((k) => {
    const val = file === "br.ts" && ptTranslations[k] ? ptTranslations[k] : en[k]
    return `  ${JSON.stringify(k)}: ${JSON.stringify(val)},`
  }).join("\n")

  // Insert lines before the last closing brace
  const prefix = content.slice(0, lastBraceIndex)
  const suffix = content.slice(lastBraceIndex)
  const updatedContent = `${prefix.trimEnd()}\n${linesToAdd}\n${suffix}`
  
  await writeFile(filePath, updatedContent, "utf8")
  totalUpdated++
}

console.log(`Successfully synchronized missing keys across ${totalUpdated} locale files!`)

import { readdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { dict as en } from "../packages/app/src/i18n/en.ts"
import { dict as br } from "../packages/app/src/i18n/br.ts"

const keys = ["sidebar.documentation", "documentation.title"] as const
const dir = path.join(import.meta.dir, "../packages/app/src/i18n")
const files = (await readdir(dir)).filter(
  (file) =>
    file.endsWith(".ts") &&
    file !== "en.ts" &&
    file !== "parity.test.ts" &&
    file !== "desktop-native.ts" &&
    !file.endsWith(".test.ts"),
)

for (const file of files) {
  const filePath = path.join(dir, file)
  let content = await readFile(filePath, "utf8")
  const source = file === "br.ts" ? br : en
  for (const key of keys) {
    if (content.includes(`"${key}"`)) continue
    const line = `  "${key}": ${JSON.stringify(source[key])},\n`
    const match = content.match(/"sidebar\.settings":[^\n]+\n/)
    if (!match) throw new Error(`sidebar.settings not found in ${file}`)
    content = content.replace(match[0], `${match[0]}${line}`)
  }
  await writeFile(filePath, content)
  console.log(`updated ${file}`)
}

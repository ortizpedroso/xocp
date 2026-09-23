#!/usr/bin/env bun
/**
 * Regenerates channel desktop icons from the XOCP mark SVG.
 * Uses sharp from the workspace lockfile (astro/miniflare dependency).
 */
import { mkdir, writeFile } from "fs/promises"
import path from "path"
import { fileURLToPath } from "url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const sharpRoot = path.resolve(root, "../../node_modules/.bun/sharp@0.33.5/node_modules/sharp")
const sharpMod = (await import(sharpRoot)).default

type Channel = "dev" | "beta" | "prod"

const themes: Record<Channel, { bg: string; strong: string; base: string }> = {
  dev: { bg: "#2B6CEE", strong: "#FFFFFF", base: "#E8E8E8" },
  beta: { bg: "#F2F2F7", strong: "#1A1A1A", base: "#3A3A3C" },
  prod: { bg: "#1C1C1E", strong: "#FFFFFF", base: "#D1D1D6" },
}

const pngOutputs: Record<string, number> = {
  "32x32.png": 32,
  "64x64.png": 64,
  "128x128.png": 128,
  "128x128@2x.png": 256,
  "Square30x30Logo.png": 30,
  "Square44x44Logo.png": 44,
  "Square71x71Logo.png": 71,
  "Square89x89Logo.png": 89,
  "Square107x107Logo.png": 107,
  "Square142x142Logo.png": 142,
  "Square150x150Logo.png": 150,
  "Square284x284Logo.png": 284,
  "Square310x310Logo.png": 310,
  "StoreLogo.png": 50,
  "dock.png": 256,
  "icon.png": 512,
}

function channelSvg(channel: Channel) {
  const theme = themes[channel]
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
    <rect width="512" height="512" rx="96" fill="${theme.bg}"/>
    <g transform="translate(96,96) scale(4.571428571428571)">
      <rect x="1" y="1" width="68" height="68" rx="6" fill="none" stroke="${theme.strong}" stroke-width="2"/>
      <path d="M20 20 L50 50 M50 20 L20 50" stroke="${theme.base}" stroke-width="7" stroke-linecap="round"/>
    </g>
  </svg>`
}

function pngDirectoryEntry(width: number, height: number, data: Buffer) {
  const header = Buffer.alloc(16)
  header.writeUInt8(width === 256 ? 0 : width, 0)
  header.writeUInt8(height === 256 ? 0 : height, 1)
  header.writeUInt8(0, 2)
  header.writeUInt8(0, 3)
  header.writeUInt16LE(1, 4)
  header.writeUInt16LE(32, 6)
  header.writeUInt32LE(data.length, 8)
  header.writeUInt32LE(22, 12)
  return Buffer.concat([header, data])
}

function writeIco(sizes: Array<{ width: number; height: number; data: Buffer }>) {
  const count = sizes.length
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(count, 4)
  const entries = sizes.map((size) => pngDirectoryEntry(size.width, size.height, size.data))
  const offset = 6 + count * 16
  let cursor = offset
  const resolved = entries.map((entry, index) => {
    const sized = sizes[index]!
    const copy = Buffer.from(entry)
    copy.writeUInt32LE(cursor, 12)
    cursor += sized.data.length
    return copy
  })
  return Buffer.concat([header, ...resolved, ...sizes.map((size) => size.data)])
}

async function renderPng(channel: Channel, size: number) {
  return sharpMod(Buffer.from(channelSvg(channel))).resize(size, size).png().toBuffer()
}

for (const channel of ["dev", "beta", "prod"] as const) {
  const outDir = path.join(root, "icons", channel)
  await mkdir(outDir, { recursive: true })
  for (const [name, size] of Object.entries(pngOutputs)) {
    const png = await renderPng(channel, size)
    await writeFile(path.join(outDir, name), png)
    console.log(`wrote ${channel}/${name} (${size}x${size})`)
  }
  const icon16 = await renderPng(channel, 16)
  const icon32 = await renderPng(channel, 32)
  const ico = writeIco([
    { width: 16, height: 16, data: icon16 },
    { width: 32, height: 32, data: icon32 },
  ])
  await writeFile(path.join(outDir, "icon.ico"), ico)
  console.log(`wrote ${channel}/icon.ico (16, 32)`)
}

console.log("Done. icon.icns / ios / android were not regenerated — run tauri icon if needed.")

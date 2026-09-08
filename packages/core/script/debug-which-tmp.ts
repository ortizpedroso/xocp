#!/usr/bin/env bun
import whichPkg from "which"
import fs from "fs/promises"
import fsSync from "fs"
import os from "os"
import path from "path"
import { which } from "../src/util/which"
import { Global } from "../src/global"

console.log("id -u (process.getuid):", process.getuid ? process.getuid() : "n/a (no getuid)")
console.log("platform:", process.platform)
console.log("Global.Path.bin:", Global.Path.bin)
console.log("Global.Path.bin exists:", fsSync.existsSync(Global.Path.bin))

const dir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "debug-which-")))
const bin = path.join(dir, "bin")
await fs.mkdir(bin)
const file = path.join(bin, "tool")
await fs.writeFile(file, "#!/bin/sh\n")
await fs.chmod(file, 0o755)

const stat = await fs.stat(file)
console.log("file:", file)
console.log("mode (octal):", (stat.mode & 0o777).toString(8))
console.log("uid/gid of file:", stat.uid, stat.gid)
console.log("process uid/gid:", process.getuid?.(), process.getgid?.())

const env = { PATH: bin, PATHEXT: process.env["PATHEXT"] }
const base = env.PATH
const full = base + path.delimiter + Global.Path.bin
console.log("full path arg passed to whichPkg.sync:", full)

try {
  const rawResult = whichPkg.sync("tool", { nothrow: true, path: full, pathExt: env.PATHEXT })
  console.log("whichPkg.sync raw result:", JSON.stringify(rawResult))
} catch (e) {
  console.log("whichPkg.sync threw:", e)
}

try {
  const rawResultNoNothrow = whichPkg.sync("tool", { path: full, pathExt: env.PATHEXT })
  console.log("whichPkg.sync (no nothrow) result:", JSON.stringify(rawResultNoNothrow))
} catch (e) {
  console.log("whichPkg.sync (no nothrow) threw:", String(e))
}

console.log("which() wrapper result:", JSON.stringify(which("tool", env)))

// Sanity: does whichPkg even see the dir listing?
console.log("readdir(bin):", await fs.readdir(bin))

// isexe-level check
try {
  fsSync.accessSync(file, fsSync.constants.X_OK)
  console.log("fs.accessSync X_OK: OK (file is considered executable)")
} catch (e) {
  console.log("fs.accessSync X_OK failed:", String(e))
}

await fs.rm(dir, { recursive: true, force: true })

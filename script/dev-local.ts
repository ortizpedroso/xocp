import { mkdir } from "fs/promises"
import path from "path"

const API_PORT = 4096
const API_HOST = "127.0.0.1"
const API_URL = `http://${API_HOST}:${API_PORT}`
const RESTART_DELAY_MS = 2000
const MAX_API_CRASHES = 4
const CRASH_LOG = path.join(process.cwd(), ".opencode", "logs", "api-crashes.log")

const serveCmd = [
  "bun",
  "run",
  "--cwd",
  "packages/opencode",
  "--conditions=browser",
  "src/index.ts",
  "serve",
  "--port",
  String(API_PORT),
  "--hostname",
  "0.0.0.0",
]

type PortConflict = {
  pid: number
  command: string
}

let shuttingDown = false
let crashCount = 0
let activeServe: Bun.Subprocess | undefined

async function appendCrashLog(lines: string[]) {
  await mkdir(path.dirname(CRASH_LOG), { recursive: true })
  const entry = `${lines.join("\n")}\n\n`
  const file = Bun.file(CRASH_LOG)
  const previous = (await file.exists()) ? await file.text() : ""
  await Bun.write(CRASH_LOG, previous + entry)
}

async function findPortConflict(port: number): Promise<PortConflict | undefined> {
  if (process.platform === "win32") {
    const proc = Bun.spawn(
      [
        "powershell",
        "-NoProfile",
        "-Command",
        `Get-NetTCPConnection -LocalPort ${port} -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty OwningProcess`,
      ],
      { stdout: "pipe", stderr: "pipe" },
    )
    const output = (await new Response(proc.stdout).text()).trim()
    await proc.exited
    const pid = Number.parseInt(output, 10)
    if (!Number.isFinite(pid) || pid <= 0) return
    const detail = Bun.spawn(
      ["powershell", "-NoProfile", "-Command", `(Get-CimInstance Win32_Process -Filter \"ProcessId=${pid}\").CommandLine`],
      { stdout: "pipe", stderr: "pipe" },
    )
    const command = (await new Response(detail.stdout).text()).trim() || "unknown"
    await detail.exited
    return { pid, command }
  }

  const proc = Bun.spawn(
    ["bash", "-lc", `ss -lptn 'sport = :${port}' 2>/dev/null || lsof -nP -iTCP:${port} -sTCP:LISTEN 2>/dev/null | sed -n '2p'`],
    { stdout: "pipe", stderr: "pipe" },
  )
  const output = (await new Response(proc.stdout).text()).trim()
  await proc.exited
  const pidMatch = output.match(/pid=(\d+)/) ?? output.match(/\s(\d+)\s/)
  if (!pidMatch) return
  const pid = Number.parseInt(pidMatch[1]!, 10)
  if (!Number.isFinite(pid)) return
  const ps = Bun.spawn(["ps", "-p", String(pid), "-o", "command="], { stdout: "pipe", stderr: "pipe" })
  const command = (await new Response(ps.stdout).text()).trim() || output
  await ps.exited
  return { pid, command }
}

function formatPortConflictMessage(conflict: PortConflict) {
  const kill = process.platform === "win32" ? `Stop-Process -Id ${conflict.pid} -Force` : `kill ${conflict.pid}`
  return [
    `Port ${API_PORT} is already in use by PID ${conflict.pid}.`,
    `Command: ${conflict.command}`,
    `Free the port, then rerun bun dev:local:`,
    `  ${kill}`,
  ].join("\n")
}

async function ensurePortAvailable() {
  const conflict = await findPortConflict(API_PORT)
  if (!conflict) return
  throw new Error(formatPortConflictMessage(conflict))
}

function spawnServe() {
  const stderrChunks: string[] = []
  const stdoutChunks: string[] = []
  const serve = Bun.spawn({
    cmd: serveCmd,
    stdout: "pipe",
    stderr: "pipe",
    stdin: "inherit",
  })

  const pump = async (
    stream: ReadableStream<Uint8Array> | null | undefined,
    chunks: string[],
    target: "stdout" | "stderr",
  ) => {
    if (!stream) return
    const reader = stream.getReader()
    const decoder = new TextDecoder()
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      const text = decoder.decode(value)
      chunks.push(text)
      if (target === "stdout") process.stdout.write(text)
      else process.stderr.write(text)
    }
  }

  void pump(serve.stdout, stdoutChunks, "stdout")
  void pump(serve.stderr, stderrChunks, "stderr")

  return { serve, stderrChunks, stdoutChunks }
}

async function waitForHealth(serve: Bun.Subprocess, timeoutMs = process.platform === "win32" ? 60000 : 15000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (shuttingDown) return
    const exitCode = serve.exitCode
    if (exitCode !== null) throw new Error(`API server exited before becoming healthy (exit code ${exitCode}).`)
    try {
      const response = await fetch(`${API_URL}/global/health`)
      if (response.ok) return
    } catch {}
    await Bun.sleep(250)
  }
  throw new Error(`API server not ready at ${API_URL} after ${timeoutMs}ms.`)
}

async function handleApiExit(exitCode: number, stderr: string, stdout: string) {
  if (shuttingDown) return
  crashCount += 1
  const timestamp = new Date().toISOString()
  const lines = [
    `[${timestamp}] API process exited (code ${exitCode})`,
    stderr.trim() ? `stderr:\n${stderr.trim()}` : "",
    stdout.trim() ? `stdout:\n${stdout.trim()}` : "",
  ].filter(Boolean)
  await appendCrashLog(lines)
  console.error(`\nAPI server exited unexpectedly (code ${exitCode}). Logged to ${CRASH_LOG}`)

  if (crashCount >= MAX_API_CRASHES) {
    console.error(
      `A API caiu ${MAX_API_CRASHES} vezes, parando de tentar reiniciar automaticamente. Veja ${CRASH_LOG} pra detalhes.`,
    )
    process.exit(exitCode || 1)
  }

  console.log(`Restarting API in ${RESTART_DELAY_MS / 1000}s (attempt ${crashCount}/${MAX_API_CRASHES - 1})...`)
  await Bun.sleep(RESTART_DELAY_MS)
}

async function startApiWithSupervisor() {
  // Mitigation only: auto-restart helps local dev when the API child dies unexpectedly.
  // This does not fix the underlying crash; see .opencode/logs/api-crashes.log for evidence.
  await ensurePortAvailable()

  while (!shuttingDown) {
    const { serve, stderrChunks, stdoutChunks } = spawnServe()
    activeServe = serve
    console.log(`Starting API server on ${API_URL} ...`)

    const ready = await waitForHealth(serve).then(
      () => true,
      async (error) => {
        const exitCode = serve.exitCode
        if (exitCode !== null) {
          await handleApiExit(exitCode, stderrChunks.join(""), stdoutChunks.join(""))
          return false
        }
        throw error
      },
    )
    if (shuttingDown) return
    if (!ready) continue

    const exitCode = await serve.exited
    if (shuttingDown) return
    await handleApiExit(exitCode, stderrChunks.join(""), stdoutChunks.join(""))
  }
}

const stop = () => {
  shuttingDown = true
  activeServe?.kill()
  app.kill()
}

const app = Bun.spawn({
  cmd: ["bun", "run", "--cwd", "packages/app", "dev", "--", "--port", "4444", "--host", "0.0.0.0"],
  stdout: "inherit",
  stderr: "inherit",
  stdin: "inherit",
})

process.on("SIGINT", stop)
process.on("SIGTERM", stop)

const supervisor = startApiWithSupervisor().catch((error) => {
  if (shuttingDown) return 0
  console.error(error instanceof Error ? error.message : String(error))
  return 1
})

const [supervisorExit, appExit] = await Promise.all([supervisor, app.exited])

stop()
process.exit(supervisorExit !== 0 ? supervisorExit : appExit)

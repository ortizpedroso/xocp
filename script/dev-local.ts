async function waitForHealth(url: string, serve: Bun.Subprocess, timeoutMs = process.platform === "win32" ? 60000 : 15000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const exitCode = serve.exitCode
    if (exitCode !== null) {
      throw new Error(`API server exited before becoming healthy (code ${exitCode}). Run "bun dev serve --port 4096" to see the error.`)
    }
    try {
      const response = await fetch(`${url}/global/health`)
      if (response.ok) return
    } catch {}
    await Bun.sleep(250)
  }
  throw new Error(`API server not ready at ${url} after ${timeoutMs}ms. Run "bun dev serve --port 4096" to see startup errors.`)
}

console.log("Starting API server on http://127.0.0.1:4096 ...")
const serve = Bun.spawn({
  cmd: [
    "bun",
    "run",
    "--cwd",
    "packages/opencode",
    "--conditions=browser",
    "src/index.ts",
    "serve",
    "--port",
    "4096",
    "--hostname",
    "0.0.0.0",
  ],
  stdout: "inherit",
  stderr: "inherit",
  stdin: "inherit",
})

await waitForHealth("http://127.0.0.1:4096", serve)

const app = Bun.spawn({
  cmd: ["bun", "run", "--cwd", "packages/app", "dev", "--", "--port", "4444", "--host", "0.0.0.0"],
  stdout: "inherit",
  stderr: "inherit",
  stdin: "inherit",
})

const stop = () => {
  serve.kill()
  app.kill()
}

process.on("SIGINT", stop)
process.on("SIGTERM", stop)

const [serveExit, appExit] = await Promise.all([serve.exited, app.exited])
stop()
process.exit(serveExit !== 0 ? serveExit : appExit)

export type FakeSidecar = {
  readonly url: string
  readonly requests: () => number
  readonly stop: () => void
}

type MapBody = { directory: string }

export function fakeSidecar(handlers: {
  health?: () => Response
  map?: (body: MapBody) => Response
}) {
  let count = 0
  const server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    fetch(request) {
      count++
      const path = new URL(request.url).pathname
      if (path === "/health") return handlers.health?.() ?? Response.json({ status: "ok" })
      if (path === "/map" && request.method === "POST") {
        return request.json().then((value) => {
          const body = value as MapBody
          return handlers.map?.(body) ?? Response.json({ status: "completed", directory: body.directory })
        })
      }
      return new Response("not found", { status: 404 })
    },
  })
  return {
    url: `http://127.0.0.1:${server.port}`,
    requests: () => count,
    stop: () => server.stop(true),
  } satisfies FakeSidecar
}

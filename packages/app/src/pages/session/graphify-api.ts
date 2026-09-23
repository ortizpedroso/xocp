import type { GraphifyMapJobStatus, GraphifySuggestionState } from "./graphify-suggestion"

type GraphifyFetch = typeof fetch

function graphifyPath(sessionID: string, suffix: string) {
  return `/api/session/${encodeURIComponent(sessionID)}/${suffix}`
}

async function readJson<T>(response: Response) {
  const body = (await response.json()) as T & { message?: string; code?: string }
  if (!response.ok) {
    throw { data: { code: body.code, message: body.message }, status: response.status }
  }
  return body as T
}

export function createGraphifyClient(input: { baseUrl: string; fetch?: GraphifyFetch; headers?: HeadersInit }) {
  const fetcher = input.fetch ?? fetch
  const headers = input.headers

  return {
    suggestion: async (sessionID: string) =>
      readJson<GraphifySuggestionState>(
        await fetcher(new URL(graphifyPath(sessionID, "graphify-suggestion"), input.baseUrl), { headers }),
      ),
    startMap: async (sessionID: string) =>
      readJson<{ jobID: string; status: "running" }>(
        await fetcher(new URL(graphifyPath(sessionID, "graphify-map"), input.baseUrl), {
          method: "POST",
          headers: { "Content-Type": "application/json", ...Object.fromEntries(new Headers(headers).entries()) },
          body: "{}",
        }),
      ),
    getMap: async (sessionID: string, jobID: string) =>
      readJson<{ id: string; status: GraphifyMapJobStatus; output?: string; error?: string }>(
        await fetcher(new URL(graphifyPath(sessionID, `graphify-map/${encodeURIComponent(jobID)}`), input.baseUrl), {
          headers,
        }),
      ),
  }
}

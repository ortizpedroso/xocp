import type { GraphifyMapJob, GraphifyMapStart, GraphifySuggestion } from "@opencode-ai/protocol/groups/graphify"
import type { GraphifyMapJobStatus, GraphifySuggestionState } from "./graphify-suggestion"

type AssertExact<A, B> = A extends B ? (B extends A ? true : false) : false

type GraphifyStartMapResponse = { jobID: string; status: "running" }
type GraphifyGetMapResponse = {
  id: string
  status: GraphifyMapJobStatus
  output?: string
  error?: string
}

const _graphifySuggestion: AssertExact<GraphifySuggestionState, typeof GraphifySuggestion.Type> = true
const _graphifyMapStart: AssertExact<GraphifyStartMapResponse, typeof GraphifyMapStart.Type> = true
const _graphifyMapJob: AssertExact<GraphifyGetMapResponse, typeof GraphifyMapJob.Type> = true

export {}

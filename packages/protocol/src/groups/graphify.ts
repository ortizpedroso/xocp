import { Session } from "@opencode-ai/schema/session"
import { Context, Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup, HttpApiMiddleware, OpenApi } from "effect/unstable/httpapi"
import { SessionNotFoundError } from "../errors"

export class GraphifyMapNotFoundError extends Schema.TaggedErrorClass<GraphifyMapNotFoundError>()(
  "GraphifyMapNotFoundError",
  {
    jobID: Schema.String,
    message: Schema.String,
  },
  { httpApiStatus: 404 },
) {}

export class GraphifyNotConfiguredError extends Schema.TaggedErrorClass<GraphifyNotConfiguredError>()(
  "GraphifyNotConfiguredError",
  {
    code: Schema.Literal("graphify_not_configured"),
  },
  { httpApiStatus: 409 },
) {}

export class GraphifySidecarError extends Schema.TaggedErrorClass<GraphifySidecarError>()(
  "GraphifySidecarError",
  {
    code: Schema.Literal("graphify_sidecar_error"),
    message: Schema.String,
  },
  { httpApiStatus: 502 },
) {}

export const GraphifySuggestion = Schema.Struct({
  eligible: Schema.Boolean,
  score: Schema.Number,
  threshold: Schema.Number,
  sidecarConfigured: Schema.Boolean,
}).annotate({ identifier: "GraphifySuggestion" })

export const GraphifyMapStart = Schema.Struct({
  jobID: Schema.String,
  status: Schema.Literal("running"),
}).annotate({ identifier: "GraphifyMapStart" })

export const GraphifyMapJob = Schema.Struct({
  id: Schema.String,
  status: Schema.Literals(["running", "completed", "error", "cancelled"]),
  output: Schema.optional(Schema.String),
  error: Schema.optional(Schema.String),
}).annotate({ identifier: "GraphifyMapJob" })

export const makeGraphifyGroup = <SessionLocationId extends HttpApiMiddleware.AnyId, SessionLocationService>(
  sessionLocationMiddleware: Context.Key<SessionLocationId, SessionLocationService>,
) =>
  HttpApiGroup.make("server.graphify")
    .add(
      HttpApiEndpoint.get("session.graphify.suggestion", "/api/session/:sessionID/graphify-suggestion", {
        params: { sessionID: Session.ID },
        success: GraphifySuggestion,
        error: SessionNotFoundError,
      })
        .middleware(sessionLocationMiddleware)
        .annotateMerge(
          OpenApi.annotations({
            identifier: "v2.session.graphify.suggestion",
            summary: "Get Graphify map suggestion",
            description:
              "Return whether a session is eligible for an opt-in Graphify project map based on local telemetry and sidecar configuration.",
          }),
        ),
    )
    .add(
      HttpApiEndpoint.post("session.graphify.map", "/api/session/:sessionID/graphify-map", {
        params: { sessionID: Session.ID },
        success: GraphifyMapStart,
        error: [SessionNotFoundError, GraphifyNotConfiguredError, GraphifySidecarError],
      })
        .middleware(sessionLocationMiddleware)
        .annotateMerge(
          OpenApi.annotations({
            identifier: "v2.session.graphify.map",
            summary: "Start Graphify project map",
            description: "Start a background Graphify map job for the session project directory.",
          }),
        ),
    )
    .add(
      HttpApiEndpoint.get("session.graphify.map.get", "/api/session/:sessionID/graphify-map/:jobID", {
        params: { sessionID: Session.ID, jobID: Schema.String },
        success: GraphifyMapJob,
        error: [SessionNotFoundError, GraphifyMapNotFoundError],
      })
        .middleware(sessionLocationMiddleware)
        .annotateMerge(
          OpenApi.annotations({
            identifier: "v2.session.graphify.map.get",
            summary: "Get Graphify map job status",
            description: "Return the current status of a Graphify map background job.",
          }),
        ),
    )
    .annotateMerge(
      OpenApi.annotations({
        title: "graphify",
        description: "Experimental Graphify map routes.",
      }),
    )

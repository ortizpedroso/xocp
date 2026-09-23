import { Context, Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup, OpenApi } from "effect/unstable/httpapi"

export class OmniRouteNpmNotFoundError extends Schema.TaggedErrorClass<OmniRouteNpmNotFoundError>()(
  "OmniRouteNpmNotFoundError",
  {
    code: Schema.Literal("omniroute_npm_not_found"),
  },
  { httpApiStatus: 409 },
) {}

export class OmniRouteActivateNotFoundError extends Schema.TaggedErrorClass<OmniRouteActivateNotFoundError>()(
  "OmniRouteActivateNotFoundError",
  {
    jobID: Schema.String,
    message: Schema.String,
  },
  { httpApiStatus: 404 },
) {}

export const OmniRouteStatus = Schema.Struct({
  available: Schema.Boolean,
  running: Schema.Boolean,
}).annotate({ identifier: "OmniRouteStatus" })

export const OmniRouteActivateStart = Schema.Struct({
  jobID: Schema.String,
  status: Schema.Literal("running"),
}).annotate({ identifier: "OmniRouteActivateStart" })

export const OmniRouteActivateJob = Schema.Struct({
  id: Schema.String,
  status: Schema.Literals(["running", "completed", "error", "cancelled"]),
  output: Schema.optional(Schema.String),
  error: Schema.optional(Schema.String),
}).annotate({ identifier: "OmniRouteActivateJob" })

export const OmniRouteGroup = HttpApiGroup.make("server.omniroute")
  .add(
    HttpApiEndpoint.get("omniroute.status", "/api/omniroute/status", {
      success: OmniRouteStatus,
    }).annotateMerge(
      OpenApi.annotations({
        identifier: "v2.omniroute.status",
        summary: "Get OmniRoute availability",
        description: "Return whether npm/npx is available and OmniRoute is already running locally.",
      }),
    ),
  )
  .add(
    HttpApiEndpoint.post("omniroute.activate", "/api/omniroute/activate", {
      success: OmniRouteActivateStart,
      error: OmniRouteNpmNotFoundError,
    }).annotateMerge(
      OpenApi.annotations({
        identifier: "v2.omniroute.activate",
        summary: "Start OmniRoute activation",
        description: "Install, configure, and start OmniRoute in a background job after explicit user consent.",
      }),
    ),
  )
  .add(
    HttpApiEndpoint.get("omniroute.activate.get", "/api/omniroute/activate/:jobID", {
      params: { jobID: Schema.String },
      success: OmniRouteActivateJob,
      error: OmniRouteActivateNotFoundError,
    }).annotateMerge(
      OpenApi.annotations({
        identifier: "v2.omniroute.activate.get",
        summary: "Get OmniRoute activation job status",
        description: "Poll the background activation job started by POST /api/omniroute/activate.",
      }),
    ),
  )
  .annotateMerge(
    OpenApi.annotations({
      title: "omniroute",
      description: "Opt-in OmniRoute local gateway activation.",
    }),
  )

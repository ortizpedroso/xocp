import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup, OpenApi } from "effect/unstable/httpapi"

export class HeadroomUvNotFoundError extends Schema.TaggedErrorClass<HeadroomUvNotFoundError>()(
  "HeadroomUvNotFoundError",
  {
    code: Schema.Literal("headroom_uv_not_found"),
  },
  { httpApiStatus: 409 },
) {}

export class HeadroomActivateNotFoundError extends Schema.TaggedErrorClass<HeadroomActivateNotFoundError>()(
  "HeadroomActivateNotFoundError",
  {
    jobID: Schema.String,
    message: Schema.String,
  },
  { httpApiStatus: 404 },
) {}

export const HeadroomStatus = Schema.Struct({
  available: Schema.Boolean,
  running: Schema.Boolean,
}).annotate({ identifier: "HeadroomStatus" })

export const HeadroomActivateStart = Schema.Struct({
  jobID: Schema.String,
  status: Schema.Literal("running"),
}).annotate({ identifier: "HeadroomActivateStart" })

export const HeadroomActivateJob = Schema.Struct({
  id: Schema.String,
  status: Schema.Literals(["running", "completed", "error", "cancelled"]),
  output: Schema.optional(Schema.String),
  error: Schema.optional(Schema.String),
}).annotate({ identifier: "HeadroomActivateJob" })

export const HeadroomGroup = HttpApiGroup.make("server.headroom")
  .add(
    HttpApiEndpoint.get("headroom.status", "/api/headroom/status", {
      success: HeadroomStatus,
    }).annotateMerge(
      OpenApi.annotations({
        identifier: "v2.headroom.status",
        summary: "Get Headroom availability",
        description: "Return whether uv is available and the Headroom proxy is already running locally.",
      }),
    ),
  )
  .add(
    HttpApiEndpoint.post("headroom.activate", "/api/headroom/activate", {
      success: HeadroomActivateStart,
      error: HeadroomUvNotFoundError,
    }).annotateMerge(
      OpenApi.annotations({
        identifier: "v2.headroom.activate",
        summary: "Start Headroom activation",
        description: "Install and start the Headroom proxy in a background job after explicit user consent.",
      }),
    ),
  )
  .add(
    HttpApiEndpoint.get("headroom.activate.get", "/api/headroom/activate/:jobID", {
      params: { jobID: Schema.String },
      success: HeadroomActivateJob,
      error: HeadroomActivateNotFoundError,
    }).annotateMerge(
      OpenApi.annotations({
        identifier: "v2.headroom.activate.get",
        summary: "Get Headroom activation job status",
        description: "Poll the background activation job started by POST /api/headroom/activate.",
      }),
    ),
  )
  .annotateMerge(
    OpenApi.annotations({
      title: "headroom",
      description: "Opt-in Headroom local proxy activation.",
    }),
  )

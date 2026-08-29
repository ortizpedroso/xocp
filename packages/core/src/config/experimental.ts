export * as ConfigExperimental from "./experimental"

import { Schema } from "effect"
import { Catalog } from "../catalog"
import { Policy as PolicyV2 } from "../policy"
import { PositiveInt } from "../schema"

// Each core domain exports the policy actions it supports. Adding an action to
// this union makes it valid in authored config while keeping Policy generic.
export const PolicyAction = Schema.Union([Catalog.PolicyActions])

export class Policy extends Schema.Class<Policy>("ConfigV2.Experimental.Policy")({
  ...PolicyV2.Info.fields,
  action: PolicyAction,
}) {}

export class GraphifySidecar extends Schema.Class<GraphifySidecar>("ConfigV2.Experimental.GraphifySidecar")({
  url: Schema.String.pipe(Schema.optional).annotate({
    description: "Base URL of the external Graphify sidecar HTTP service.",
  }),
  enabled: Schema.Boolean.pipe(Schema.optional).annotate({
    description: "When true, the Graphify sidecar client may be used. Defaults to false.",
  }),
  timeout_ms: PositiveInt.pipe(Schema.optional).annotate({
    description: "HTTP request timeout in milliseconds for Graphify sidecar calls.",
  }),
}) {}

export class Experimental extends Schema.Class<Experimental>("ConfigV2.Experimental")({
  policies: Policy.pipe(Schema.Array, Schema.optional),
  graphify: Schema.Boolean.pipe(Schema.optional),
  graphify_sidecar: GraphifySidecar.pipe(Schema.optional),
}) {}

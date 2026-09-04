import { Schema } from "effect"

export class UvNotFound extends Schema.TaggedErrorClass<UvNotFound>()("Graphify.UvNotFound", {}) {}

export class GraphifyDisabled extends Schema.TaggedErrorClass<GraphifyDisabled>()("Graphify.GraphifyDisabled", {}) {}

export class UpdateFailed extends Schema.TaggedErrorClass<UpdateFailed>()("Graphify.UpdateFailed", {
  exitCode: Schema.optional(Schema.Number),
  stderr: Schema.optional(Schema.String),
}) {}

export class GraphReadFailed extends Schema.TaggedErrorClass<GraphReadFailed>()("Graphify.GraphReadFailed", {
  path: Schema.String,
}) {}

export class QueryFailed extends Schema.TaggedErrorClass<QueryFailed>()("Graphify.QueryFailed", {
  exitCode: Schema.optional(Schema.Number),
  stderr: Schema.optional(Schema.String),
}) {}

export const Error = Schema.Union([UvNotFound, GraphifyDisabled, UpdateFailed, GraphReadFailed, QueryFailed])
export type Error = typeof Error.Type

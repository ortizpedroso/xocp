import { Schema } from "effect"

export class NotConfigured extends Schema.TaggedErrorClass<NotConfigured>()("Graphify.NotConfigured", {}) {}

export class Unreachable extends Schema.TaggedErrorClass<Unreachable>()("Graphify.Unreachable", {
  cause: Schema.String,
}) {}

export class InvalidResponse extends Schema.TaggedErrorClass<InvalidResponse>()("Graphify.InvalidResponse", {
  message: Schema.String,
  body: Schema.optional(Schema.String),
}) {}

export class RemoteError extends Schema.TaggedErrorClass<RemoteError>()("Graphify.RemoteError", {
  status: Schema.Number,
  body: Schema.String,
}) {}

export const Error = Schema.Union([NotConfigured, Unreachable, InvalidResponse, RemoteError])
export type Error = typeof Error.Type

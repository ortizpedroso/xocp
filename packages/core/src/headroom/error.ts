import { Schema } from "effect"

export class UvNotFound extends Schema.TaggedErrorClass<UvNotFound>()("Headroom.UvNotFound", {}) {}

export class ActivateFailed extends Schema.TaggedErrorClass<ActivateFailed>()("Headroom.ActivateFailed", {
  step: Schema.String,
  message: Schema.String,
}) {}

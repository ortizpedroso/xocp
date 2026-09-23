import { Schema } from "effect"

export class TooLong extends Schema.TaggedErrorClass<TooLong>()("Handoff.TooLong", {
  length: Schema.Int,
  max: Schema.Int,
}) {}

import { Schema } from "effect"

export class NpmNotFound extends Schema.TaggedErrorClass<NpmNotFound>()("OmniRoute.NpmNotFound", {}) {}

export class ActivateFailed extends Schema.TaggedErrorClass<ActivateFailed>()("OmniRoute.ActivateFailed", {
  step: Schema.String,
  message: Schema.String,
}) {}

export class JobNotFound extends Schema.TaggedErrorClass<JobNotFound>()("OmniRoute.JobNotFound", {
  jobID: Schema.String,
}) {}

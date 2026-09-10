import { Schema } from "effect"

export class ContractNotFound extends Schema.TaggedErrorClass<ContractNotFound>()("WorkflowReview.ContractNotFound", {
  task_id: Schema.String,
  path: Schema.String,
}) {}

export class FrontmatterParseError extends Schema.TaggedErrorClass<FrontmatterParseError>()(
  "WorkflowReview.FrontmatterParseError",
  {
    path: Schema.String,
    message: Schema.String,
  },
) {}

export class NotApproved extends Schema.TaggedErrorClass<NotApproved>()("WorkflowReview.NotApproved", {
  task_id: Schema.String,
  path: Schema.String,
  status: Schema.String,
}) {}

export class CycleLimitExceeded extends Schema.TaggedErrorClass<CycleLimitExceeded>()("WorkflowReview.CycleLimitExceeded", {
  task_id: Schema.String,
  cycle: Schema.Int,
}) {}

export class CompleteWithIncomplete extends Schema.TaggedErrorClass<CompleteWithIncomplete>()(
  "WorkflowReview.CompleteWithIncomplete",
  {
    incompleteCount: Schema.Int,
  },
) {}

export class InvalidGates extends Schema.TaggedErrorClass<InvalidGates>()("WorkflowReview.InvalidGates", {
  task_id: Schema.String,
  message: Schema.String,
}) {}

export class InconsistentOverall extends Schema.TaggedErrorClass<InconsistentOverall>()(
  "WorkflowReview.InconsistentOverall",
  {
    task_id: Schema.String,
    message: Schema.String,
  },
) {}

export class ReviewArtifactNotFound extends Schema.TaggedErrorClass<ReviewArtifactNotFound>()(
  "WorkflowReview.ReviewArtifactNotFound",
  {
    task_id: Schema.String,
    kind: Schema.Literals(["execution", "cycle"]),
  },
) {}

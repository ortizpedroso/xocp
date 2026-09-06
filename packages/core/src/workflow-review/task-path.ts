import path from "path"

export const SPEC_TASK_ID = /^spec:([^:]+):G\d+$/

export type TaskKind = "brief" | "spec"

export function taskKind(task_id: string): TaskKind {
  return SPEC_TASK_ID.test(task_id) ? "spec" : "brief"
}

export function contractRelativePath(task_id: string) {
  const match = task_id.match(SPEC_TASK_ID)
  if (match) return `specs/${match[1]}.md`
  return path.join(".opencode", "briefs", `${task_id}.yaml`)
}

export function reviewsRelativeDir(task_id: string) {
  return path.join(".opencode", "reviews", task_id)
}

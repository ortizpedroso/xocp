import path from "path"

export const SPEC_TASK_ID = /^spec:([^:]+):G\d+$/

export type TaskKind = "brief" | "spec"

export type ResolvedTask = {
  kind: TaskKind
  task_id: string
  relativePath: string
}

export function parseTaskId(task_id: string) {
  const match = task_id.match(SPEC_TASK_ID)
  if (match) {
    const slug = match[1]
    return {
      kind: "spec" as const,
      task_id,
      candidates: [`specs/${slug}.md`, path.join(".opencode", "specs", `${slug}.md`)],
    }
  }

  if (!task_id || task_id.includes("/") || task_id.includes(":")) {
    return undefined
  }

  return {
    kind: "brief" as const,
    task_id,
    candidates: [path.join(".opencode", "briefs", `${task_id}.yaml`)],
  }
}

export async function resolveTaskPath(directory: string, task_id: string) {
  const parsed = parseTaskId(task_id)
  if (!parsed) return undefined

  for (const relativePath of parsed.candidates) {
    const absolute = path.join(directory, relativePath)
    if (await Bun.file(absolute).exists()) {
      return {
        kind: parsed.kind,
        task_id,
        relativePath,
      } satisfies ResolvedTask
    }
  }

  return undefined
}

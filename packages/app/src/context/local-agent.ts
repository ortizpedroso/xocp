export function hasCustomAgent(items: Array<{ native?: boolean; pipeline?: boolean }>) {
  return items.some((item) => item.native === false || item.pipeline === true)
}

export function resolveAgent<T extends { name: string }>(items: T[], name?: string) {
  return items.find((item) => item.name === name) ?? items.find((item) => item.name === "build") ?? items[0]
}

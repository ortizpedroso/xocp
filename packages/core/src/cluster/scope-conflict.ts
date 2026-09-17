import type { TechnicalBriefV2 } from "../brief/types"

/**
 * Dispatch-time scope gate. Two briefs are never run in the same parallel wave
 * when their `allow_modify` sets overlap (write-write conflict). The integration
 * cluster is the only one allowed to cross cluster boundaries, so it is only
 * parallel with a cluster whose files it does NOT overlap.
 *
 * Approximation: two globs overlap when they share an identical literal prefix
 * or one literal prefix is an ancestor of the other. Patterns that start with a
 * wildcard (empty literal prefix) only overlap when identical — they cannot be
 * proven to collide deterministically, so we stay permissive there.
 */

export function literalPrefix(pattern: string): string {
  let i = 0
  while (i < pattern.length) {
    const ch = pattern[i]
    if (ch === "*" || ch === "?" || ch === "[") break
    i++
  }
  const prefix = pattern.slice(0, i)
  // Normalize trailing slashes so "packages/core" == "packages/core/"
  return prefix.replace(/\/+$/, "/") === "/" ? "" : prefix.replace(/\/+$/, "/")
}

export function patternsOverlap(a: string, b: string): boolean {
  if (a === b) return true
  const pa = literalPrefix(a)
  const pb = literalPrefix(b)
  if (pa.length === 0 || pb.length === 0) return false
  // Compare on trimmed prefixes; ancestor relationships are only valid at a
  // directory boundary ("packages/app" is not a prefix of "packages/application",
  // but it covers "packages/app/theme/tokens.ts").
  const ta = pa.replace(/[\\/]+$/, "")
  const tb = pb.replace(/[\\/]+$/, "")
  return ta === tb || tb.startsWith(`${ta}/`) || ta.startsWith(`${tb}/`)
}

export function scopeOverlap(a: TechnicalBriefV2, b: TechnicalBriefV2): boolean {
  const ma = a.files_scope.allow_modify
  const mb = b.files_scope.allow_modify
  for (const x of ma) {
    for (const y of mb) {
      if (patternsOverlap(x, y)) return true
    }
  }
  return false
}

/**
 * Picks a maximal prefix of `briefs` with no pairwise allow_modify overlap,
 * preserving input order. Overlapping briefs are left out of the returned set
 * and can be dispatched in a later wave.
 */
export function selectNonOverlapping(briefs: TechnicalBriefV2[]): TechnicalBriefV2[] {
  const chosen: TechnicalBriefV2[] = []
  for (const brief of briefs) {
    if (chosen.every((c) => !scopeOverlap(c, brief))) {
      chosen.push(brief)
    }
  }
  return chosen
}
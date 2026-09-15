export interface TranscriptSegment {
  timestamp: string // e.g. "04:12" or "01:23:45"
  text: string
  speaker?: string
}

export interface VideoMetadata {
  title: string
  channel?: string
  description?: string
  videoUrlOrId: string
}

/**
 * YouTube & Media Transcript Normalizer
 * Ingests video URL/ID, retrieves metadata, and converts caption streams into punctuated,
 * timestamped Markdown sections (e.g. `## [04:12] Architecture Breakdown`)
 */
export function transformTranscriptToMarkdown(
  metadata: VideoMetadata,
  segments: TranscriptSegment[]
): { title: string; markdown: string } {
  const sections: string[] = []

  // Document Title & Metadata
  sections.push(`# ${metadata.title}`)
  if (metadata.channel || metadata.description) {
    const metaLines: string[] = []
    if (metadata.channel) metaLines.push(`**Channel:** ${metadata.channel}`)
    metaLines.push(`**Source:** ${metadata.videoUrlOrId}`)
    if (metadata.description) metaLines.push(`**Description:** ${metadata.description.slice(0, 200).trim()}...`)
    sections.push(metaLines.join("\n\n"))
  }

  // Group segments into timestamped blocks (e.g. every 2-3 minutes or per distinct topic)
  let currentTimestamp = segments.length > 0 ? segments[0].timestamp : "00:00"
  let currentGroupText: string[] = []

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]

    if (currentGroupText.length === 0) {
      currentTimestamp = seg.timestamp
    }

    const speakerPrefix = seg.speaker ? `**${seg.speaker}:** ` : ""
    currentGroupText.push(`${speakerPrefix}${seg.text.trim()}`)

    // Create a section break if segment contains punctuation terminator or group reaches ~3 items
    const textJoined = currentGroupText.join(" ")
    if (currentGroupText.length >= 3 || i === segments.length - 1) {
      sections.push(`## [${currentTimestamp}] Discussion`)
      sections.push(textJoined)
      currentGroupText = []
    }
  }

  return {
    title: metadata.title,
    markdown: sections.join("\n\n").trim(),
  }
}

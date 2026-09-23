import {
  transformTranscriptToMarkdown,
  type TranscriptSegment,
  type VideoMetadata,
} from "./transcript-transformer"

export type UrlFetcher = (
  input: Parameters<typeof fetch>[0],
  init?: RequestInit
) => Promise<Response>

export interface YouTubeCrawlerResult {
  videoId: string
  title: string
  markdown: string
  hasTranscript: boolean
  segmentsCount: number
}

/**
 * Extracts the 11-character YouTube video ID from diverse URL formats:
 * - https://www.youtube.com/watch?v=dQw4w9WgXcQ
 * - https://youtu.be/dQw4w9WgXcQ
 * - https://www.youtube.com/embed/dQw4w9WgXcQ
 * - https://youtube.com/shorts/dQw4w9WgXcQ
 * - dQw4w9WgXcQ (raw ID)
 */
export function extractYouTubeVideoId(urlOrId: string): string | null {
  const trimmed = urlOrId.trim()
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
    return trimmed
  }

  const patterns = [
    /(?:https?:\/\/)?(?:www\.)?youtube\.com\/watch\?(?:.*&)?v=([a-zA-Z0-9_-]{11})/,
    /(?:https?:\/\/)?youtu\.be\/([a-zA-Z0-9_-]{11})/,
    /(?:https?:\/\/)?(?:www\.)?youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
    /(?:https?:\/\/)?(?:www\.)?youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
    /(?:https?:\/\/)?(?:www\.)?youtube\.com\/v\/([a-zA-Z0-9_-]{11})/,
  ]

  for (const pattern of patterns) {
    const match = trimmed.match(pattern)
    if (match && match[1]) {
      return match[1]
    }
  }

  return null
}

/**
 * Converts seconds float to MM:SS or HH:MM:SS
 */
export function formatSecondsToTimestamp(seconds: number): string {
  const totalSec = Math.floor(seconds)
  const hrs = Math.floor(totalSec / 3600)
  const mins = Math.floor((totalSec % 3600) / 60)
  const secs = totalSec % 60

  const pad = (n: number) => n.toString().padStart(2, "0")
  if (hrs > 0) {
    return `${pad(hrs)}:${pad(mins)}:${pad(secs)}`
  }
  return `${pad(mins)}:${pad(secs)}`
}

/**
 * Parses XML captions (YouTube timedtext format)
 * <text start="0.4" dur="2.1">Caption text here</text>
 */
export function parseCaptionXml(xml: string): TranscriptSegment[] {
  const segments: TranscriptSegment[] = []
  const textTagRegex = /<text\s+start="([\d.]+)"(?:\s+dur="[\d.]+")?[^>]*>(.*?)<\/text>/gi

  let match: RegExpExecArray | null
  while ((match = textTagRegex.exec(xml)) !== null) {
    const startSec = parseFloat(match[1]) || 0
    let cleanText = match[2]
      .replace(/<[^>]+>/g, "")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, " ")
      .trim()

    if (cleanText) {
      segments.push({
        timestamp: formatSecondsToTimestamp(startSec),
        text: cleanText,
      })
    }
  }

  return segments
}

/**
 * Parses JSON caption formats (events with segrange or transcript structures)
 */
export function parseCaptionJson(json: any): TranscriptSegment[] {
  const segments: TranscriptSegment[] = []
  if (Array.isArray(json?.events)) {
    for (const evt of json.events) {
      const startSec = (evt.tStartMs || 0) / 1000
      const textParts = (evt.segs || []).map((s: any) => s.utf8 || "").join("")
      const trimmed = textParts.trim()
      if (trimmed) {
        segments.push({
          timestamp: formatSecondsToTimestamp(startSec),
          text: trimmed,
        })
      }
    }
  }
  return segments
}

/**
 * YouTube public caption & metadata crawler
 * Operates without API keys by querying public timedtext / watch page data
 */
export async function crawlYouTubeTranscript(
  urlOrId: string,
  fetcher: UrlFetcher = fetch
): Promise<YouTubeCrawlerResult> {
  const videoId = extractYouTubeVideoId(urlOrId)
  if (!videoId) {
    throw new Error(`Invalid YouTube URL or ID: ${urlOrId}`)
  }

  const cleanUrl = `https://www.youtube.com/watch?v=${videoId}`
  let title = `YouTube Video (${videoId})`
  let channel = "YouTube Creator"
  let description = ""
  let segments: TranscriptSegment[] = []

  try {
    // 1. Fetch metadata via public oEmbed API (reliable, official zero-key endpoint)
    try {
      const oembedRes = await fetcher(
        `https://www.youtube.com/oembed?url=${encodeURIComponent(cleanUrl)}&format=json`
      )
      if (oembedRes.ok) {
        const oembed = (await oembedRes.json()) as any
        if (oembed.title) title = oembed.title
        if (oembed.author_name) channel = oembed.author_name
      }
    } catch {
      // Non-fatal, fallback title remains
    }

    // 2. Fetch public watch page to locate timedtext tracks
    const pageRes = await fetcher(cleanUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
      },
    })

    if (pageRes.ok) {
      const html = await pageRes.text()

      // Extract caption tracks from ytInitialPlayerResponse
      const playerResponseMatch = html.match(/ytInitialPlayerResponse\s*=\s*({.+?});/s)
      if (playerResponseMatch) {
        try {
          const playerResponse = JSON.parse(playerResponseMatch[1])
          const videoDetails = playerResponse?.videoDetails
          if (videoDetails) {
            if (videoDetails.title) title = videoDetails.title
            if (videoDetails.author) channel = videoDetails.author
            if (videoDetails.shortDescription) description = videoDetails.shortDescription
          }

          const captionTracks =
            playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks
          if (Array.isArray(captionTracks) && captionTracks.length > 0) {
            // Prefer English, otherwise first available
            const track =
              captionTracks.find((t: any) => t.languageCode?.startsWith("en")) || captionTracks[0]
            if (track?.baseUrl) {
              const captionRes = await fetcher(track.baseUrl)
              if (captionRes.ok) {
                const captionContent = await captionRes.text()
                if (captionContent.startsWith("{")) {
                  segments = parseCaptionJson(JSON.parse(captionContent))
                } else {
                  segments = parseCaptionXml(captionContent)
                }
              }
            }
          }
        } catch {
          // JSON parsing failure, fallback to direct timedtext request
        }
      }

      // Fallback: direct timedtext endpoint check if segments still empty
      if (segments.length === 0) {
        try {
          const timedTextRes = await fetcher(
            `https://www.youtube.com/api/timedtext?lang=en&v=${videoId}`
          )
          if (timedTextRes.ok) {
            const timedTextXml = await timedTextRes.text()
            if (timedTextXml && timedTextXml.includes("<text")) {
              segments = parseCaptionXml(timedTextXml)
            }
          }
        } catch {
          // Captions unavailable
        }
      }
    }
  } catch {
    // Network or fetch error
  }

  const meta: VideoMetadata = {
    title,
    channel,
    description,
    videoUrlOrId: cleanUrl,
  }

  if (segments.length > 0) {
    const { markdown } = transformTranscriptToMarkdown(meta, segments)
    return {
      videoId,
      title,
      markdown,
      hasTranscript: true,
      segmentsCount: segments.length,
    }
  }

  // Fallback when captions disabled or absent: ingest structured metadata
  const fallbackMarkdown = [
    `# ${title}`,
    "",
    `**Channel:** ${channel}`,
    `**Source:** ${cleanUrl}`,
    "",
    description ? `### Description\n\n${description.slice(0, 1000).trim()}...` : "",
    "",
    "*[Notice: Automated closed captions were unavailable or disabled for this video. Metadata ingested.]*",
  ]
    .filter(Boolean)
    .join("\n\n")

  return {
    videoId,
    title,
    markdown: fallbackMarkdown,
    hasTranscript: false,
    segmentsCount: 0,
  }
}

import { describe, expect, test } from "bun:test"
import {
  extractYouTubeVideoId,
  formatSecondsToTimestamp,
  parseCaptionXml,
  parseCaptionJson,
  crawlYouTubeTranscript,
  type UrlFetcher,
} from "../../src/sources/transformers/youtube-crawler"

describe("sources/transformers/youtube-crawler YouTube Auto-Caption Crawler", () => {
  test("Validates Video ID extraction across diverse URL formats", () => {
    const urls = [
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      "https://youtu.be/dQw4w9WgXcQ",
      "https://www.youtube.com/embed/dQw4w9WgXcQ",
      "https://youtube.com/shorts/dQw4w9WgXcQ",
      "https://www.youtube.com/watch?feature=shared&v=dQw4w9WgXcQ",
      "dQw4w9WgXcQ",
    ]

    for (const u of urls) {
      const id = extractYouTubeVideoId(u)
      expect(id).toBe("dQw4w9WgXcQ")
    }

    expect(extractYouTubeVideoId("https://vimeo.com/12345678")).toBeNull()
    expect(extractYouTubeVideoId("not-a-valid-youtube-url")).toBeNull()
  })

  test("Validates timestamp formatting from seconds", () => {
    expect(formatSecondsToTimestamp(65)).toBe("01:05")
    expect(formatSecondsToTimestamp(252)).toBe("04:12")
    expect(formatSecondsToTimestamp(3665)).toBe("01:01:05")
  })

  test("Validates caption XML parsing into timestamped transcript segments", () => {
    const sampleXml = `<?xml version="1.0" encoding="utf-8" ?>
<transcript>
  <text start="0.5" dur="2.1">Welcome to &amp;lt;XOCP&amp;gt; architecture.</text>
  <text start="3.2" dur="3.0">Today we discuss the multi-agent pipeline.</text>
  <text start="7.0" dur="2.5">Notice the zero-drift guarantees.</text>
</transcript>`

    const segments = parseCaptionXml(sampleXml)
    expect(segments.length).toBe(3)
    expect(segments[0].timestamp).toBe("00:00")
    expect(segments[0].text).toBe("Welcome to <XOCP> architecture.")
    expect(segments[1].timestamp).toBe("00:03")
    expect(segments[1].text).toBe("Today we discuss the multi-agent pipeline.")
    expect(segments[2].timestamp).toBe("00:07")
    expect(segments[2].text).toBe("Notice the zero-drift guarantees.")
  })

  test("Validates crawlYouTubeTranscript with mock caption responses", async () => {
    const mockFetcher: UrlFetcher = async (input) => {
      const urlStr = typeof input === "string" ? input : input.toString()

      if (urlStr.includes("oembed")) {
        return new Response(
          JSON.stringify({
            title: "XOCP Architectural Deep Dive",
            author_name: "XOCP Team",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      }

      if (urlStr.includes("timedtext")) {
        return new Response(
          `<transcript><text start="252.0" dur="5.0">We begin with cluster isolation.</text></transcript>`,
          { status: 200, headers: { "Content-Type": "text/xml" } }
        )
      }

      // Main video page
      return new Response(
        `<html><head><title>XOCP Deep Dive</title></head><body>ytInitialPlayerResponse = {"videoDetails":{"title":"XOCP Architectural Deep Dive","author":"XOCP Team","shortDescription":"Detailed walkthrough"},"captions":{"playerCaptionsTracklistRenderer":{"captionTracks":[{"baseUrl":"https://www.youtube.com/api/timedtext?v=dQw4w9WgXcQ","languageCode":"en"}]}}};</body></html>`,
        { status: 200, headers: { "Content-Type": "text/html" } }
      )
    }

    const result = await crawlYouTubeTranscript("https://www.youtube.com/watch?v=dQw4w9WgXcQ", mockFetcher)

    expect(result.videoId).toBe("dQw4w9WgXcQ")
    expect(result.title).toBe("XOCP Architectural Deep Dive")
    expect(result.hasTranscript).toBe(true)
    expect(result.markdown).toContain("## [04:12] Discussion")
    expect(result.markdown).toContain("We begin with cluster isolation")
  })
})

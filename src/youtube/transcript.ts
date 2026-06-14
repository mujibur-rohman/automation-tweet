// Ambil transcript YouTube dengan FALLBACK:
//  1) youtube-transcript (gratis, jalan dari IP residensial)
//  2) RapidAPI youtube-v2 /video/subtitles (jalan dari VPS yang diblok YouTube)
import { YoutubeTranscript } from "youtube-transcript";
import { config } from "../config";

export class TranscriptError extends Error {}

const RAPID_SUB_HOST = "youtube-v2.p.rapidapi.com";

/** Ekstrak video_id dari berbagai bentuk URL YouTube (watch, youtu.be, shorts). */
export function parseVideoId(url: string): string | null {
  const patterns = [
    /[?&]v=([A-Za-z0-9_-]{11})/,
    /youtu\.be\/([A-Za-z0-9_-]{11})/,
    /\/shorts\/([A-Za-z0-9_-]{11})/,
    /\/embed\/([A-Za-z0-9_-]{11})/,
  ];
  for (const re of patterns) {
    const m = url.match(re);
    if (m) return m[1]!;
  }
  if (/^[A-Za-z0-9_-]{11}$/.test(url.trim())) return url.trim();
  return null;
}

function joinText(parts: string[]): string {
  const text = parts.join(" ").replace(/\s+/g, " ").trim();
  if (!text) throw new TranscriptError("Transcript kosong");
  return text;
}

/** Sumber 1: library youtube-transcript (scrape langsung). */
async function fromYoutubeTranscript(videoId: string): Promise<string> {
  const segments = await YoutubeTranscript.fetchTranscript(videoId);
  return joinText(segments.map((s) => s.text));
}

/** Sumber 2: RapidAPI youtube-v2 /video/subtitles. */
async function fromRapidApi(videoId: string): Promise<string> {
  const url = new URL(`https://${RAPID_SUB_HOST}/video/subtitles`);
  url.searchParams.set("video_id", videoId);
  const res = await fetch(url, {
    headers: { "x-rapidapi-key": config.rapidApi.key, "x-rapidapi-host": RAPID_SUB_HOST },
  });
  if (!res.ok) throw new TranscriptError(`RapidAPI subtitles HTTP ${res.status}`);
  const json: any = await res.json();
  if (json?.is_available === false || !Array.isArray(json?.subtitles) || json.subtitles.length === 0) {
    throw new TranscriptError("Subtitle tidak tersedia di video ini");
  }
  return joinText(json.subtitles.map((s: any) => s.text ?? ""));
}

/** Ambil transcript (gabungan teks), mencoba tiap sumber berurutan. */
export async function fetchTranscript(videoId: string): Promise<string> {
  const sources = [
    { name: "youtube-transcript", fn: () => fromYoutubeTranscript(videoId) },
    { name: "rapidapi-youtube-v2", fn: () => fromRapidApi(videoId) },
  ];
  const errors: string[] = [];
  for (const s of sources) {
    try {
      return await s.fn();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${s.name}: ${msg}`);
      console.warn(`[transcript] ${s.name} gagal, coba berikutnya: ${msg}`);
    }
  }
  throw new TranscriptError(`Gagal ambil transcript dari semua sumber -> ${errors.join(" | ")}`);
}

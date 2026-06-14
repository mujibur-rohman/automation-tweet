// Ambil transcript YouTube via library youtube-transcript (scrape langsung).
// Catatan: dari IP datacenter (VPS) sering diblok YouTube; andal dari IP residensial.
import { YoutubeTranscript } from "youtube-transcript";

export class TranscriptError extends Error {}

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

/** Ambil transcript (digabung jadi satu teks) via youtube-transcript. */
export async function fetchTranscript(videoId: string): Promise<string> {
  try {
    const segments = await YoutubeTranscript.fetchTranscript(videoId);
    const text = segments
      .map((s) => s.text)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    if (!text) throw new TranscriptError("Transcript kosong");
    return text;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new TranscriptError(`Gagal ambil transcript: ${msg}`);
  }
}

// Repo youtube_posts (automation #2). Reuse koneksi sql dari lib bersama.
import { sql } from "../db/client";

export type YoutubeStatus = "received" | "processing" | "queued" | "posted" | "failed";

export type YoutubeRow = {
  id: number;
  video_id: string;
  url: string;
  transcript: string | null;
  paragraph: string | null;
  image_prompt: string | null;
  image_url: string | null;
  tweet: string | null;
  status: YoutubeStatus;
  buffer_update_id: string | null;
  scheduled_at: Date | null;
  posted_at: Date | null;
  error: string | null;
  created_at: Date;
  updated_at: Date;
};

/** Catat video baru (status processing). Null jika video_id sudah ada (dedup). */
export async function insertProcessing(videoId: string, url: string): Promise<YoutubeRow | null> {
  const rows = await sql`
    INSERT INTO youtube_posts (video_id, url, status)
    VALUES (${videoId}, ${url}, 'processing')
    ON CONFLICT (video_id) DO NOTHING
    RETURNING *`;
  return (rows[0] as YoutubeRow) ?? null;
}

/** Update sebagian kolom konten (transcript/paragraph/image_prompt/image_url/tweet). */
export async function patch(id: number, fields: Record<string, unknown>): Promise<void> {
  await sql`UPDATE youtube_posts SET ${sql(fields)}, updated_at = now() WHERE id = ${id}`;
}

export async function markQueued(
  id: number,
  bufferUpdateId: string,
  scheduledAt: Date | null = null,
): Promise<void> {
  await sql`
    UPDATE youtube_posts
    SET status = 'queued', buffer_update_id = ${bufferUpdateId},
        scheduled_at = ${scheduledAt}, error = NULL, updated_at = now()
    WHERE id = ${id}`;
}

export async function markPosted(id: number, postedAt: Date): Promise<void> {
  await sql`UPDATE youtube_posts SET status = 'posted', posted_at = ${postedAt}, updated_at = now() WHERE id = ${id}`;
}

/** Hapus baris agar video bisa diproses ulang setelah gagal. */
export async function remove(id: number): Promise<void> {
  await sql`DELETE FROM youtube_posts WHERE id = ${id}`;
}

export async function listQueued(): Promise<YoutubeRow[]> {
  return sql`SELECT * FROM youtube_posts WHERE status = 'queued' ORDER BY scheduled_at ASC NULLS LAST` as Promise<YoutubeRow[]>;
}

/** Hapus row yang nyangkut 'processing' (sisa crash) agar bisa diproses ulang. */
export async function clearStaleProcessing(): Promise<number> {
  const rows = await sql`DELETE FROM youtube_posts WHERE status = 'processing' RETURNING id`;
  return rows.length;
}

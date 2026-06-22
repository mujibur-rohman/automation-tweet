// Repository posts (alur baru): dedup by source_post_id, insert langsung sebagai queued.
import { sql } from "./client";
import type { MediaItem, NormalizedPost } from "../sources/threads";

export type PostStatus = "queued" | "posted" | "failed";

export type PostRow = {
  id: number;
  source_post_id: string;
  author_username: string;
  content: string;
  media_urls: MediaItem[];
  permalink: string;
  status: PostStatus;
  buffer_update_id: string | null;
  scheduled_at: Date | null;
  posted_at: Date | null;
  taken_at: Date | null;
  error: string | null;
  fetched_at: Date;
  updated_at: Date;
};

// Bun.sql mengembalikan kolom jsonb sebagai string -> parse.
function mapRow(row: any): PostRow {
  return {
    ...row,
    media_urls: typeof row.media_urls === "string" ? JSON.parse(row.media_urls) : (row.media_urls ?? []),
  } as PostRow;
}

/** Cek apakah post sudah ada di DB (untuk dedup). */
export async function existsBySourceId(sourcePostId: string): Promise<boolean> {
  const rows = await sql`SELECT 1 FROM posts WHERE source_post_id = ${sourcePostId} LIMIT 1`;
  return rows.length > 0;
}

/** Catat post yang sudah berhasil masuk antrian Buffer. */
export async function insertQueued(
  post: NormalizedPost,
  bufferUpdateId: string,
  scheduledAt: Date | null = null,
): Promise<PostRow> {
  const rows = await sql`
    INSERT INTO posts (source_post_id, author_username, content, media_urls, permalink, taken_at, status, buffer_update_id, scheduled_at)
    VALUES (
      ${post.sourcePostId}, ${post.authorUsername}, ${post.content},
      ${post.media}::jsonb, ${post.permalink}, ${post.takenAt},
      'queued', ${bufferUpdateId}, ${scheduledAt}
    )
    ON CONFLICT (source_post_id) DO UPDATE SET
      author_username = EXCLUDED.author_username,
      content = EXCLUDED.content,
      media_urls = EXCLUDED.media_urls,
      permalink = EXCLUDED.permalink,
      taken_at = EXCLUDED.taken_at,
      status = 'queued',
      buffer_update_id = EXCLUDED.buffer_update_id,
      scheduled_at = EXCLUDED.scheduled_at,
      updated_at = now()
    RETURNING *`;
  return mapRow(rows[0]);
}

export async function markPosted(id: number, postedAt: Date): Promise<void> {
  await sql`UPDATE posts SET status = 'posted', posted_at = ${postedAt}, updated_at = now() WHERE id = ${id}`;
}

export async function listQueued(): Promise<PostRow[]> {
  const rows = await sql`SELECT * FROM posts WHERE status = 'queued' ORDER BY scheduled_at ASC NULLS LAST`;
  return rows.map(mapRow);
}

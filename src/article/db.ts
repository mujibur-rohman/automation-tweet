// Repo article_posts (automation #3). Reuse koneksi sql bersama.
import { sql } from "../db/client";

export type ArticleRow = {
  id: number;
  url: string;
  article_text: string | null;
  tweet: string | null;
  status: "processing" | "queued" | "failed";
  buffer_update_id: string | null;
  scheduled_at: Date | null;
  error: string | null;
  created_at: Date;
  updated_at: Date;
};

/** Catat artikel baru (status processing). Null jika URL sudah ada (dedup). */
export async function insertProcessing(url: string, articleText: string): Promise<ArticleRow | null> {
  const rows = await sql`
    INSERT INTO article_posts (url, article_text, status)
    VALUES (${url}, ${articleText}, 'processing')
    ON CONFLICT (url) DO NOTHING
    RETURNING *`;
  return (rows[0] as ArticleRow) ?? null;
}

export async function patch(id: number, fields: Record<string, unknown>): Promise<void> {
  await sql`UPDATE article_posts SET ${sql(fields)}, updated_at = now() WHERE id = ${id}`;
}

export async function markQueued(id: number, bufferUpdateId: string, scheduledAt: Date | null = null): Promise<void> {
  await sql`
    UPDATE article_posts
    SET status = 'queued', buffer_update_id = ${bufferUpdateId},
        scheduled_at = ${scheduledAt}, error = NULL, updated_at = now()
    WHERE id = ${id}`;
}

/** Hapus row agar bisa diproses ulang setelah gagal. */
export async function remove(id: number): Promise<void> {
  await sql`DELETE FROM article_posts WHERE id = ${id}`;
}

/** Bersihkan row nyangkut 'processing' (sisa crash). */
export async function clearStaleProcessing(): Promise<number> {
  const rows = await sql`DELETE FROM article_posts WHERE status = 'processing' RETURNING id`;
  return rows.length;
}

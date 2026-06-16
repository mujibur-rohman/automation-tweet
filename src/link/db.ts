// Repo link_posts (automation #4). Reuse koneksi sql bersama.
import { sql } from "../db/client";

export async function insertProcessing(url: string): Promise<{ id: number } | null> {
  const rows = await sql`
    INSERT INTO link_posts (url, status) VALUES (${url}, 'processing')
    ON CONFLICT (url) DO NOTHING
    RETURNING id`;
  return (rows[0] as { id: number }) ?? null;
}

export async function patch(id: number, fields: Record<string, unknown>): Promise<void> {
  await sql`UPDATE link_posts SET ${sql(fields)}, updated_at = now() WHERE id = ${id}`;
}

export async function markQueued(id: number, bufferUpdateId: string, scheduledAt: Date | null = null): Promise<void> {
  await sql`
    UPDATE link_posts
    SET status = 'queued', buffer_update_id = ${bufferUpdateId},
        scheduled_at = ${scheduledAt}, error = NULL, updated_at = now()
    WHERE id = ${id}`;
}

export async function remove(id: number): Promise<void> {
  await sql`DELETE FROM link_posts WHERE id = ${id}`;
}

/** Bersihkan row nyangkut 'processing' (sisa crash). */
export async function clearStaleProcessing(): Promise<number> {
  const rows = await sql`DELETE FROM link_posts WHERE status = 'processing' RETURNING id`;
  return rows.length;
}

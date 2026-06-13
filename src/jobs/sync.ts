// SYNC: cek status post yang queued di Buffer; yang sudah terkirim -> tandai posted.
import { listQueued, markPosted } from "../db/posts.repo";
import { getPostStatus } from "../buffer/client";
import { sql } from "../db/client";

export async function runSync(): Promise<void> {
  const queued = await listQueued();
  for (const post of queued) {
    if (!post.buffer_update_id) continue;
    const primaryId = post.buffer_update_id.split(",")[0]!;
    try {
      const s = await getPostStatus(primaryId);
      if (s.status === "sent" || s.sentAt) {
        await markPosted(post.id, s.sentAt ? new Date(s.sentAt) : new Date());
        console.log(`[sync] post ${post.id} -> posted`);
      }
    } catch (err) {
      console.error(`[sync] post ${post.id} gagal cek status:`, err);
    }
  }
}

if (import.meta.main) {
  await runSync();
  await sql.end();
}

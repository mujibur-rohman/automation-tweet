// Intake: terima URL post Threads -> resolve -> dedup -> detail -> validasi media -> Buffer.
import { config } from "./config";
import {
  resolvePostIdFromUrl,
  fetchPostDetail,
  parseUrl,
  type MediaItem,
} from "./sources/threads";
import { existsBySourceId, insertQueued } from "./db/posts.repo";
import { createPost } from "./buffer/client";

const TWEET_LIMIT = 280;

/** Format post: "(isi)\n\nsc:(username)", dipangkas agar muat di Twitter. */
function composeText(content: string, username: string): string {
  const limit = TWEET_LIMIT;
  const body =
    content.length > limit
      ? content.slice(0, limit - 1).trimEnd() + "…"
      : content;
  return body.trim();
}

/**
 * Sesuaikan media ke aturan Twitter:
 * - Ada video   -> ambil 1 video pertama (gambar & video lain diabaikan).
 * - Tanpa video -> ambil maks 4 gambar pertama.
 */
function normalizeMediaForTwitter(media: MediaItem[]): MediaItem[] {
  const video = media.find((m) => m.type === "video");
  if (video) return [video];
  return media.filter((m) => m.type === "image").slice(0, 4);
}

/** Proses satu URL. Mengembalikan teks balasan untuk Telegram. */
export async function handleUrl(url: string): Promise<string> {
  const postId = await resolvePostIdFromUrl(url);

  if (await existsBySourceId(postId)) {
    return "⚠️ Ditolak — post ini sudah pernah diproses (ada di database).";
  }

  const { username, shortcode } = parseUrl(url);
  const post = await fetchPostDetail({
    postId,
    shortcode: shortcode ?? "",
    username: username ?? "",
  });
  post.sourcePostId = postId; // kunci dedup kanonik dari get-id

  // Sesuaikan media ke aturan Twitter; simpan media final ke DB.
  const sourceCount = post.media.length;
  const media = normalizeMediaForTwitter(post.media);
  post.media = media;
  const dropped = sourceCount - media.length;

  const text = composeText(post.content, post.authorUsername);
  const updateIds: string[] = [];
  try {
    for (const channelId of config.buffer.profileIds) {
      const r = await createPost({ channelId, text, media });
      updateIds.push(r.postId);
    }
  } catch (err) {
    // "batalkan & lapor error": tidak dicatat ke DB, bisa di-retry.
    return `❌ Dibatalkan — gagal masuk Buffer: ${(err as Error).message}`;
  }

  await insertQueued(post, updateIds.join(","));
  const mediaInfo = media.length
    ? `${media.length} media (${media.map((m) => m.type).join(", ")})`
    : "tanpa media";
  const droppedInfo =
    dropped > 0 ? `\n(${dropped} media lain diabaikan utk aturan Twitter)` : "";
  return `✅ Masuk antrian Buffer.\n@${post.authorUsername} · ${mediaInfo}${droppedInfo}`;
}

// CLI uji: `bun run src/intake.ts <url>`
if (import.meta.main) {
  const url = process.argv[2];
  if (!url) {
    console.error("Pemakaian: bun run src/intake.ts <url-threads>");
    process.exit(1);
  }
  console.log(await handleUrl(url));
  const { sql } = await import("./db/client");
  await sql.end();
}

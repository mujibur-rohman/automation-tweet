// Pipeline konten: teks (+ URL opsional di akhir) -> tweet -> Telegram + Buffer.
import { config, type Lang } from "../config";
import { insertProcessing, patch, markQueued, remove } from "./db";
import { writeArticleTweet } from "../youtube/ai";
import { sendText } from "../youtube/telegram";
import { createPost } from "../buffer/client";

const MIN_TEXT_CHARS = 50;

/** articleUrl = link sumber bila URL ada di akhir pesan; null bila tak ada (cuma teks). */
export async function handleArticle(
  fullText: string,
  articleUrl: string | null,
  lang: Lang = "id",
): Promise<string> {
  // Buang URL sumber dari teks (biar AI tak echo link). URL lain di tengah dibiarkan.
  const text = (articleUrl ? fullText.replace(articleUrl, "") : fullText).trim();
  if (text.length < MIN_TEXT_CHARS) {
    return "❌ Kirim teksnya juga (minimal beberapa kalimat), bukan cuma link.";
  }

  // Dedup: pakai URL sumber kalau ada; kalau tidak, pakai hash teks.
  const dedupKey = articleUrl ?? `txt:${Bun.hash(text).toString(36)}`;
  const row = await insertProcessing(dedupKey, text);
  if (!row) return "⚠️ Ditolak — konten ini sudah pernah diproses.";

  // 1) Buat tweet + kirim ke Telegram.
  let out: string;
  try {
    const tweet = (await writeArticleTweet(text, lang)).trim();
    await patch(row.id, { tweet });
    out = articleUrl ? `${tweet}\n\n${articleUrl}` : tweet;
    await sendText(out);
  } catch (err) {
    await remove(row.id); // hapus agar bisa diproses ulang
    return `❌ Gagal: ${(err as Error).message}`;
  }

  // 2) Buffer (best-effort) — kalau gagal (limit), Telegram tetap terkirim.
  try {
    const r = await createPost({ channelId: config.youtube.bufferChannelId, text: out });
    await markQueued(row.id, r.postId, r.dueAt ? new Date(r.dueAt) : null);
    return "✅ Tweet terkirim ke Telegram + masuk antrian Buffer (abangantech).";
  } catch (err) {
    await patch(row.id, { status: "failed", error: (err as Error).message });
    return `✅ Tweet terkirim ke Telegram.\n⚠️ Buffer gagal: ${(err as Error).message}`;
  }
}

// Pipeline konten: teks (+ URL opsional di akhir) -> tweet respons+insight -> Telegram.
import { insertProcessing, patch, remove } from "./db";
import { writeArticleTweet } from "../youtube/ai";
import { sendText } from "../youtube/telegram";

const MIN_TEXT_CHARS = 50;

/** articleUrl = link sumber bila URL ada di akhir pesan; null bila tak ada (cuma teks). */
export async function handleArticle(fullText: string, articleUrl: string | null): Promise<string> {
  // Buang URL sumber dari teks (biar AI tak echo link). URL lain di tengah dibiarkan.
  const text = (articleUrl ? fullText.replace(articleUrl, "") : fullText).trim();
  if (text.length < MIN_TEXT_CHARS) {
    return "❌ Kirim teksnya juga (minimal beberapa kalimat), bukan cuma link.";
  }

  // Dedup: pakai URL sumber kalau ada; kalau tidak, pakai hash teks.
  const dedupKey = articleUrl ?? `txt:${Bun.hash(text).toString(36)}`;
  const row = await insertProcessing(dedupKey, text);
  if (!row) return "⚠️ Ditolak — konten ini sudah pernah diproses.";

  try {
    const tweet = (await writeArticleTweet(text)).trim();
    await patch(row.id, { tweet });

    const out = articleUrl ? `${tweet}\n\n${articleUrl}` : tweet;
    await sendText(out);
    await patch(row.id, { status: "sent" });
    return articleUrl ? "✅ Tweet terkirim ke Telegram (dengan link sumber)." : "✅ Tweet terkirim ke Telegram.";
  } catch (err) {
    await remove(row.id); // hapus agar bisa diproses ulang
    return `❌ Gagal: ${(err as Error).message}`;
  }
}

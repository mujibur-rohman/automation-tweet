// Pipeline konten (teks + URL) -> tweet respons+insight -> kirim ke Telegram.
import { insertProcessing, patch, remove } from "./db";
import { writeArticleTweet } from "../youtube/ai";
import { sendText } from "../youtube/telegram";

const MIN_TEXT_CHARS = 50;

export async function handleArticle(fullText: string, articleUrl: string): Promise<string> {
  // Teks tanpa URL-nya (biar AI tidak echo link).
  const articleText = fullText.replace(articleUrl, "").trim();
  if (articleText.length < MIN_TEXT_CHARS) {
    return "❌ Kirim teksnya juga (bukan cuma link).";
  }

  const row = await insertProcessing(articleUrl, articleText);
  if (!row) return "⚠️ Ditolak — sumber ini (URL) sudah pernah diproses.";

  try {
    const tweet = (await writeArticleTweet(articleText)).trim();
    await patch(row.id, { tweet });
    const text = `${tweet}\n\n${articleUrl}`;

    await sendText(text);
    await patch(row.id, { status: "sent" });
    return "✅ Tweet terkirim ke Telegram.";
  } catch (err) {
    await remove(row.id); // hapus agar bisa diproses ulang
    return `❌ Gagal: ${(err as Error).message}`;
  }
}

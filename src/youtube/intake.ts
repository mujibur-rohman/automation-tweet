// Pipeline YouTube: URL -> transcript -> AI narasi -> AI prompt image -> AI tweet
// -> kirim tweet + prompt image ke Telegram. (Tanpa generate image, tanpa Buffer.)
import { parseVideoId, fetchTranscript } from "./transcript";
import { insertProcessing, patch, remove } from "./db";
import { summarizeParagraph, buildImagePrompt, writeTweet } from "./ai";
import { sendResult } from "./telegram";

export async function handleYoutubeUrl(url: string): Promise<string> {
  const videoId = parseVideoId(url);
  if (!videoId) return "❌ URL YouTube tidak valid.";

  const row = await insertProcessing(videoId, url);
  if (!row) return "⚠️ Ditolak — video ini sudah pernah diproses (ada di database).";

  // 1) Pipeline konten (transcript -> narasi -> prompt image -> tweet).
  let imagePrompt: string;
  let tweet: string;
  try {
    const transcript = await fetchTranscript(videoId);
    await patch(row.id, { transcript });

    const paragraph = await summarizeParagraph(transcript);
    await patch(row.id, { paragraph });

    imagePrompt = await buildImagePrompt(paragraph);
    await patch(row.id, { image_prompt: imagePrompt });

    tweet = (await writeTweet(paragraph)).trim();
    await patch(row.id, { tweet });
  } catch (err) {
    await remove(row.id); // hapus agar bisa diproses ulang
    return `❌ Gagal proses: ${(err as Error).message}`;
  }

  // 2) Kirim tweet + prompt image ke Telegram.
  try {
    await sendResult(tweet, imagePrompt);
  } catch (err) {
    await remove(row.id);
    return `❌ Gagal kirim ke Telegram: ${(err as Error).message}`;
  }

  await patch(row.id, { status: "sent" });
  return "✅ Tweet + prompt image terkirim ke Telegram.";
}

// CLI uji: `bun run src/youtube/intake.ts <url-youtube>`
if (import.meta.main) {
  const url = process.argv[2];
  if (!url) {
    console.error("Pemakaian: bun run src/youtube/intake.ts <url-youtube>");
    process.exit(1);
  }
  console.log(await handleYoutubeUrl(url));
  const { sql } = await import("../db/client");
  await sql.end();
}

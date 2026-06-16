// Pipeline YouTube: URL -> transcript -> narasi -> tweet (+ gambar 16:9 best-effort)
// -> kirim ke Telegram (foto kalau ada gambar, teks kalau tidak) + antrian Buffer.
import { config, type Lang } from "../config";
import { parseVideoId, fetchTranscript } from "./transcript";
import { insertProcessing, patch, markQueued, remove } from "./db";
import { summarizeParagraph, buildImagePrompt, writeTweet } from "./ai";
import { generateImage } from "./image";
import { sendPhoto, sendText } from "./telegram";
import { createPost } from "../buffer/client";

export async function handleYoutubeUrl(url: string, lang: Lang = "id"): Promise<string> {
  const videoId = parseVideoId(url);
  if (!videoId) return "❌ URL YouTube tidak valid.";

  const row = await insertProcessing(videoId, url);
  if (!row) return "⚠️ Ditolak — video ini sudah pernah diproses (ada di database).";

  // 1) Konten + narasi + tweet (fatal kalau gagal). Gambar best-effort.
  let tweet: string;
  let imageUrl: string | null = null;
  try {
    const transcript = await fetchTranscript(videoId);
    await patch(row.id, { transcript });

    const paragraph = await summarizeParagraph(transcript, lang);
    await patch(row.id, { paragraph });

    tweet = (await writeTweet(paragraph, lang)).trim();
    await patch(row.id, { tweet });

    // Gambar best-effort: kalau gagal (mis. kredit habis 402), lanjut tanpa gambar.
    try {
      const imagePrompt = await buildImagePrompt(paragraph, lang);
      await patch(row.id, { image_prompt: imagePrompt });
      imageUrl = await generateImage(imagePrompt, { aspectRatio: config.youtube.imageAspectRatio });
      await patch(row.id, { image_url: imageUrl });
    } catch (err) {
      console.warn(`[youtube] gambar gagal, lanjut tanpa gambar: ${(err as Error).message}`);
    }
  } catch (err) {
    await remove(row.id); // hapus agar bisa diproses ulang
    return `❌ Gagal proses: ${(err as Error).message}`;
  }

  // 2) Kirim ke Telegram: foto+tweet kalau ada gambar, teks saja kalau tidak.
  try {
    if (imageUrl) await sendPhoto(imageUrl, tweet);
    else await sendText(tweet);
  } catch (err) {
    await remove(row.id);
    return `❌ Gagal kirim ke Telegram: ${(err as Error).message}`;
  }

  // 3) Buffer (best-effort) — lampirkan gambar kalau ada.
  const noImg = imageUrl ? "" : " (tanpa gambar — generate image gagal)";
  try {
    const r = await createPost({
      channelId: config.youtube.bufferChannelId,
      text: tweet,
      media: imageUrl ? [{ type: "image", url: imageUrl }] : undefined,
    });
    await markQueued(row.id, r.postId, r.dueAt ? new Date(r.dueAt) : null);
    return `✅ Terkirim ke Telegram + antrian Buffer (abangantech)${noImg}.`;
  } catch (err) {
    await patch(row.id, { status: "failed", error: (err as Error).message });
    return `✅ Terkirim ke Telegram${noImg}.\n⚠️ Buffer gagal: ${(err as Error).message}`;
  }
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

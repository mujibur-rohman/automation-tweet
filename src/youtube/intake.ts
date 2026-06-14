// Pipeline YouTube: URL -> transcript -> narasi -> prompt image -> generate image (16:9)
// -> tweet -> kirim foto+tweet ke Telegram + antrian Buffer (image sebagai lampiran).
import { config } from "../config";
import { parseVideoId, fetchTranscript } from "./transcript";
import { insertProcessing, patch, markQueued, remove } from "./db";
import { summarizeParagraph, buildImagePrompt, writeTweet } from "./ai";
import { generateImage } from "./image";
import { sendPhoto } from "./telegram";
import { createPost } from "../buffer/client";

export async function handleYoutubeUrl(url: string): Promise<string> {
  const videoId = parseVideoId(url);
  if (!videoId) return "❌ URL YouTube tidak valid.";

  const row = await insertProcessing(videoId, url);
  if (!row) return "⚠️ Ditolak — video ini sudah pernah diproses (ada di database).";

  // 1) Pipeline konten: transcript -> narasi -> prompt image -> generate image -> tweet.
  let imageUrl: string;
  let tweet: string;
  try {
    const transcript = await fetchTranscript(videoId);
    await patch(row.id, { transcript });

    const paragraph = await summarizeParagraph(transcript);
    await patch(row.id, { paragraph });

    const imagePrompt = await buildImagePrompt(paragraph);
    await patch(row.id, { image_prompt: imagePrompt });

    imageUrl = await generateImage(imagePrompt, { aspectRatio: config.youtube.imageAspectRatio });
    await patch(row.id, { image_url: imageUrl });

    tweet = (await writeTweet(paragraph)).trim();
    await patch(row.id, { tweet });
  } catch (err) {
    await remove(row.id); // hapus agar bisa diproses ulang
    return `❌ Gagal proses: ${(err as Error).message}`;
  }

  // 2) Kirim foto + tweet ke Telegram.
  try {
    await sendPhoto(imageUrl, tweet);
  } catch (err) {
    await remove(row.id);
    return `❌ Gagal kirim ke Telegram: ${(err as Error).message}`;
  }

  // 3) Buffer (best-effort) — tweet + image sebagai lampiran.
  try {
    const r = await createPost({
      channelId: config.youtube.bufferChannelId,
      text: tweet,
      media: [{ type: "image", url: imageUrl }],
    });
    await markQueued(row.id, r.postId, r.dueAt ? new Date(r.dueAt) : null);
    return "✅ Terkirim ke Telegram + masuk antrian Buffer (abangantech) dengan gambar.";
  } catch (err) {
    await patch(row.id, { status: "failed", error: (err as Error).message });
    return `✅ Terkirim ke Telegram.\n⚠️ Buffer gagal: ${(err as Error).message}`;
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

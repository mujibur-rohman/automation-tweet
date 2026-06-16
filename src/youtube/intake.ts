// Pipeline YouTube: URL -> transcript -> narasi -> tweet (+ gambar 16:9 best-effort).
// Gambar sukses -> foto+tweet ke Telegram + antrian Buffer.
// Gambar gagal  -> tweet + prompt image ke Telegram, TIDAK masuk Buffer.
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

  // 1) Konten + narasi + tweet (fatal). Gambar best-effort.
  let tweet: string;
  let imagePrompt: string | null = null;
  let imageUrl: string | null = null;
  try {
    const transcript = await fetchTranscript(videoId);
    await patch(row.id, { transcript });

    const paragraph = await summarizeParagraph(transcript, lang);
    await patch(row.id, { paragraph });

    tweet = (await writeTweet(paragraph, lang)).trim();
    await patch(row.id, { tweet });

    try {
      imagePrompt = await buildImagePrompt(paragraph, lang);
      await patch(row.id, { image_prompt: imagePrompt });
      imageUrl = await generateImage(imagePrompt, { aspectRatio: config.youtube.imageAspectRatio });
      await patch(row.id, { image_url: imageUrl });
    } catch (err) {
      console.warn(`[youtube] gambar gagal, lanjut tanpa gambar: ${(err as Error).message}`);
    }
  } catch (err) {
    await remove(row.id);
    return `❌ Gagal proses: ${(err as Error).message}`;
  }

  return deliver(row.id, { tweet, imagePrompt, imageUrl, patch, markQueued, remove });
}

/** Kirim hasil: ada gambar -> Telegram(foto)+Buffer; tanpa gambar -> Telegram(tweet+prompt), no Buffer. */
export async function deliver(
  id: number,
  o: {
    tweet: string;
    imagePrompt: string | null;
    imageUrl: string | null;
    patch: (id: number, f: Record<string, unknown>) => Promise<void>;
    markQueued: (id: number, bid: string, at?: Date | null) => Promise<void>;
    remove: (id: number) => Promise<void>;
  },
): Promise<string> {
  // Tanpa gambar -> tweet + prompt ke Telegram, tidak ke Buffer.
  if (!o.imageUrl) {
    try {
      await sendText(o.tweet);
      if (o.imagePrompt) await sendText(`🖼️ IMAGE PROMPT:\n\n${o.imagePrompt}`);
    } catch (err) {
      await o.remove(id);
      return `❌ Gagal kirim ke Telegram: ${(err as Error).message}`;
    }
    await o.patch(id, { status: "sent" });
    return "✅ Tweet + prompt image terkirim ke Telegram (gambar gagal, tidak masuk Buffer).";
  }

  // Ada gambar -> foto+tweet ke Telegram.
  try {
    await sendPhoto(o.imageUrl, o.tweet);
  } catch (err) {
    await o.remove(id);
    return `❌ Gagal kirim ke Telegram: ${(err as Error).message}`;
  }

  // Buffer best-effort (dengan gambar).
  try {
    const r = await createPost({
      channelId: config.youtube.bufferChannelId,
      text: o.tweet,
      media: [{ type: "image", url: o.imageUrl }],
    });
    await o.markQueued(id, r.postId, r.dueAt ? new Date(r.dueAt) : null);
    return "✅ Terkirim ke Telegram + antrian Buffer (abangantech) dengan gambar.";
  } catch (err) {
    await o.patch(id, { status: "failed", error: (err as Error).message });
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

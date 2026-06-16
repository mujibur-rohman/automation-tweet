// Pipeline link: URL apa pun -> scrape -> narasi -> tweet (+ gambar 16:9 best-effort).
// Gambar sukses -> foto+tweet ke Telegram + Buffer. Gambar gagal -> tweet+prompt ke Telegram (no Buffer).
import { config, type Lang } from "../config";
import { scrapeArticle } from "./scrape";
import { insertProcessing, patch, markQueued, remove } from "./db";
import { summarizeParagraph, buildImagePrompt, writeTweet } from "../youtube/ai";
import { generateImage } from "../youtube/image";
import { deliver } from "../youtube/intake";

export async function handleLink(url: string, lang: Lang = "id"): Promise<string> {
  const row = await insertProcessing(url);
  if (!row) return "⚠️ Ditolak — link ini sudah pernah diproses.";

  // 1) Scrape + narasi + tweet (fatal). Gambar best-effort.
  let tweet: string;
  let imagePrompt: string | null = null;
  let imageUrl: string | null = null;
  try {
    const content = await scrapeArticle(url);
    await patch(row.id, { content });

    const paragraph = await summarizeParagraph(content, lang);
    await patch(row.id, { paragraph });

    tweet = (await writeTweet(paragraph, lang)).trim();
    await patch(row.id, { tweet });

    try {
      imagePrompt = await buildImagePrompt(paragraph, lang);
      await patch(row.id, { image_prompt: imagePrompt });
      imageUrl = await generateImage(imagePrompt, { aspectRatio: config.youtube.imageAspectRatio });
      await patch(row.id, { image_url: imageUrl });
    } catch (err) {
      console.warn(`[link] gambar gagal, lanjut tanpa gambar: ${(err as Error).message}`);
    }
  } catch (err) {
    await remove(row.id);
    return `❌ Gagal proses: ${(err as Error).message}`;
  }

  return deliver(row.id, { tweet, imagePrompt, imageUrl, patch, markQueued, remove });
}

// Scrape isi artikel dari URL apa pun (Readability + fallback <p>).
import { parseHTML } from "linkedom";
import { Readability } from "@mozilla/readability";

export class ScrapeError extends Error {}

export type ScrapeResult = { text: string; imageUrl: string | null };

/** Ambil gambar utama artikel: og:image / twitter:image / gambar pertama di <article>. */
function extractImage(document: any, baseUrl: string): string | null {
  const pick = (sel: string, attr: string) =>
    document.querySelector(sel)?.getAttribute(attr)?.trim() || null;
  let img =
    pick('meta[property="og:image"]', "content") ||
    pick('meta[property="og:image:url"]', "content") ||
    pick('meta[name="twitter:image"]', "content") ||
    pick('meta[name="twitter:image:src"]', "content") ||
    pick("article img", "src") ||
    pick("img", "src");
  if (!img) return null;
  try {
    return new URL(img, baseUrl).toString(); // jadikan absolut
  } catch {
    return img.startsWith("http") ? img : null;
  }
}

export async function scrapeArticle(url: string): Promise<ScrapeResult> {
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { "user-agent": "Mozilla/5.0 (compatible; AutomationBot/1.0)" },
      signal: AbortSignal.timeout(25000),
    });
  } catch (err) {
    throw new ScrapeError(`Gagal fetch URL: ${(err as Error).message}`);
  }
  if (!res.ok) throw new ScrapeError(`Gagal fetch URL (HTTP ${res.status})`);

  const html = await res.text();
  const { document } = parseHTML(html);
  const imageUrl = extractImage(document, url);

  // Utama: Readability (ekstraksi artikel cerdas).
  let text = "";
  try {
    const article = new Readability(document as any).parse();
    text = (article?.textContent ?? "").replace(/\s+/g, " ").trim();
  } catch {
    // abaikan, lanjut fallback
  }

  // Fallback: kumpulkan semua <p>.
  if (text.length < 200) {
    const ps = [...document.querySelectorAll("p")]
      .map((p: any) => p.textContent ?? "")
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    if (ps.length > text.length) text = ps;
  }

  if (text.length < 100) {
    throw new ScrapeError("Konten artikel tidak ditemukan / terlalu pendek (mungkin situs full-JS).");
  }
  return { text, imageUrl };
}

// Scrape isi artikel dari URL apa pun (Readability + fallback <p>).
import { parseHTML } from "linkedom";
import { Readability } from "@mozilla/readability";

export class ScrapeError extends Error {}

export async function scrapeArticle(url: string): Promise<string> {
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
  return text;
}

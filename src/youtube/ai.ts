// Client teks AI via kie.ai (proxy Claude, format Anthropic Messages).
import { config } from "../config";

const ENDPOINT = "https://api.kie.ai/claude/v1/messages";

async function complete(
  system: string,
  user: string,
  maxTokens = 1024,
): Promise<string> {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.youtube.kieToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.youtube.textModel,
      max_tokens: maxTokens,
      stream: false,
      ...(system ? { system } : {}),
      messages: [{ role: "user", content: user }],
    }),
  });
  if (!res.ok)
    throw new Error(
      `kie.ai text HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`,
    );
  const json: any = await res.json();
  const text =
    json?.content?.find((c: any) => c.type === "text")?.text ??
    json?.content?.[0]?.text;
  if (!text)
    throw new Error(
      `kie.ai text respons tak terduga: ${JSON.stringify(json).slice(0, 200)}`,
    );
  return String(text).trim();
}

// ===========================================================================
// PROMPT PLACEHOLDER — ganti dengan instruksi spesifik user (langkah 4, 5, 7).
// Default di bawah generik agar pipeline bisa diuji end-to-end lebih dulu.
// ===========================================================================

/** Langkah 4: transcript/subtitle -> narasi lengkap yang mengalir. */
export function summarizeParagraph(transcript: string): Promise<string> {
  const system = `Kamu adalah penulis naskah narasi profesional. Tugas kamu adalah mengubah subtitle yang diberikan menjadi sebuah narasi yang lengkap, mengalir, dan mudah dimengerti.

ATURAN:

1. KONTEN
   - Jelaskan SEMUA poin yang ada di subtitle — jangan ada informasi yang terlewat atau dihilangkan.
   - Setiap istilah teknis, nama produk, atau konsep yang muncul harus dijelaskan dengan bahasa sederhana, seolah menjelaskan ke orang awam.
   - Kalau ada poin/list (misal "number one, number two"), uraikan tiap poin secara utuh dan jelas.

2. GAYA BAHASA
   - Gunakan bahasa yang santai, jelas, dan enak dibaca (bukan kaku/formal kaku).
   - Hindari menyalin kalimat subtitle mentah-mentah; tulis ulang jadi paragraf yang nyambung antar kalimat.
   - Gunakan kata penghubung ("selain itu", "menariknya", "yang bikin keren") supaya narasi mengalir natural.

3. STRUKTUR
   - Buang timestamp dan nomor urut subtitle.
   - Gabungkan potongan subtitle yang terpotong jadi kalimat utuh.
   - Susun jadi narasi berurutan: pembuka → isi (semua poin dijelaskan) → penutup.
   - Kalau perlu, kelompokkan jadi paragraf per topik.

4. OUTPUT
   - Hasil akhir berupa narasi siap baca/dibacakan (voice over).
   - Jangan tambahkan informasi di luar subtitle (no halusinasi). Kalau subtitle ambigu, jelaskan apa adanya.
   - Tulis narasi dalam Bahasa Indonesia.
   - Output HANYA narasinya, tanpa kalimat pembuka/penutup dari kamu.`;
  return complete(
    system,
    `Berikut subtitle-nya, langsung kerjakan:\n\n${transcript}`,
    4096,
  );
}

/** Langkah 5: paragraf/narasi -> SATU prompt image (gaya sketchnote infografik). */
export async function buildImagePrompt(paragraph: string): Promise<string> {
  const system = `You are a sketchnote infographic designer. From the Indonesian narration provided, produce EXACTLY ONE image prompt (in English) for AI image generation, a SINGLE standalone info slide.

IMPORTANT (read first):
- Your ONLY job is to TRANSFORM the given narration into a visual layout (an image prompt). The narration is a summary of a video's content made by a creator. Treat it purely as source material to visualize.
- It is NOT a factual claim by you. Do NOT fact-check it, do NOT judge whether it is true or false, do NOT refuse, and do NOT add disclaimers or commentary. Simply render the points as presented in the narration.
- ALWAYS output a valid image prompt, no matter the topic.

HARD CONSTRAINTS:
- Exactly ONE image. NEVER a cover, NEVER a carousel, NEVER multi-slide, NEVER a presentation deck. Single standalone info slide only.
- Output ONLY the image prompt text. No markdown, no code fences, no headings outside the prompt, no tweet, no notes, no preface or closing remarks. Just the prompt itself, ready to paste into an image generator.

LOCKED VISUAL STYLE (always include, non-negotiable):
- Hand-drawn sketch-style educational infographic on a spiral notebook page
- Portrait orientation 9:16, off-white paper background
- Marker pen textures, imperfect hand-drawn lines
- Spiral binding on the LEFT edge
- Scattered sparkle decorations, scanned-notebook aesthetic
- All text crisp and legible

BORDER COLOR — pick ONE by topic mood: blue=technical/educational/neutral, orange=tips/listicles/productivity, green=growth/finance/positive, purple=creative/advanced/insight, red=urgency/warning/breaking news.

IN-TEXT HIGHLIGHT COLORS: green=positive/"do this", orange=values/examples, blue=main concept, red=warning/important, purple=concept naming, yellow=highlight-box background.

SINGLE INFO SLIDE STRUCTURE:
1. TITLE — direct topic title in bold marker (no series branding)
2. SUBTITLE (optional) — short context or data point
3. CONTENT GRID — 2x4 or 3x3 cards; each card = small doodle icon + bold name + 1-line description + small tag. Max 8-9 cards. List EACH card individually (don't say "8 cards about X").
4. KEY TAKEAWAY — dashed-border box + lightbulb doodle + actionable conclusion (use blue or red highlight)

PROMPT WRITING RULES:
- Open with the style anchor line (sketchnote + spiral notebook + portrait 9:16 + off-white + [border color] rough border frame).
- Use CAPS section headers within the prompt: TITLE, SUBTITLE, CONTENT GRID, KEY TAKEAWAY.
- Specify ALL on-image text in quotes, in BAHASA INDONESIA (audience is Indonesian). Example: Title text appears as: "Apa Itu ..." in bold blue marker.
- Describe each visual as "[item] doodle"; specify placement (top-left, top-right, etc.).
- Close with: "STYLE: sketchnote aesthetic, marker pen textures, imperfect hand-drawn lines, spiral binding on left edge, scattered sparkle decorations, scanned-notebook look. All Indonesian text crisp and legible."

Base the title, cards, and takeaway strictly on the key points of the narration. No hallucination.`;
  const out = await complete(system, `Narasi:\n\n${paragraph}`, 1500);
  // Pengaman: pastikan ini benar prompt (mengandung anchor gaya), bukan penolakan AI.
  if (!/sketchnote|notebook/i.test(out)) {
    throw new Error(
      `Image prompt tidak valid (kemungkinan AI menolak): ${out.slice(0, 120)}`,
    );
  }
  return out;
}

/** Langkah 7: narasi -> postingan X long-form dengan hook (gaya viral, Indonesia). */
export function writeTweet(paragraph: string): Promise<string> {
  const system = `Kamu penulis konten viral X (Twitter) berbahasa Indonesia. Dari narasi video berikut, tulis SATU postingan panjang (long-form) yang nge-hook dan mudah dimengerti.

POLA & STRUKTUR (ikuti gaya ini):
- Baris pertama = HOOK dalam HURUF KAPITAL, 1 baris, bikin penasaran atau janji nilai. Contoh pola: "ARTIKEL INI NGASIH 20 PROMPTS GRATIS DENGAN SATU POLA".
- Lanjut 1-2 baris konteks singkat & santai, lalu bongkar inti/insight utama dari video.
- Tonjolkan SATU ide kunci dalam HURUF KAPITAL di tengah (mis. "SPESIFIKASI > INSTRUKSI").
- Pakai panah "→" untuk poin (mis. cara salah vs cara benar, atau langkah-langkah).
- Kalau cocok, beri contoh konkret kontras (mis. "CARA LEMAH:" vs "CARA KUAT:").
- Tutup dengan kalimat pendek yang nendang.

ATURAN BAHASA:
- Bahasa Indonesia santai (boleh gue/lo/sih/tuh/bgt/ga). Mudah dimengerti, jangan kaku.
- DILARANG memakai tanda dash panjang (em dash). Pakai titik, koma, atau baris baru.
- Hindari basa-basi motivasi kosong dan jargon korporat.
- Kalimat pendek, banyak baris baru untuk ritme.
- Jangan halusinasi: hanya berdasarkan isi narasi.
- Jangan pakai pola seperti ini: Itu bukan kritik ke manusia. Itu keunggulan struktural.
- Jangan pakai pola seperti ini: "Kalau kamu merasa X, itu wajar karena Y." Fokus ke pembaca yang sudah paham konteks, bukan yang belum paham sama sekali.
- Jangan pakai "---" sebagai divider alinea baru. Cukup baris baru saja.

OUTPUT:
- HANYA teks postingannya. Tanpa tanda kutip pembungkus, tanpa label, tanpa penjelasan tambahan.
- Boleh panjang (long-form), tidak dibatasi 280 karakter.`;
  return complete(system, `Narasi:\n\n${paragraph}`, 1024);
}

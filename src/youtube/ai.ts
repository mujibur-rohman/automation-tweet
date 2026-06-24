// Client teks AI via kie.ai (proxy Claude, format Anthropic Messages).
import { config, type Lang } from "../config";

/** Directive bahasa output untuk prompt prosa (narasi/tweet). */
function outputLang(lang: Lang): string {
  return lang === "en"
    ? "\n\nOUTPUT LANGUAGE: English. Write the ENTIRE output in natural, casual, conversational English. (Abaikan aturan slang Indonesia 'gue/lo' di atas; pakai gaya santai English.)"
    : "\n\nOUTPUT LANGUAGE: Bahasa Indonesia. Tulis SELURUH output dalam Bahasa Indonesia santai.";
}

/** Directive bahasa teks DI GAMBAR (prompt image tetap English). */
function onImageLang(lang: Lang): string {
  return lang === "en"
    ? '\n\nOVERRIDE BAHASA: Semua teks di dalam gambar (on-image text) HARUS Bahasa Inggris (abaikan instruksi "BAHASA INDONESIA" di atas). Tulis: All English text crisp and legible.'
    : "\n\nOVERRIDE BAHASA: Semua teks di dalam gambar (on-image text) HARUS Bahasa Indonesia.";
}

// kie.ai Gemini 2.5 Flash (format OpenAI chat completions).
const ENDPOINT = "https://api.kie.ai/gemini-2.5-flash/v1/chat/completions";

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
      stream: false,
      max_tokens: maxTokens,
      messages: [
        ...(system ? [{ role: "system", content: system }] : []),
        { role: "user", content: user },
      ],
    }),
  });
  if (!res.ok)
    throw new Error(
      `kie.ai gemini HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`,
    );
  const json: any = await res.json();
  const text = json?.choices?.[0]?.message?.content;
  if (!text)
    throw new Error(
      `kie.ai gemini respons tak terduga: ${JSON.stringify(json).slice(0, 200)}`,
    );
  return String(text).trim();
}

// Blok gaya "manusiawi" — port dari skill /humanizer (Wikipedia "Signs of AI writing").
// Ditempel ke prompt prosa (narasi & tweet) supaya tulisannya tidak terasa ditulis AI.
// (Tidak dipakai untuk prompt gambar.) Aturan berlaku untuk output ID maupun EN.
const HUMANIZER = `

GAYA MANUSIAWI (WAJIB — buang semua tanda tulisan AI. Ini berlaku ketat, bukan saran):

ISI & KLAIM
- Spesifik, bukan generik. Pakai angka, nama, contoh konkret, TAPI hanya yang ada di sumber; jangan mengarang fakta/angka.
- Jangan membesar-besarkan makna/legasi. Buang: "menandai momen penting", "jadi bukti nyata", "berperan krusial/vital", "membentuk lanskap", "babak baru", "titik balik", "mencerminkan tren yang lebih luas".
- Jangan promosi/iklan. Buang: "revolusioner", "game-changer", "cutting-edge", "mutakhir", "memberdayakan", "seamless", "unlock potensi", "luar biasa", "menakjubkan", "wajib dicoba".
- Atribusi jelas atau tidak sama sekali. Buang "para ahli bilang", "banyak yang berpendapat", "menurut laporan industri" tanpa sumber konkret.

BAHASA & TATA KALIMAT
- Buang kosakata khas AI: "delve/menyelami", "krusial", "pivotal", "menyoroti", "memperkaya", "interplay", "rumit/kompleksitas", "tapestry", "underscore", "selain itu (additionally)" yang ditumpuk.
- Pakai kata kerja "adalah/punya" langsung; jangan diganti "berfungsi sebagai", "berdiri sebagai", "menghadirkan", "menawarkan".
- Buang frasa -ing/penjelas palsu: "...yang menyoroti...", "...sehingga memastikan...", "...mencerminkan...", "...berkontribusi pada...".
- Jangan paralelisme negatif: "Bukan cuma X, tapi Y", "Ini bukan sekadar A, ini B." Tulis klaim langsung.
- Jangan paksa "aturan tiga" (tiga hal berjajar) cuma biar terdengar lengkap.
- Jangan ganti-ganti sinonim untuk subjek yang sama (elegant variation). Pakai satu istilah.
- Jangan "false range": "dari A sampai Z" kalau A dan Z bukan satu skala berarti.
- Kalimat aktif. Jangan buang subjek ("Hasil disimpan otomatis" -> "Sistem menyimpan hasil otomatis").

GAYA & FORMAT
- DILARANG dash panjang (— atau –). Pakai titik, koma, titik dua, kurung, atau baris baru.
- Tanpa markdown: tanpa **bold**, *italic*, # heading, backtick, atau "---" sebagai divider. Plain text.
- Tanpa emoji (kecuali diminta). Tanpa kutip melengkung ("" ''); pakai kutip lurus.

NADA & PEMBUKA
- Buang pembuka heboh/basa-basi: "Di era sekarang", "Menariknya", "Tau nggak sih", "Penting banget nih", "Jujur aja?", "Gini deh", "The thing is".
- Buang signposting: "mari kita bahas", "yuk kita bedah", "tanpa basa-basi", "ini yang perlu kamu tahu".
- Buang trope otoritas: "pertanyaan sebenarnya adalah", "pada intinya", "yang benar-benar penting", "secara fundamental".
- Buang aforisme template: "X adalah Y-nya Z", "X jadi jebakan", "bahasa dari...", "arsitektur dari...". Tulis klaim konkretnya.
- Jangan deretan kalimat pendek dramatis berturut-turut buat efek (staccato). Satu kalimat pendek penekanan boleh; serentetan jangan.
- Buang hedging: "mungkin", "bisa jadi", "sepertinya", "kurang lebih", "agak". Dan kata pengisi: "sangat", "benar-benar", "sebenarnya", "cukup".
- Buang penutup positif generik: "masa depan cerah", "semoga bermanfaat", "langkah ke arah yang benar". Tutup dengan klaim/fakta konkret.

PUNYA SUARA (jangan steril)
- Ritme bervariasi: campur kalimat pendek dan panjang, jangan semua selevel.
- Boleh punya opini/sudut pandang yang bisa dipertahankan, bukan cuma melaporkan netral.

TES: kalau kalimat bisa muncul di blog perusahaan mana pun, bikin lebih spesifik. Kalau tidak akan kamu ucapkan ke teman, jangan tulis. Sebelum selesai, scan ulang: ada dash panjang? markdown? kosakata AI di atas? Kalau ada, perbaiki dulu.`;

/** Bersihkan output: hapus emphasis markdown (**bold**, *italic*) & em/en dash (— –). */
function stripMarkdown(s: string): string {
  return s
    .replace(/\*\*(.*?)\*\*/gs, "$1")
    .replace(/\*(.+?)\*/gs, "$1")
    .replace(/\*+/g, "")
    .replace(/\s*[—–]\s*/g, ", ") // em/en dash -> koma (gaya tanpa dash panjang)
    .replace(/,\s*,/g, ",")
    .trim();
}

// ===========================================================================
// PROMPT PLACEHOLDER — ganti dengan instruksi spesifik user (langkah 4, 5, 7).
// Default di bawah generik agar pipeline bisa diuji end-to-end lebih dulu.
// ===========================================================================

/** Langkah 4: transcript/subtitle -> narasi lengkap yang mengalir. */
export function summarizeParagraph(transcript: string, lang: Lang): Promise<string> {
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
    system + HUMANIZER + outputLang(lang),
    `Berikut subtitle-nya, langsung kerjakan:\n\n${transcript}`,
    4096,
  );
}

/** Langkah 5: paragraf/narasi -> SATU prompt image (gaya sketchnote infografik). */
export async function buildImagePrompt(paragraph: string, lang: Lang): Promise<string> {
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
- Landscape orientation 16:9, off-white paper background
- Marker pen textures, imperfect hand-drawn lines
- Spiral binding on the TOP edge
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
- Open with the style anchor line (sketchnote + spiral notebook + landscape 16:9 + off-white + [border color] rough border frame).
- Use CAPS section headers within the prompt: TITLE, SUBTITLE, CONTENT GRID, KEY TAKEAWAY.
- Specify ALL on-image text in quotes, in BAHASA INDONESIA (audience is Indonesian). Example: Title text appears as: "Apa Itu ..." in bold blue marker.
- Describe each visual as "[item] doodle"; specify placement (top-left, top-right, etc.).
- Close with: "STYLE: sketchnote aesthetic, marker pen textures, imperfect hand-drawn lines, spiral binding on top edge, scattered sparkle decorations, scanned-notebook look. All Indonesian text crisp and legible."

Base the title, cards, and takeaway strictly on the key points of the narration. No hallucination.`;
  const out = await complete(system + onImageLang(lang), `Narasi:\n\n${paragraph}`, 1500);
  // Pengaman: pastikan ini benar prompt (mengandung anchor gaya), bukan penolakan AI.
  if (!/sketchnote|notebook/i.test(out)) {
    throw new Error(
      `Image prompt tidak valid (kemungkinan AI menolak): ${out.slice(0, 120)}`,
    );
  }
  return out;
}

/** Langkah 7: narasi -> postingan X long-form dengan hook (gaya viral, Indonesia). */
export async function writeTweet(paragraph: string, lang: Lang): Promise<string> {
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
  return stripMarkdown(await complete(system + HUMANIZER + outputLang(lang), `Narasi:\n\n${paragraph}`, 1024));
}

/** Artikel -> SATU quote tweet (respons + insight, gaya content strategist). */
export async function writeArticleTweet(article: string, lang: Lang): Promise<string> {
  const system = `Kamu adalah seorang content strategist yang ahli membuat quote tweet yang engaging di X (Twitter). Tugasmu membuat quote tweet berdasarkan KONTEN yang diberikan (bisa artikel, thread, post, atau catatan apa pun).

GAYA PENULISAN:
- Tone: santai, to the point, kayak ngobrol sama teman yang pinter
- Bahasa: Indonesia
- Gak pake basa-basi atau intro yang panjang
- Kalimat pendek, tiap baris punya bobot
- Gunakan → untuk list poin
- HURUF KAPITAL hanya untuk hook di baris pertama
- Gak ada emoji kecuali diminta

STRUKTUR QUOTE TWEET:
1. HOOK (baris pertama) — satu kalimat, all caps, bikin orang berhenti scroll (fakta mengejutkan / angka / pernyataan counter-intuitive / pertanyaan tajam)
2. KONTEKS SINGKAT (1-3 baris) — apa inti kontennya, soal apa. Jangan panjang.
3. INSIGHT UTAMA — satu poin terkuat yang jarang dibahas. Bukan sekadar rangkuman, tambahkan sudut pandang atau "so what"-nya.
4. SUPPORTING POINTS (opsional) — 3-5 poin dengan →, konkret, pakai angka kalau ada, tiap poin stand alone.
5. CLOSING LINE — satu kalimat punchy (kesimpulan / challenge / reframe / pertanyaan yang bikin mikir).

✅ DO:
- Tambahkan value di atas konten aslinya (jangan cuma rangkum)
- Pilih angle paling counter-intuitive atau paling sering diabaikan
- Pakai angka konkret kalau tersedia
- Closing memorable, bukan "semoga bermanfaat"
- Kalau kontennya panjang, fokus ke SATU insight terkuat

❌ DON'T:
- JANGAN menyebut kata "artikel" atau frasa seperti "di artikel ini", "artikel ini", "baru baca artikel", "menurut artikel". Sumbernya tidak selalu artikel. Respons langsung ke topik/isinya seolah itu pengetahuanmu.
- Jangan rangkum semua isi, pilih yang paling kuat
- Jangan pakai kata: "menarik", "insightful", "luar biasa", "keren banget"
- Jangan pakai tanda seru berlebihan
- Jangan pakai frasa generik: "di era sekarang", "di dunia yang semakin maju", "penting banget nih"
- Jangan pakai tanda dash panjang (em dash). Pakai titik, koma, atau baris baru.
- Jangan pakai "---" sebagai divider. Cukup baris baru.
- Jangan pakai pola "Itu bukan soal X, ini soal Y."
- Jangan pakai format "*teks*".
- Jangan halusinasi fakta di luar konten yang diberikan.

JENIS KONTEN & PENDEKATAN:
- TIPS/HOW-TO → "Satu hal yang bikin semua tips ini work / gagal". Hindari listing semua tips.
- BISNIS/MAKING MONEY → angka konkret + mindset shift. Hindari hype tanpa substansi.
- TOOLS/PRODUK → "Apa yang bisa lo lakukan sekarang yang sebelumnya gak mungkin". Hindari listing fitur teknis.
- BERITA/UPDATE → "Apa artinya ini buat lo" (dampak langsung ke user). Hindari menceritakan ulang berita.
- MINDSET/OPINI → ambil satu klaim paling berani, lalu dukung atau tantang. Hindari setuju semua tanpa sudut pandang.

CONTOH HASIL BAGUS:
CHANNEL YOUTUBE TANPA WAJAH. TANPA SUARA ASLI. $12.000/BULAN.

Dan ini yang paling banyak orang lewatin:

Bedanya niche bisa 12x pendapatan dari views yang sama.

→ Gaming: $1-4 per 1.000 views
→ Finance: $15-40 per 1.000 views

200.000 views di gaming = $200-800
200.000 views di finance = $3.000-8.000

Usaha yang sama. Hasil yang 12x beda.

Algoritma YouTube gak peduli siapa yang nulis scriptnya. Dia cuma peduli satu hal: apakah orang nonton sampai selesai.

OUTPUT (PENTING — pipeline akan langsung mem-posting hasilmu):
- Hasilkan HANYA SATU quote tweet final. Pilih sendiri angle terkuat. JANGAN beri 2 versi, JANGAN beri label angle, JANGAN beri rekomendasi.
- HANYA teks tweet-nya. Tanpa tanda kutip pembungkus, tanpa preface/penutup dari kamu.
- JANGAN sertakan URL/link apa pun (link ditambahkan terpisah oleh sistem).
- Boleh panjang, tidak dibatasi 280 karakter.`;
  return stripMarkdown(await complete(system + HUMANIZER + outputLang(lang), `Sekarang, buatkan quote tweet dari konten berikut:\n\n${article}`, 1024));
}

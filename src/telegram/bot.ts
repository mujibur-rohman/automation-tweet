// Bot Telegram: terima URL/teks, balas hasil pemrosesan.
// Opsional: tanya pilihan bahasa (EN/ID) via tombol inline sebelum proses.
import { Bot, InlineKeyboard } from "grammy";
import type { Lang } from "../config";

export type UrlBot = {
  raw: Bot;
  start: () => void;
  stop: () => Promise<void>;
  notify: (text: string) => Promise<void>;
};

export type UrlBotConfig = {
  token: string;
  allowedChatId: string | number;
  // url = URL pertama yang ditemukan (atau ""); fullText = seluruh isi pesan; lang = bahasa output.
  onUrl: (url: string, fullText: string, lang: Lang) => Promise<string>;
  // true (default): pesan tanpa URL ditolak. false: pesan tanpa URL tetap diproses.
  requireUrl?: boolean;
  // true: tampilkan tombol pilih bahasa (EN/ID) dulu sebelum proses.
  chooseLanguage?: boolean;
};

const URL_RE = /(https?:\/\/[^\s]+)/i;

export function createUrlBot(cfg: UrlBotConfig): UrlBot {
  const bot = new Bot(cfg.token);
  const allowed = String(cfg.allowedChatId);
  const requireUrl = cfg.requireUrl !== false;

  // Simpan teks pending antara pesan & tap tombol bahasa (token -> {text, ts}).
  const pending = new Map<string, { text: string; ts: number }>();
  const TTL = 10 * 60 * 1000;
  const prune = () => {
    const now = Date.now();
    for (const [k, v] of pending) if (now - v.ts > TTL) pending.delete(k);
  };

  async function process(url: string, text: string, lang: Lang): Promise<string> {
    try {
      return await cfg.onUrl(url, text, lang);
    } catch (err) {
      return `❌ Error: ${(err as Error).message}`;
    }
  }

  bot.on("message:text", async (ctx) => {
    if (String(ctx.chat.id) !== allowed) return;

    const text = ctx.message.text;
    const match = text.match(URL_RE);
    if (requireUrl && !match) {
      await ctx.reply("Kirim URL untuk diproses.");
      return;
    }

    if (cfg.chooseLanguage) {
      prune();
      const token = crypto.randomUUID().slice(0, 8);
      pending.set(token, { text, ts: Date.now() });
      const kb = new InlineKeyboard()
        .text("🇬🇧 English", `lang:en:${token}`)
        .text("🇮🇩 Indonesia", `lang:id:${token}`);
      await ctx.reply("Pilih bahasa output:", { reply_markup: kb });
      return;
    }

    const url = match?.[1] ?? "";
    const thinking = await ctx.reply("⏳ Memproses...");
    const reply = await process(url, text, "id");
    await ctx.api.editMessageText(ctx.chat.id, thinking.message_id, reply).catch(() => ctx.reply(reply));
  });

  if (cfg.chooseLanguage) {
    bot.on("callback_query:data", async (ctx) => {
      if (String(ctx.chat?.id) !== allowed) {
        await ctx.answerCallbackQuery();
        return;
      }
      const [action, lang, token] = (ctx.callbackQuery.data ?? "").split(":");
      if (action !== "lang" || !token) {
        await ctx.answerCallbackQuery();
        return;
      }
      const entry = pending.get(token);
      if (!entry) {
        await ctx.answerCallbackQuery({ text: "Sesi kedaluwarsa, kirim ulang." });
        await ctx.editMessageText("⏱️ Sesi kedaluwarsa. Kirim ulang ya.").catch(() => {});
        return;
      }
      pending.delete(token);
      await ctx.answerCallbackQuery({ text: lang === "en" ? "English" : "Indonesia" });
      await ctx.editMessageText(`⏳ Memproses (${lang === "en" ? "English" : "Indonesia"})...`).catch(() => {});
      const url = entry.text.match(URL_RE)?.[1] ?? "";
      const reply = await process(url, entry.text, (lang as Lang) ?? "id");
      await ctx.editMessageText(reply).catch(() => ctx.reply(reply));
    });
  }

  // Long-polling tahan banting: error polling sesaat (mis. 409 saat instance lama
  // belum lepas) di-retry, bukan meng-crash proses.
  let stopping = false;
  const run = () => {
    if (stopping) return;
    bot.start().catch((err: any) => {
      if (stopping) return;
      console.error(`[telegram] polling error, retry 5s:`, err?.description ?? err?.message ?? err);
      setTimeout(run, 5000);
    });
  };

  return {
    raw: bot,
    start: () => run(),
    stop: async () => {
      stopping = true;
      await bot.stop();
    },
    notify: (text) => bot.api.sendMessage(allowed, text).then(() => {}),
  };
}

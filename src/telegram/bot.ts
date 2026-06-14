// Bot Telegram: terima pesan berisi URL post Threads, balas hasil pemrosesan.
import { Bot } from "grammy";

export type UrlBot = {
  raw: Bot;
  start: () => void;
  stop: () => Promise<void>;
  notify: (text: string) => Promise<void>;
};

export type UrlBotConfig = {
  token: string;
  allowedChatId: string | number;
  onUrl: (url: string) => Promise<string>;
};

const URL_RE = /(https?:\/\/[^\s]+)/i;

export function createUrlBot(cfg: UrlBotConfig): UrlBot {
  const bot = new Bot(cfg.token);
  const allowed = String(cfg.allowedChatId);

  bot.on("message:text", async (ctx) => {
    if (String(ctx.chat.id) !== allowed) return;

    const match = ctx.message.text.match(URL_RE);
    if (!match) {
      await ctx.reply("Kirim URL post Threads untuk diproses.");
      return;
    }
    const url = match[1]!;
    const thinking = await ctx.reply("⏳ Memproses...");
    let reply: string;
    try {
      reply = await cfg.onUrl(url);
    } catch (err) {
      reply = `❌ Error: ${(err as Error).message}`;
    }
    await ctx.api.editMessageText(ctx.chat.id, thinking.message_id, reply).catch(() => ctx.reply(reply));
  });

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

// Baca & validasi environment. Bun memuat .env otomatis (tanpa dotenv).
// Gagal cepat: kalau ada env wajib yang kosong, lempar error saat startup.

export type Lang = "en" | "id";

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(`Env wajib "${name}" kosong. Cek file .env (lihat .env.example).`);
  }
  return value.trim();
}

function optional(name: string, fallback: string): string {
  const value = process.env[name];
  return value && value.trim() !== "" ? value.trim() : fallback;
}

function list(name: string): string[] {
  return optional(name, "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export const config = {
  databaseUrl: required("DATABASE_URL"),

  rapidApi: {
    key: required("RAPIDAPI_KEY"),
    host: optional("RAPIDAPI_THREADS_HOST", "threads-api4.p.rapidapi.com"),
  },

  telegram: {
    botToken: optional("TELEGRAM_BOT_TOKEN", ""),
    chatId: optional("TELEGRAM_CHAT_ID", ""),
  },

  buffer: {
    accessToken: optional("BUFFER_ACCESS_TOKEN", ""),
    orgId: optional("BUFFER_ORG_ID", ""),
    profileIds: list("BUFFER_PROFILE_IDS"),
    postMode: optional("BUFFER_POST_MODE", "addToQueue"),
  },

  // Automation kedua (YouTube -> AI -> Telegram), terpisah dari Threads.
  youtube: {
    telegramBotToken: optional("YT_TELEGRAM_BOT_TOKEN", ""),
    telegramChatId: optional("YT_TELEGRAM_CHAT_ID", ""),
    kieToken: optional("KIE_API_TOKEN", ""),
    textModel: optional("KIE_TEXT_MODEL", "claude-sonnet-4-6"),
    imageModel: optional("KIE_IMAGE_MODEL", "gpt-image-2-text-to-image"),
    imageAspectRatio: optional("KIE_IMAGE_ASPECT", "16:9"),
    // Channel Buffer untuk flow YouTube short & artikel (abangantech).
    bufferChannelId: optional("YT_BUFFER_CHANNEL_ID", ""),
  },
} as const;

export type Config = typeof config;

// Jalankan langsung untuk verifikasi: `bun run src/config.ts`
if (import.meta.main) {
  const redact = (s: string) => (s ? s.slice(0, 4) + "…" + `(${s.length})` : "(kosong)");
  console.log("Config tervalidasi:");
  console.log("  DATABASE_URL       :", redact(config.databaseUrl));
  console.log("  RAPIDAPI_KEY       :", redact(config.rapidApi.key));
  console.log("  RAPIDAPI host      :", config.rapidApi.host);
  console.log("  TELEGRAM_BOT_TOKEN :", redact(config.telegram.botToken));
  console.log("  TELEGRAM_CHAT_ID   :", config.telegram.chatId || "(kosong)");
  console.log("  BUFFER token       :", redact(config.buffer.accessToken));
  console.log("  BUFFER profiles    :", config.buffer.profileIds.length);
  console.log("  YT bot/kie         :", redact(config.youtube.telegramBotToken), "/", redact(config.youtube.kieToken));
}

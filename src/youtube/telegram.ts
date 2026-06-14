// Kirim hasil (tweet + prompt image) ke Telegram chat YouTube, via Bot API.
import { config } from "../config";

const MSG_LIMIT = 4096; // batas pesan teks Telegram

async function send(text: string): Promise<void> {
  const res = await fetch(`https://api.telegram.org/bot${config.youtube.telegramBotToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: config.youtube.telegramChatId, text: text.slice(0, MSG_LIMIT) }),
  });
  const json: any = await res.json();
  if (!json.ok) throw new Error(`Telegram sendMessage: ${json.description ?? res.status}`);
}

/** Kirim tweet lalu prompt image sebagai dua pesan terpisah (mudah di-copy). */
export async function sendResult(tweet: string, imagePrompt: string): Promise<void> {
  await send(tweet);
  await send(`🖼️ IMAGE PROMPT:\n\n${imagePrompt}`);
}

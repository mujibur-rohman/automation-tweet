// Kirim hasil (tweet + prompt image) ke Telegram chat YouTube, via Bot API.
import { config } from "../config";

const MSG_LIMIT = 4096; // batas pesan teks Telegram
const CAPTION_LIMIT = 1024; // batas caption foto Telegram

async function call(method: string, payload: Record<string, unknown>): Promise<void> {
  const res = await fetch(`https://api.telegram.org/bot${config.youtube.telegramBotToken}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const json: any = await res.json();
  if (!json.ok) throw new Error(`Telegram ${method}: ${json.description ?? res.status}`);
}

/** Kirim satu pesan teks ke chat abangantech. */
export async function sendText(text: string): Promise<void> {
  await call("sendMessage", { chat_id: config.youtube.telegramChatId, text: text.slice(0, MSG_LIMIT) });
}

/** Kirim gambar + caption tweet. Tweet panjang dikirim sebagai pesan terpisah. */
export async function sendPhoto(imageUrl: string, caption: string): Promise<void> {
  const chatId = config.youtube.telegramChatId;
  if (caption.length <= CAPTION_LIMIT) {
    await call("sendPhoto", { chat_id: chatId, photo: imageUrl, caption });
  } else {
    await call("sendPhoto", { chat_id: chatId, photo: imageUrl });
    await sendText(caption);
  }
}

# Threads → Buffer Automation

Kirim URL post Threads ke bot Telegram → sistem ambil konten + media (via RapidAPI) →
langsung masukkan ke antrian Buffer.

```
[INTAKE]  kirim URL ke Telegram
          → resolve post_id (/api/post/get-id)
          → cek DB: kalau sudah ada → DITOLAK
          → ambil detail (/api/post/detail): caption + semua media
          → validasi media (aturan Twitter) → kalau langgar: DIBATALKAN
          → createPost ke Buffer (mode addToQueue) → catat sebagai queued
[SYNC]    cek Buffer → yang terkirim ditandai posted
```

Format teks yang diposting:

```
(isi caption)

sc:(username)
```

## Prasyarat

- [Bun](https://bun.sh)
- PostgreSQL (lokal atau managed) — buat database `automation`
- Akun: RapidAPI (Threads), Telegram bot ([@BotFather](https://t.me/BotFather)), Buffer (API key dari Settings → API)

## Setup

```bash
bun install
cp .env.example .env      # isi semua kredensial
bun run migrate           # buat tabel
```

Untuk dapat `TELEGRAM_CHAT_ID`: kirim `/start` ke bot, lalu cek
`https://api.telegram.org/bot<TOKEN>/getUpdates`.

## Menjalankan

```bash
bun run start        # jalan penuh: bot Telegram (terima URL) + scheduler sync
bun run dev          # mode --hot untuk pengembangan
```

Lalu kirim URL post Threads ke bot. Bot membalas status (✅ masuk antrian / ⚠️ sudah ada / ❌ dibatalkan).

Manual / CLI:

```bash
bun run submit "https://www.threads.net/@user/post/CODE"   # proses 1 URL tanpa bot
bun run sync:once                                          # update status posted
```

## Konfigurasi (.env)

| Var | Keterangan |
|---|---|
| `DATABASE_URL` | koneksi Postgres |
| `RAPIDAPI_KEY` / `RAPIDAPI_THREADS_HOST` | RapidAPI Threads (`threads-api4.p.rapidapi.com`) |
| `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` | bot & chat tujuan |
| `BUFFER_ACCESS_TOKEN` / `BUFFER_ORG_ID` / `BUFFER_PROFILE_IDS` | Buffer (channel id, koma-pisah) |
| `BUFFER_POST_MODE` | `addToQueue` (default) / `customScheduled` / `shareNow` |
| `SYNC_CRON` | jadwal cron untuk update status posted |

## Arsitektur

```
src/
  config.ts            env tervalidasi
  db/                  Bun.sql + migrasi + repo (posts: dedup + status)
  sources/threads.ts   client RapidAPI Threads — FALLBACK multi-host (kuota terpisah/host) + decode shortcode lokal + retry
  telegram/            bot input-URL (createUrlBot)
  buffer/client.ts     client Buffer GraphQL (image & video assets)
  intake.ts            orkestrasi: resolve → dedup → detail → validasi → Buffer
  jobs/sync.ts         tandai posted
  scheduler.ts         cron sync (croner)
  index.ts             entrypoint
```

## Deploy ke VPS

Lihat `deploy/automation.service` (systemd):

```bash
# di VPS: clone + bun install + isi .env + bun run migrate
sudo cp deploy/automation.service /etc/systemd/system/
sudo systemctl enable --now automation
journalctl -u automation -f
```

## Fallback multi-host

`sources/threads.ts` mencoba beberapa host RapidAPI berurutan. Tiap host = API berbeda →
**kuota bulanan terpisah**, jadi kalau satu kena limit (429) otomatis lanjut ke berikutnya.
Provider saat ini (urut prioritas):
1. `threads-api4` (`/api/post/detail`) — caption + media
2. `threads-by-meta...` (`/get_thread_details`) — caption + media
3. `threads-public-data-api` (`/post/detail?shortCodeOrUrl=`) — caption + media
4. `threads14` (`/post.php?code=`) — caption + media
5. `threads-media-download` (`POST /post/idcode`) — **media saja, tanpa caption** (cadangan terakhir; post keluar dgn media + `scthread:username` tapi tanpa teks)

(`threads-data-api` tidak dipakai — media-only tanpa caption.)
Tambah provider baru = tambah entri di array `PROVIDERS`. 429 di satu host → langsung lompat ke host berikutnya (tanpa buang kuota).

## Catatan

- Token RapidAPI/Buffer/Telegram di `.env` (sudah di-gitignore). Jangan commit.
- URL media Threads (IG CDN) bisa kedaluwarsa; publish otomatis fallback ke teks saja bila ditolak Buffer.
- Repost konten kreator lain: sertakan kredit (permalink otomatis dilampirkan).

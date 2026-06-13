# Threads → Buffer Automation — Design

**Tanggal:** 2026-06-13
**Status:** ⚠️ ALUR DIUBAH setelah implementasi awal. Dokumen ini adalah desain awal
(cron fetch akun target + approval Telegram). Alur final = **intake URL via Telegram →
langsung ke Buffer** (tanpa approval, tanpa cron fetch). Lihat `README.md` untuk alur
yang berlaku sekarang. Detail Buffer/RapidAPI di bawah masih valid.

## 1. Tujuan

Sistem otomatis untuk mengkurasi konten Threads (Meta) dari kreator lain (via RapidAPI),
melewati tahap persetujuan manual lewat Telegram, lalu menjadwalkan repost via Buffer API.

Alur tingkat-tinggi:

```
[FETCH cron]   RapidAPI → dedup insert (pending) → kirim kartu approve ke Telegram
[Telegram]     tap ✅ → approved      | tap ❌ → rejected
[PUBLISH cron] approved → push antrian Buffer → queued (+ scheduled_at)
[SYNC cron]    cek Buffer 'sent' → posted (+ posted_at)
```

Timing tayang diatur sepenuhnya oleh **schedule Buffer** — sistem hanya mendorong item ke
antrian Buffer, Buffer mengisi slot berikutnya.

## 2. Keputusan desain (dari brainstorm)

| Topik | Keputusan |
|---|---|
| Sumber konten | Threads orang lain via **RapidAPI** |
| Alur kontrol | Review manual dulu (approve via Telegram) sebelum dijadwalkan |
| Approve UX | **Tombol inline** ✅/❌ di Telegram (idempoten) |
| Runtime | **Lokal dulu** (Bun), struktur siap pindah ke **VPS** (systemd) |
| Arsitektur | Satu proses Bun, modular (Opsi A) |
| Database | **PostgreSQL** via `Bun.sql` (driver bawaan Bun) |
| Telegram | **Bot per-service** (token terpisah). Modul approval dibuat generik & reusable |
| Scheduling | `croner` (cron internal); posting timing diserahkan ke Buffer |

## 3. Persiapan di luar kode (prasyarat)

1. **RapidAPI** — subscribe satu Threads API; catat `X-RapidAPI-Key` + host endpoint.
2. **Telegram Bot** — buat via @BotFather; simpan bot token + chat ID tujuan.
3. **Buffer** — ✅ **TERVERIFIKASI (2026-06-13).** Pakai **Buffer GraphQL API baru**:
   - Endpoint: `POST https://api.buffer.com`, header `Authorization: Bearer <API_KEY>` (key dari Settings → API). API lama `api.bufferapp.com/1/` sudah usang (tolak OIDC).
   - Organization: `6a2680c3a4c9bb287c212325`.
   - Channel target tersedia: `itsmujay` (threads) `6a269d748f1d11f9b2636fda`, `abangantech` (twitter) `6a2680f88f1d11f9b26305c9`.
   - Posting via mutation `createPost(input: CreatePostInput!)`. Field wajib: `channelId`, `schedulingType` (`automatic`|`notification`), `mode` (`addToQueue`|`shareNow`|`shareNext`|`customScheduled`), `assets` (list: image/video/document/link). Opsional: `text`, `dueAt` (untuk `customScheduled`), `saveToDraft`.
   - "Ikut schedule Buffer" = `mode: addToQueue` + `schedulingType: automatic`.
4. **PostgreSQL** — Docker `postgres:16` lokal **atau** Neon/Supabase managed. Connection
   string identik → mulus lokal→VPS.
5. **Daftar username target** Threads yang akan di-fetch.

## 4. Struktur folder

```
automation/
  src/
    config.ts              # baca & validasi env (RapidAPI, Telegram, Buffer, DATABASE_URL)
    db/
      client.ts            # koneksi Bun.sql (singleton)
      migrate.ts           # jalankan file migrasi .sql
      migrations/
        001_init.sql
      posts.repo.ts        # insert kandidat (dedup), set approved/rejected/queued/posted
      accounts.repo.ts     # CRUD akun target
    sources/
      threads.ts           # client RapidAPI Threads — fetch post per username
    telegram/
      approval-bot.ts      # GENERIK: createApprovalBot, sendApprovalCard, onApprove/onReject
      index.ts             # ekspor modul
    buffer/
      client.ts            # client Buffer API — push ke antrian, cek status
    jobs/
      fetch.ts             # FETCH: ambil → dedup → simpan → notif Telegram (wiring Threads)
      publish.ts           # PUBLISH: approved → push ke Buffer → tandai queued
      sync.ts              # SYNC: cek status Buffer → tandai posted
    scheduler.ts           # registrasi cron (croner)
    index.ts               # entrypoint: start bot + scheduler
  .env.example
  docs/superpowers/specs/   # dokumen desain ini
```

Prinsip: tiap modul satu tanggung jawab. `sources/threads` hanya tahu RapidAPI,
`buffer/client` hanya tahu Buffer, `jobs/*` merangkai alur. Bisa dites & diganti terpisah.

## 5. Modul Telegram generik (reusable)

Karena tiap service ke depan punya bot sendiri (token terpisah), modul Telegram **tidak
boleh terikat ke Threads**. Di-config saat dibuat:

```ts
const bot = createApprovalBot({
  token: env.TELEGRAM_BOT_TOKEN,     // beda per service
  allowedChatId: env.TELEGRAM_CHAT_ID,
});

const msgId = await bot.sendApprovalCard({
  id: post.id,
  entity: "threads_post",            // penanda tipe → routing callback
  title: `@${post.author_username}`,
  body: post.content,
  mediaUrls: post.media_urls,
});

bot.onApprove("threads_post", (id) => postsRepo.markApproved(id));
bot.onReject ("threads_post", (id) => postsRepo.markRejected(id));
```

- `callback_data` di-encode generik: `approve:<entity>:<id>` / `reject:<entity>:<id>`.
- Modul nol ketergantungan ke Threads/DB — I/O murni "kartu + event".
- Hanya merespons `allowedChatId` (abaikan chat lain).
- Path ekstraksi ke `packages/telegram-approval` saat service kedua muncul — **belum**
  dibuat sekarang (YAGNI).
- Library: **grammY** (ringan, jalan mulus di Bun, dukung inline keyboard + callback query).

## 6. Skema database

**`target_accounts`**
```sql
id          serial PRIMARY KEY
username    text UNIQUE NOT NULL
enabled     boolean NOT NULL DEFAULT true
created_at  timestamptz NOT NULL DEFAULT now()
```

**`posts`**
```sql
id                  serial PRIMARY KEY
source_post_id      text UNIQUE NOT NULL     -- kunci dedup
author_username     text NOT NULL
content             text
media_urls          jsonb NOT NULL DEFAULT '[]'
permalink           text
status              text NOT NULL DEFAULT 'pending'
                    -- pending | approved | rejected | queued | posted | failed
buffer_update_id    text
telegram_message_id bigint
scheduled_at        timestamptz
posted_at           timestamptz
fetched_at          timestamptz NOT NULL DEFAULT now()
updated_at          timestamptz NOT NULL DEFAULT now()
```
Index: `UNIQUE(source_post_id)`, index pada `status`.

Dedup: `INSERT ... ON CONFLICT (source_post_id) DO NOTHING` — atomik, tak perlu cek manual.

## 7. State machine

```
pending ──✅──> approved ──publish──> queued ──sync──> posted
   │
   └──❌──> rejected

queued/publish gagal ──> failed ──(retry run berikutnya)──> queued
```

Transisi via `posts.repo`. Tombol Telegram idempoten: jika status sudah berubah, tap
berikutnya diabaikan (dan pesan kartu di-edit jadi penanda hasil).

## 8. Job & scheduling

- **`jobs/fetch.ts`** — loop akun `enabled`, panggil RapidAPI, `ON CONFLICT DO NOTHING`,
  untuk tiap row baru kirim `sendApprovalCard` & simpan `telegram_message_id`.
- **`jobs/publish.ts`** — ambil `status='approved'`, push ke antrian Buffer, set `queued`
  + `buffer_update_id` + `scheduled_at`. Gagal → `failed`.
- **`jobs/sync.ts`** — cek status update di Buffer; yang `sent` → `posted` + `posted_at`.
- **`scheduler.ts`** — daftarkan ketiganya via `croner` (interval dikonfigurasi via env).

## 9. Error handling

- **RapidAPI gagal / rate-limit:** retry ringan + log; notif Telegram bila fetch gagal total.
- **Buffer gagal:** tandai `failed`, di-retry run berikutnya (tidak hilang).
- **Telegram callback:** idempoten — abaikan jika status sudah berubah.
- **Dedup:** dijamin oleh constraint UNIQUE, bukan logika aplikasi.

## 10. Konfigurasi (.env.example)

```
DATABASE_URL=postgres://user:pass@localhost:5432/automation
RAPIDAPI_KEY=
RAPIDAPI_THREADS_HOST=
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
BUFFER_ACCESS_TOKEN=
BUFFER_PROFILE_IDS=          # comma-separated
FETCH_CRON=*/30 * * * *
PUBLISH_CRON=*/5 * * * *
SYNC_CRON=*/15 * * * *
```
Bun memuat `.env` otomatis (tanpa dotenv).

## 11. Testing

- `bun test` untuk logika `posts.repo` (dedup, transisi status) memakai schema test.
- Client RapidAPI / Buffer / Telegram di-mock pada unit test job.
- Test integrasi opsional terhadap Postgres lokal (Docker).

## 12. Deployment (lokal → VPS)

- **Lokal:** `bun run src/index.ts` (bot long-polling + scheduler dalam satu proses).
- **VPS:** unit `systemd` dengan auto-restart; `DATABASE_URL` mengarah ke Postgres VPS/managed.
- Migrasi dijalankan via `bun run src/db/migrate.ts` saat deploy.

## 13. Di luar lingkup (sekarang)

- Monorepo / package bersama untuk modul Telegram (ekstraksi nanti saat service ke-2).
- Multi-operator / multi-chat approval.
- Editor konten / penjadwalan manual per-post di luar schedule Buffer.

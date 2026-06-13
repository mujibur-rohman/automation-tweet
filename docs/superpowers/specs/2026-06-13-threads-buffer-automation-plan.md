# Threads → Buffer Automation — Rencana Implementasi

Berbasis: `2026-06-13-threads-buffer-automation-design.md`
Dikerjakan berurutan. Tiap fase punya kriteria "selesai" yang bisa diverifikasi.

---

## Fase 0 — Bootstrap & prasyarat

**Tujuan:** lingkungan siap sebelum nulis logika.

- [ ] Pasang dependency: `bun add grammy croner` (DB pakai `Bun.sql` bawaan).
- [ ] Buat `.env.example` (lihat spec §10) dan `.env` lokal.
- [ ] Nyalakan Postgres lokal (Docker `postgres:16`) atau siapkan connection string Neon.
- [ ] **Verifikasi akses Buffer API** (titik risiko) — tes 1 call sederhana dengan token.
- [ ] `src/config.ts`: baca & validasi semua env, gagal cepat (throw) bila ada yang kosong.

**Selesai bila:** `bun run src/config.ts` mencetak konfigurasi tervalidasi tanpa error.

---

## Fase 1 — Lapisan database

**Tujuan:** skema + repo dengan dedup & transisi status, teruji.

- [ ] `src/db/client.ts` — singleton `Bun.sql` dari `DATABASE_URL`.
- [ ] `src/db/migrations/001_init.sql` — tabel `target_accounts` & `posts` (spec §6).
- [ ] `src/db/migrate.ts` — jalankan file migrasi berurutan.
- [ ] `src/db/accounts.repo.ts` — list enabled, add, disable.
- [ ] `src/db/posts.repo.ts`:
  - `insertCandidate(...)` → `ON CONFLICT (source_post_id) DO NOTHING`, kembalikan row baru saja.
  - `markApproved/markRejected/markQueued/markPosted/markFailed`.
  - `listApproved()`, `listQueued()`.
- [ ] Test: `bun test` untuk dedup (insert 2x → 1 row) & transisi status.

**Selesai bila:** migrasi jalan di Postgres lokal, semua test repo hijau.

---

## Fase 2 — Sumber RapidAPI Threads

**Tujuan:** ambil post per-username, ternormalisasi.

- [ ] `src/sources/threads.ts` — `fetchPostsByUsername(username): NormalizedPost[]`.
  - Header `X-RapidAPI-Key` + host dari env.
  - Map respons mentah → `{ source_post_id, author_username, content, media_urls, permalink }`.
  - Tangani error HTTP/rate-limit (lempar error bertipe jelas).
- [ ] Test dengan respons RapidAPI yang di-mock (fixture JSON).

**Selesai bila:** fixture termap ke bentuk ternormalisasi; error 429/5xx tertangani.

---

## Fase 3 — Modul approval Telegram (generik)

**Tujuan:** komponen reusable, nol ketergantungan ke Threads.

- [ ] `src/telegram/approval-bot.ts`:
  - `createApprovalBot({ token, allowedChatId })`.
  - `sendApprovalCard({ id, entity, title, body, mediaUrls })` → `message_id`.
  - Inline keyboard `callback_data = approve:<entity>:<id>` / `reject:<entity>:<id>`.
  - `onApprove(entity, handler)` / `onReject(entity, handler)`.
  - Filter `allowedChatId`; edit pesan jadi penanda hasil setelah ditekan.
- [ ] `src/telegram/index.ts` — ekspor.
- [ ] Test: parsing `callback_data` & routing ke handler yang benar (bot di-mock).

**Selesai bila:** kirim kartu uji → tombol tampil → tap memanggil handler sesuai `entity`/`id`.

---

## Fase 4 — Job FETCH

**Tujuan:** rangkai ambil → dedup → simpan → notif.

- [ ] `src/jobs/fetch.ts`:
  - Loop akun `enabled` → `fetchPostsByUsername`.
  - `insertCandidate` (hanya row baru lanjut).
  - Tiap row baru: `sendApprovalCard`, simpan `telegram_message_id`.
  - Wiring handler: `onApprove("threads_post") → markApproved`, reject → `markRejected`.
  - Notif Telegram bila fetch satu akun gagal total.

**Selesai bila:** jalan manual → kandidat baru muncul di Telegram; tap ✅ ubah status di DB; run kedua tidak dobel.

---

## Fase 5 — Buffer client + Job PUBLISH

**Tujuan:** dorong approved ke antrian Buffer.

- [ ] `src/buffer/client.ts`:
  - `addToQueue({ profileIds, text, mediaUrls }): { updateId, scheduledAt }`.
  - `getUpdateStatus(updateId)`.
- [ ] `src/jobs/publish.ts`:
  - Ambil `listApproved()` → `addToQueue` → `markQueued(id, updateId, scheduledAt)`.
  - Gagal → `markFailed`; failed di-retry run berikutnya.

**Selesai bila:** item approved muncul di antrian Buffer; status DB jadi `queued` dengan `scheduled_at`.

---

## Fase 6 — Job SYNC

**Tujuan:** tandai yang sudah tayang.

- [ ] `src/jobs/sync.ts` — `listQueued()` → `getUpdateStatus`; `sent` → `markPosted` + `posted_at`.

**Selesai bila:** item yang sudah dikirim Buffer berubah jadi `posted` di DB.

---

## Fase 7 — Scheduler & entrypoint

**Tujuan:** semua jalan sebagai satu proses.

- [ ] `src/scheduler.ts` — daftarkan fetch/publish/sync via `croner` (interval dari env).
- [ ] `src/index.ts` — start approval bot (long-polling) + scheduler; graceful shutdown.

**Selesai bila:** `bun run src/index.ts` jalan terus, cron memicu job sesuai jadwal, bot responsif.

---

## Fase 8 — Deployment VPS (dokumentasi)

- [ ] Unit `systemd` (auto-restart) + langkah `bun run src/db/migrate.ts` saat deploy.
- [ ] Catatan env produksi (`DATABASE_URL` ke Postgres VPS/managed).

**Selesai bila:** ada README deploy yang bisa diikuti tanpa nanya.

---

## Urutan pengerjaan

0 → 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8.
Fase 1–3 saling independen setelah Fase 0; bisa dikerjakan paralel bila perlu, tapi default berurutan.

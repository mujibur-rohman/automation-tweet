-- Skema awal: akun target + posts (dengan dedup & status).

CREATE TABLE IF NOT EXISTS target_accounts (
  id          serial PRIMARY KEY,
  username    text UNIQUE NOT NULL,
  enabled     boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS posts (
  id                  serial PRIMARY KEY,
  source_post_id      text UNIQUE NOT NULL,        -- kunci dedup
  author_username     text NOT NULL,
  content             text NOT NULL DEFAULT '',
  media_urls          jsonb NOT NULL DEFAULT '[]',
  permalink           text NOT NULL DEFAULT '',
  status              text NOT NULL DEFAULT 'pending',
                      -- pending | approved | rejected | queued | posted | failed
  buffer_update_id    text,
  telegram_message_id bigint,
  scheduled_at        timestamptz,
  posted_at           timestamptz,
  taken_at            timestamptz,
  error               text,
  fetched_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_posts_status ON posts(status);

-- Automation #2: YouTube -> AI -> Buffer.

CREATE TABLE IF NOT EXISTS youtube_posts (
  id                serial PRIMARY KEY,
  video_id          text UNIQUE NOT NULL,        -- kunci dedup
  url               text NOT NULL,
  transcript        text,
  paragraph         text,                        -- ringkasan AI
  image_prompt      text,                        -- prompt image AI
  image_url         text,                        -- hasil generate
  tweet             text,                        -- tweet hook AI
  status            text NOT NULL DEFAULT 'received',
                    -- received | processing | queued | posted | failed
  buffer_update_id  text,
  scheduled_at      timestamptz,
  posted_at         timestamptz,
  error             text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_youtube_status ON youtube_posts(status);

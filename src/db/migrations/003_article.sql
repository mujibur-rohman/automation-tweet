-- Automation #3: artikel -> tweet respons+insight -> Buffer abangantech.

CREATE TABLE IF NOT EXISTS article_posts (
  id                serial PRIMARY KEY,
  url               text UNIQUE NOT NULL,        -- kunci dedup (URL artikel)
  article_text      text,
  tweet             text,
  status            text NOT NULL DEFAULT 'processing',
                    -- processing | queued | failed
  buffer_update_id  text,
  scheduled_at      timestamptz,
  error             text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_article_status ON article_posts(status);

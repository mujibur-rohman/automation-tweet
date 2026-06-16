-- Automation #4: scrape link apa pun -> narasi -> gambar -> tweet.

CREATE TABLE IF NOT EXISTS link_posts (
  id                serial PRIMARY KEY,
  url               text UNIQUE NOT NULL,        -- kunci dedup
  content           text,                        -- hasil scrape
  paragraph         text,                        -- narasi AI
  image_prompt      text,
  image_url         text,
  tweet             text,
  status            text NOT NULL DEFAULT 'processing',
                    -- processing | sent | queued | failed
  buffer_update_id  text,
  scheduled_at      timestamptz,
  error             text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_link_status ON link_posts(status);

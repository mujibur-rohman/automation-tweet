import { test, expect, afterAll } from "bun:test";
import { sql } from "./client";
import { existsBySourceId, insertQueued, listQueued, markPosted } from "./posts.repo";
import type { NormalizedPost } from "../sources/threads";

const TEST_ID = `test_${Date.now()}`;
const post: NormalizedPost = {
  sourcePostId: TEST_ID,
  authorUsername: "tester",
  content: "halo dunia",
  media: [
    { type: "image", url: "https://example.com/a.jpg" },
    { type: "video", url: "https://example.com/v.mp4", thumbnailUrl: "https://example.com/t.jpg" },
  ],
  permalink: "https://www.threads.net/@tester/post/abc",
  takenAt: new Date(),
};

afterAll(async () => {
  await sql`DELETE FROM posts WHERE source_post_id = ${TEST_ID}`;
  await sql.end();
});

test("dedup: existsBySourceId false sebelum insert, true sesudah", async () => {
  expect(await existsBySourceId(TEST_ID)).toBe(false);
  const row = await insertQueued(post, "buf_1");
  expect(row.status).toBe("queued");
  expect(row.buffer_update_id).toBe("buf_1");
  expect(row.media_urls).toEqual(post.media); // jsonb terparse jadi MediaItem[]
  expect(await existsBySourceId(TEST_ID)).toBe(true);
});

test("queued muncul di listQueued, lalu markPosted memindahkan keluar", async () => {
  const queued = await listQueued();
  const row = queued.find((p) => p.source_post_id === TEST_ID);
  expect(row).toBeDefined();

  await markPosted(row!.id, new Date());
  const after = await sql`SELECT status FROM posts WHERE id = ${row!.id}`;
  expect(after[0]!.status).toBe("posted");
});

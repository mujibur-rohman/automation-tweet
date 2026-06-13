// Client RapidAPI Threads dengan FALLBACK multi-host.
// Tiap host = API berbeda di RapidAPI -> kuota terpisah. Kalau host #1 kena limit/error,
// otomatis coba host berikutnya. Shortcode di-decode lokal (hemat kuota).
import { config } from "../config";

export type MediaItem = { type: "image" | "video"; url: string; thumbnailUrl?: string };

export type NormalizedPost = {
  sourcePostId: string;
  authorUsername: string;
  content: string;
  media: MediaItem[];
  permalink: string;
  takenAt: Date | null;
};

export class ThreadsApiError extends Error {
  constructor(message: string, readonly status: number, readonly retryable: boolean) {
    super(message);
    this.name = "ThreadsApiError";
  }
}

// Host RapidAPI (semua pakai key yang sama, kuota masing-masing).
const HOST_API4 = config.rapidApi.host; // threads-api4.p.rapidapi.com
const HOST_BYMETA = "threads-by-meta-threads-an-instagram-app-detailed.p.rapidapi.com";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Retry untuk error transient (5xx, jaringan, respons kosong sesaat).
 * 429 (rate limit/kuota) TIDAK di-retry di host yang sama — langsung lempar
 * agar pemanggil bisa lompat ke provider berikutnya (hemat kuota).
 */
async function withRetry<T>(fn: () => Promise<T>, attempts = 2): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const retryable = err instanceof ThreadsApiError ? err.retryable : true;
      const isRateLimit = err instanceof ThreadsApiError && err.status === 429;
      if (!retryable || isRateLimit || i === attempts - 1) break;
      await sleep(700 * (i + 1));
    }
  }
  throw lastErr;
}

async function get(host: string, path: string, params: Record<string, string>): Promise<any> {
  const url = new URL(`https://${host}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return request(host, url, { headers: { "x-rapidapi-key": config.rapidApi.key, "x-rapidapi-host": host } });
}

async function post(host: string, path: string, body: Record<string, unknown>): Promise<any> {
  return request(host, `https://${host}${path}`, {
    method: "POST",
    headers: {
      "x-rapidapi-key": config.rapidApi.key,
      "x-rapidapi-host": host,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

async function request(host: string, url: string | URL, init: RequestInit): Promise<any> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const retryable = res.status === 429 || res.status >= 500;
    throw new ThreadsApiError(`${host} gagal: HTTP ${res.status}`, res.status, retryable);
  }
  return res.json();
}

// Alfabet base64url ala Instagram/Threads untuk decode shortcode -> numeric id.
const SHORTCODE_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

function decodeShortcode(code: string): string | null {
  let id = 0n;
  for (const ch of code) {
    const v = SHORTCODE_ALPHABET.indexOf(ch);
    if (v < 0) return null;
    id = id * 64n + BigInt(v);
  }
  return id > 0n ? id.toString() : null;
}

/** Ekstrak shortcode dan username dari URL Threads. */
export function parseUrl(url: string): { shortcode: string | null; username: string | null } {
  return {
    shortcode: url.match(/\/post\/([A-Za-z0-9_-]+)/)?.[1] ?? null,
    username: url.match(/@([A-Za-z0-9_.]+)/)?.[1] ?? null,
  };
}

/** Resolve post_id dari URL (decode lokal; fallback get-id host #1). */
export async function resolvePostIdFromUrl(url: string): Promise<string> {
  const { shortcode } = parseUrl(url);
  if (shortcode) {
    const decoded = decodeShortcode(shortcode);
    if (decoded) return decoded;
  }
  return withRetry(async () => {
    const data = await get(HOST_API4, "/api/post/get-id", { url });
    const id = data?.data?.post_id;
    if (!id) throw new ThreadsApiError(`Tidak bisa resolve post_id dari URL: ${url}`, 502, true);
    return String(id);
  });
}

// --- Ekstraksi media (shape post Instagram/Threads, dipakai host #1 & #3) ---

function mediaFromNode(node: any): MediaItem | null {
  const videoUrl = node?.video_versions?.[0]?.url;
  if (videoUrl) {
    return { type: "video", url: videoUrl, thumbnailUrl: node?.image_versions2?.candidates?.[0]?.url };
  }
  const imageUrl = node?.image_versions2?.candidates?.[0]?.url;
  if (imageUrl) return { type: "image", url: imageUrl };
  return null;
}

function extractMedia(post: any): MediaItem[] {
  const carousel = post?.carousel_media;
  if (Array.isArray(carousel) && carousel.length > 0) {
    return carousel.map(mediaFromNode).filter((m): m is MediaItem => m !== null);
  }
  const single = mediaFromNode(post);
  return single ? [single] : [];
}

/** Map objek post (shape IG/Threads) -> NormalizedPost. */
function normalizePost(post: any, fallbackUsername: string): NormalizedPost {
  const username = post?.user?.username || fallbackUsername;
  return {
    sourcePostId: String(post.pk ?? post.id),
    authorUsername: username,
    content: post?.caption?.text ?? "",
    media: extractMedia(post),
    permalink: post?.code ? `https://www.threads.net/@${username}/post/${post.code}` : "",
    takenAt: post?.taken_at ? new Date(post.taken_at * 1000) : null,
  };
}

// --- Provider (urut prioritas). Tiap provider punya kuota RapidAPI sendiri. ---

export type FetchContext = { postId: string; shortcode: string; username: string };

type Provider = { name: string; fetch: (ctx: FetchContext) => Promise<NormalizedPost> };

const HOST_MEDIA_DL = "threads-media-download.p.rapidapi.com";
const HOST_PUBLIC = "threads-public-data-api.p.rapidapi.com";
const HOST_THREADS14 = "threads14.p.rapidapi.com";

const PROVIDERS: Provider[] = [
  // Host ber-caption (lengkap) — diutamakan.
  {
    name: "threads-api4",
    fetch: async ({ postId, username }) => {
      const data = await get(HOST_API4, "/api/post/detail", { post_id: postId });
      const post = data?.data?.data?.edges?.[0]?.node?.thread_items?.[0]?.post;
      if (!post?.id && !post?.pk) throw new ThreadsApiError(`detail kosong (api4)`, 502, true);
      return normalizePost(post, username);
    },
  },
  {
    name: "threads-by-meta",
    fetch: async ({ postId, username }) => {
      const data = await get(HOST_BYMETA, "/get_thread_details", { thread_id: postId });
      const post = data?.post;
      if (!post?.id && !post?.pk) throw new ThreadsApiError(`detail kosong (by-meta)`, 502, true);
      return normalizePost(post, username);
    },
  },
  {
    name: "threads-public-data",
    fetch: async ({ shortcode, username }) => {
      const data = await get(HOST_PUBLIC, "/post/detail", { shortCodeOrUrl: shortcode });
      const d = data?.data;
      if (!d?.id) throw new ThreadsApiError(`detail kosong (public-data)`, 502, true);
      const user = d?.author?.username || username;
      const media: MediaItem[] = (d.mediaList ?? [])
        .map((m: any): MediaItem | null =>
          m?.downloadUrl
            ? { type: m.mediaType === "VIDEO" ? "video" : "image", url: m.downloadUrl }
            : null,
        )
        .filter((m: MediaItem | null): m is MediaItem => m !== null);
      return {
        sourcePostId: String(d.id),
        authorUsername: user,
        content: d.title ?? "",
        media,
        permalink: d.code ? `https://www.threads.net/@${user}/post/${d.code}` : "",
        takenAt: d.createdAt ? new Date(d.createdAt * 1000) : null,
      };
    },
  },
  {
    name: "threads14",
    fetch: async ({ shortcode, username }) => {
      const data = await get(HOST_THREADS14, "/post.php", { code: shortcode });
      const p = data?.post;
      if (!p) throw new ThreadsApiError(`detail kosong (threads14)`, 502, true);
      const user = p?.author?.username || username;
      const media: MediaItem[] = (p.media_carousel ?? [])
        .map((m: any): MediaItem | null =>
          m?.url ? { type: m.type === "video" ? "video" : "image", url: m.url } : null,
        )
        .filter((m: MediaItem | null): m is MediaItem => m !== null);
      return {
        sourcePostId: String(data.decoded_post_id ?? p.pk ?? p.id),
        authorUsername: user,
        content: p.text ?? "",
        media,
        permalink: p.shortcode ? `https://www.threads.net/@${user}/post/${p.shortcode}` : "",
        takenAt: null,
      };
    },
  },
  // Cadangan terakhir: MEDIA-ONLY (tanpa caption). Hanya dipakai bila host di atas gagal semua.
  {
    name: "threads-media-download",
    fetch: async ({ postId, shortcode, username }) => {
      const data = await post(HOST_MEDIA_DL, "/post/idcode", { shortcode, postID: postId });
      const node = data?.data?.data ?? data?.data;
      if (!node?.id && !node?.pk) throw new ThreadsApiError(`detail kosong (media-dl)`, 502, true);
      return normalizePost(node, username); // caption tidak tersedia -> content ""
    },
  },
];

/**
 * Ambil detail post (ternormalisasi), mencoba tiap provider berurutan.
 * Provider gagal (limit/error/kosong) -> lanjut ke provider berikutnya.
 */
export async function fetchPostDetail(ctx: FetchContext): Promise<NormalizedPost> {
  const errors: string[] = [];
  for (const provider of PROVIDERS) {
    try {
      return await withRetry(() => provider.fetch(ctx));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${provider.name}: ${msg}`);
      console.warn(`[threads] provider ${provider.name} gagal, coba berikutnya: ${msg}`);
    }
  }
  throw new ThreadsApiError(`Semua provider gagal -> ${errors.join(" | ")}`, 502, false);
}

// Verifikasi: `bun run src/sources/threads.ts <url>`
if (import.meta.main) {
  const url = process.argv[2] ?? "https://www.threads.net/@selenagomez/post/CwDORrfL1l8";
  const { username, shortcode } = parseUrl(url);
  const id = await resolvePostIdFromUrl(url);
  console.log("post_id:", id);
  const post = await fetchPostDetail({ postId: id, shortcode: shortcode ?? "", username: username ?? "" });
  console.log({ author: post.authorUsername, content: post.content.slice(0, 100), media: post.media, permalink: post.permalink });
}

// Client Buffer GraphQL API (https://api.buffer.com).
// Auth: header Authorization: Bearer <API_KEY>. Posting via mutation createPost.
import { config } from "../config";
import type { MediaItem } from "../sources/threads";

const ENDPOINT = "https://api.buffer.com";

export class BufferApiError extends Error {
  constructor(message: string, readonly retryable: boolean) {
    super(message);
    this.name = "BufferApiError";
  }
}

async function gql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.buffer.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) {
    throw new BufferApiError(`Buffer HTTP ${res.status}`, res.status === 429 || res.status >= 500);
  }
  const json = (await res.json()) as { data?: T; errors?: { message: string }[] };
  if (json.errors?.length) {
    throw new BufferApiError(`Buffer GraphQL: ${json.errors.map((e) => e.message).join("; ")}`, false);
  }
  return json.data as T;
}

export type CreatePostResult = { postId: string; status: string; dueAt: string | null };

type AssetInput =
  | { image: { url: string } }
  | { video: { url: string; thumbnailUrl?: string } };

function toAsset(m: MediaItem): AssetInput {
  return m.type === "video"
    ? { video: { url: m.url, ...(m.thumbnailUrl ? { thumbnailUrl: m.thumbnailUrl } : {}) } }
    : { image: { url: m.url } };
}

const CREATE_POST = `
mutation($input: CreatePostInput!) {
  createPost(input: $input) {
    __typename
    ... on PostActionSuccess { post { id status dueAt } }
    ... on NotFoundError { message }
    ... on UnauthorizedError { message }
    ... on UnexpectedError { message }
    ... on RestProxyError { message code }
    ... on LimitReachedError { message }
    ... on InvalidInputError { message }
  }
}`;

export type CreatePostOptions = {
  channelId: string;
  text: string;
  media?: MediaItem[];
  /** addToQueue (default) ikut schedule channel; customScheduled butuh dueAt; shareNow langsung. */
  mode?: string;
  dueAt?: Date;
  saveToDraft?: boolean;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Kirim satu post ke Buffer, dengan retry untuk error transient (UnexpectedError/5xx).
 * Throw BufferApiError bila gagal permanen (mis. media benar-benar ditolak). */
export async function createPost(opts: CreatePostOptions, attempts = 3): Promise<CreatePostResult> {
  const assets: AssetInput[] = (opts.media ?? []).map(toAsset);

  const input: Record<string, unknown> = {
    channelId: opts.channelId,
    schedulingType: "automatic",
    mode: opts.mode ?? config.buffer.postMode ?? "addToQueue",
    text: opts.text,
    assets,
  };
  if (opts.dueAt) input.dueAt = opts.dueAt.toISOString();
  if (opts.saveToDraft) input.saveToDraft = true;

  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const data = await gql<{ createPost: any }>(CREATE_POST, { input });
      const payload = data.createPost;
      if (payload.__typename === "PostActionSuccess") {
        return { postId: payload.post.id, status: payload.post.status, dueAt: payload.post.dueAt ?? null };
      }
      // UnexpectedError dari Buffer (mis. gagal fetch dimensi gambar) sering transient.
      const retryable = payload.__typename === "UnexpectedError";
      throw new BufferApiError(`createPost ${payload.__typename}: ${payload.message ?? "?"}`, retryable);
    } catch (err) {
      lastErr = err;
      const retryable = err instanceof BufferApiError ? err.retryable : false;
      if (!retryable || i === attempts - 1) break;
      await sleep(1500 * (i + 1));
    }
  }
  throw lastErr;
}

const POST_STATUS = `query($input: PostInput!) { post(input: $input) { id status sentAt dueAt } }`;

export type BufferPostStatus = { status: string; sentAt: string | null; dueAt: string | null };

/** Ambil status terkini sebuah post Buffer (untuk job sync). */
export async function getPostStatus(postId: string): Promise<BufferPostStatus> {
  const data = await gql<{ post: any }>(POST_STATUS, { input: { id: postId } });
  return { status: data.post.status, sentAt: data.post.sentAt ?? null, dueAt: data.post.dueAt ?? null };
}

const DELETE_POST = `mutation($id: PostId!) { deletePost(input: { id: $id }) { __typename } }`;

/** Hapus post Buffer (dipakai untuk membersihkan draft uji). */
export async function deletePost(postId: string): Promise<void> {
  await gql(DELETE_POST, { id: postId });
}

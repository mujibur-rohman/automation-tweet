// Generate image via kie.ai (async): createTask -> polling recordInfo -> URL gambar.
import { config } from "../config";

const CREATE = "https://api.kie.ai/api/v1/jobs/createTask";
const RECORD = "https://api.kie.ai/api/v1/jobs/recordInfo";

const IN_PROGRESS = ["waiting", "queuing", "queued", "generating", "processing", "pending", "running"];
const FAILED = ["fail", "failed", "error"];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function headers(): Record<string, string> {
  return { Authorization: `Bearer ${config.youtube.kieToken}`, "Content-Type": "application/json" };
}

/** Ambil URL gambar dari resultJson (shape bisa beragam). */
function extractUrl(resultJson: unknown): string | null {
  if (!resultJson) return null;
  let r: any = resultJson;
  if (typeof r === "string") {
    try {
      r = JSON.parse(r);
    } catch {
      return null;
    }
  }
  return (
    r?.resultUrls?.[0] ?? r?.urls?.[0] ?? r?.images?.[0]?.url ?? r?.images?.[0] ?? r?.imageUrl ?? r?.url ?? null
  );
}

/** Generate 1 image, kembalikan URL. Polling sampai selesai (default maks 5 menit). */
export async function generateImage(
  prompt: string,
  opts: { aspectRatio?: string; timeoutMs?: number } = {},
): Promise<string> {
  const createRes = await fetch(CREATE, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      model: config.youtube.imageModel,
      input: { prompt, aspect_ratio: opts.aspectRatio ?? "auto" },
    }),
  });
  const created: any = await createRes.json();
  const taskId = created?.data?.taskId ?? created?.data?.recordId;
  if (!createRes.ok || !taskId) {
    throw new Error(`createTask gagal: ${JSON.stringify(created).slice(0, 200)}`);
  }

  const deadline = Date.now() + (opts.timeoutMs ?? 5 * 60 * 1000);
  while (Date.now() < deadline) {
    await sleep(5000);
    const rec: any = await (await fetch(`${RECORD}?taskId=${taskId}`, { headers: headers() })).json();
    const d = rec?.data ?? {};
    const state = String(d.state ?? "").toLowerCase();

    if (IN_PROGRESS.includes(state)) continue;
    if (FAILED.includes(state) || d.failCode || d.failMsg) {
      throw new Error(`Image gagal: ${d.failMsg ?? d.failCode ?? state}`);
    }
    const url = extractUrl(d.resultJson);
    if (url) return url;
  }
  throw new Error(`Image timeout (taskId ${taskId})`);
}

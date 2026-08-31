import { createHmac, createSign, timingSafeEqual } from "node:crypto";

const MUX_API_ORIGIN = "https://api.mux.com";
const MUX_STREAM_ORIGIN = "https://stream.mux.com";

type MuxConfiguration = {
  tokenId: string;
  tokenSecret: string;
  webhookSecret: string;
  signingKeyId: string;
  privateKey: string;
};

export type MuxDirectUpload = { id: string; url: string; status?: string; asset_id?: string | null };
export type MuxAsset = {
  id: string;
  status?: string;
  passthrough?: string;
  duration?: number;
  aspect_ratio?: string;
  max_resolution_tier?: string;
  playback_ids?: Array<{ id: string; policy: string }>;
  static_renditions?: { files?: Array<{ name?: string; status?: string; resolution?: string }> } | Array<{ name?: string; status?: string; resolution?: string }>;
  errors?: { messages?: string[] };
};

function configuration(): MuxConfiguration | null {
  if (process.env.MUX_VIDEO_ENABLED !== "true") return null;
  const tokenId = process.env.MUX_TOKEN_ID?.trim() || "";
  const tokenSecret = process.env.MUX_TOKEN_SECRET?.trim() || "";
  const webhookSecret = process.env.MUX_WEBHOOK_SECRET?.trim() || "";
  const signingKeyId = process.env.MUX_SIGNING_KEY_ID?.trim() || "";
  const privateKey = process.env.MUX_PRIVATE_KEY?.trim() || "";
  return tokenId && tokenSecret && webhookSecret && signingKeyId && privateKey
    ? { tokenId, tokenSecret, webhookSecret, signingKeyId, privateKey }
    : null;
}

export function muxVideoEnabled(): boolean {
  return Boolean(configuration());
}

function apiAuthorization(config: MuxConfiguration): string {
  return `Basic ${Buffer.from(`${config.tokenId}:${config.tokenSecret}`).toString("base64")}`;
}

async function muxRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const config = configuration();
  if (!config) throw new Error("Die sichere Mux-Videopipeline ist noch nicht vollständig konfiguriert");
  const response = await fetch(`${MUX_API_ORIGIN}${path}`, {
    ...init,
    headers: {
      Authorization: apiAuthorization(config),
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    if (response.status === 404 && init.method === "DELETE") return undefined as T;
    throw new Error(`Mux-Anfrage fehlgeschlagen (${response.status})${detail ? `: ${detail.slice(0, 300)}` : ""}`);
  }
  if (response.status === 204) return undefined as T;
  const body = await response.json() as { data: T };
  return body.data;
}

export async function createMuxDirectUpload(origin: string, contentId: string, title: string): Promise<MuxDirectUpload> {
  return muxRequest<MuxDirectUpload>("/video/v1/uploads", {
    method: "POST",
    body: JSON.stringify({
      cors_origin: origin,
      timeout: 24 * 60 * 60,
      new_asset_settings: {
        passthrough: contentId,
        playback_policies: ["signed"],
        // SwissCompact displays show professional branded content on large panels.
        // Mux Basic visibly over-compresses detailed footage; Plus uses the
        // higher-quality per-title encoding ladder intended for this use case.
        video_quality: "plus",
        static_renditions: [{ resolution: "highest", passthrough: contentId }],
        meta: { title: title.slice(0, 512), external_id: contentId },
      },
    }),
  });
}

export async function getMuxDirectUpload(uploadId: string): Promise<MuxDirectUpload> {
  return muxRequest<MuxDirectUpload>(`/video/v1/uploads/${encodeURIComponent(uploadId)}`);
}

export async function getMuxAsset(assetId: string): Promise<MuxAsset> {
  return muxRequest<MuxAsset>(`/video/v1/assets/${encodeURIComponent(assetId)}`);
}

export async function deleteMuxDirectUpload(uploadId: string): Promise<void> {
  await muxRequest<void>(`/video/v1/uploads/${encodeURIComponent(uploadId)}`, { method: "DELETE" });
}

export async function deleteMuxAsset(assetId: string): Promise<void> {
  await muxRequest<void>(`/video/v1/assets/${encodeURIComponent(assetId)}`, { method: "DELETE" });
}

function base64Url(value: Buffer | string): string {
  return Buffer.from(value).toString("base64url");
}

function signingPrivateKey(value: string): Buffer {
  if (value.includes("BEGIN PRIVATE KEY")) return Buffer.from(value.replace(/\\n/g, "\n"));
  return Buffer.from(value, "base64");
}

export function muxSignedPlaybackUrl(playbackId: string, renditionName = "highest.mp4", expiresInSeconds = 24 * 60 * 60): string {
  const config = configuration();
  if (!config) throw new Error("Die sichere Mux-Wiedergabe ist noch nicht konfiguriert");
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT", kid: config.signingKeyId }));
  const payload = base64Url(JSON.stringify({
    sub: playbackId,
    aud: "v",
    exp: Math.floor(Date.now() / 1000) + Math.max(300, expiresInSeconds),
    kid: config.signingKeyId,
  }));
  const unsigned = `${header}.${payload}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();
  const signature = signer.sign(signingPrivateKey(config.privateKey)).toString("base64url");
  return `${MUX_STREAM_ORIGIN}/${encodeURIComponent(playbackId)}/${encodeURIComponent(renditionName)}?token=${unsigned}.${signature}`;
}

export function muxReadyRendition(asset: MuxAsset): { playbackId: string; renditionName: string } | null {
  const playbackId = asset.playback_ids?.find((entry) => entry.policy === "signed")?.id;
  const files = Array.isArray(asset.static_renditions) ? asset.static_renditions : asset.static_renditions?.files || [];
  const rendition = files.find((entry) => entry.status === "ready" && entry.name?.endsWith(".mp4"));
  return playbackId && rendition?.name ? { playbackId, renditionName: rendition.name } : null;
}

export function verifyMuxWebhook(rawBody: string, signatureHeader: string | null, toleranceSeconds = 300): boolean {
  const config = configuration();
  if (!config || !signatureHeader) return false;
  const values = new Map(signatureHeader.split(",").map((part) => {
    const [key, ...rest] = part.trim().split("=");
    return [key, rest.join("=")];
  }));
  const timestamp = values.get("t") || "";
  const supplied = values.get("v1") || "";
  if (!/^\d+$/.test(timestamp) || !/^[a-f0-9]{64}$/i.test(supplied)) return false;
  if (Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp)) > toleranceSeconds) return false;
  const expected = createHmac("sha256", config.webhookSecret).update(`${timestamp}.${rawBody}`).digest();
  const received = Buffer.from(supplied, "hex");
  return expected.length === received.length && timingSafeEqual(expected, received);
}

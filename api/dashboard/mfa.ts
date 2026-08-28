import { authorizeDashboard, isResponse, sessionClient, sessionCookieHeaders } from "../_lib/dashboard/auth.js";
import { json, validatePublicPost } from "../_lib/assistant/security.js";

export async function POST(request: Request): Promise<Response> {
  const guard = validatePublicPost(request, {
    key: "dashboard-mfa",
    limit: 12,
    windowMs: 10 * 60_000,
    contentTypes: ["application/json"],
    maxBytes: 8_000,
  });
  if (guard) return guard;
  const authorized = await authorizeDashboard(request, false);
  if (isResponse(authorized)) return authorized;
  const session = await sessionClient(request);
  if (!session) return json({ error: "Sitzung abgelaufen" }, { status: 401 });
  const body = await request.json() as Record<string, unknown>;
  const action = body.action;
  if (action === "enroll") {
    const { data, error } = await session.client.auth.mfa.enroll({ factorType: "totp", friendlyName: "SwissCompact Dashboard" });
    if (error) return json({ error: error.message }, { status: 400 });
    return json({ factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret });
  }
  if (action === "verify") {
    const factorId = typeof body.factorId === "string" ? body.factorId : "";
    const code = typeof body.code === "string" ? body.code.replace(/\s/g, "") : "";
    if (!factorId || !/^\d{6}$/.test(code)) return json({ error: "Ungültiger Sicherheitscode" }, { status: 400 });
    const challenge = await session.client.auth.mfa.challenge({ factorId });
    if (challenge.error) return json({ error: challenge.error.message }, { status: 400 });
    const verified = await session.client.auth.mfa.verify({ factorId, challengeId: challenge.data.id, code });
    if (verified.error || !verified.data.access_token || !verified.data.refresh_token) {
      return json({ error: verified.error?.message || "Code konnte nicht bestätigt werden" }, { status: 400 });
    }
    return json({ ok: true }, {
      headers: sessionCookieHeaders(
        verified.data.access_token,
        verified.data.refresh_token,
        verified.data.expires_in,
      ),
    });
  }
  return json({ error: "Unbekannte MFA-Aktion" }, { status: 400 });
}

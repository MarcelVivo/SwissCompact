import { authorizeDashboard, isResponse, sessionClient, sessionCookieHeaders, writeAudit } from "../_lib/dashboard/auth.js";
import { json, validatePublicPost } from "../_lib/assistant/security.js";

type JsonRecord = Record<string, unknown>;

function webauthnSite(request: Request): { rpId: string; rpOrigins: string[] } | null {
  const current = new URL(request.url);
  if (current.hostname === "www.swisscompact.com" || current.hostname === "swisscompact.com") {
    return { rpId: "swisscompact.com", rpOrigins: ["https://www.swisscompact.com", "https://swisscompact.com"] };
  }
  if (current.hostname === "localhost" || current.hostname === "127.0.0.1") {
    return { rpId: "localhost", rpOrigins: [`${current.protocol}//${current.host}`] };
  }
  return null;
}

async function supabaseAuthRequest(
  path: string,
  accessToken: string,
  body: JsonRecord,
): Promise<{ data?: JsonRecord; error?: string }> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return { error: "Dashboard ist noch nicht konfiguriert" };
  const response = await fetch(`${url.replace(/\/$/, "")}/auth/v1/${path}`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({})) as JsonRecord;
  if (!response.ok) {
    if (payload.code === "mfa_webauthn_enroll_not_enabled") return { error: "Face ID muss zuerst in Supabase unter Authentication → Multi-Factor aktiviert werden" };
    if (payload.code === "mfa_webauthn_verify_not_enabled") return { error: "Die Face-ID-Bestätigung ist in Supabase noch nicht aktiviert" };
    const message = typeof payload.message === "string" ? payload.message : typeof payload.error_description === "string" ? payload.error_description : "Face ID konnte nicht verarbeitet werden";
    return { error: message };
  }
  return { data: payload };
}

function verifiedWebauthnFactor(session: Awaited<ReturnType<typeof sessionClient>>, factorId: string) {
  return session?.user.factors?.find((factor) => factor.id === factorId && factor.factor_type === "webauthn" && factor.status === "verified");
}

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
  if (action === "webauthn_enroll_start") {
    const fullyAuthorized = await authorizeDashboard(request, true);
    if (isResponse(fullyAuthorized)) return fullyAuthorized;
    const site = webauthnSite(request);
    if (!site) return json({ error: "Face ID kann aus Sicherheitsgründen nur auf www.swisscompact.com eingerichtet werden" }, { status: 400 });
    const factors = await session.client.auth.mfa.listFactors();
    if (factors.error) return json({ error: factors.error.message }, { status: 400 });
    const existing = factors.data.all.find((factor) => factor.factor_type === "webauthn" && factor.status === "verified");
    if (existing) return json({ error: "Face ID ist für dieses Konto bereits eingerichtet" }, { status: 409 });
    for (const factor of factors.data.all.filter((entry) => entry.factor_type === "webauthn" && entry.status !== "verified")) {
      await session.client.auth.mfa.unenroll({ factorId: factor.id });
    }
    const enrolled = await session.client.auth.mfa.enroll({ factorType: "webauthn", friendlyName: "iPhone Face ID" });
    if (enrolled.error) return json({ error: enrolled.error.message }, { status: 400 });
    const challenge = await supabaseAuthRequest(`factors/${enrolled.data.id}/challenge`, session.accessToken, {
      factorId: enrolled.data.id,
      webauthn: site,
    });
    if (challenge.error || !challenge.data) {
      await session.client.auth.mfa.unenroll({ factorId: enrolled.data.id });
      return json({ error: challenge.error }, { status: 400 });
    }
    return json({ factorId: enrolled.data.id, mode: "create", challenge: challenge.data });
  }
  if (action === "webauthn_challenge") {
    const site = webauthnSite(request);
    const factorId = typeof body.factorId === "string" ? body.factorId : "";
    if (!site) return json({ error: "Face ID ist auf dieser Adresse nicht verfügbar" }, { status: 400 });
    if (!factorId || !verifiedWebauthnFactor(session, factorId)) return json({ error: "Kein gültiger Face-ID-Schlüssel gefunden" }, { status: 400 });
    const challenge = await supabaseAuthRequest(`factors/${factorId}/challenge`, session.accessToken, { factorId, webauthn: site });
    if (challenge.error || !challenge.data) return json({ error: challenge.error }, { status: 400 });
    return json({ factorId, mode: "request", challenge: challenge.data });
  }
  if (action === "webauthn_verify") {
    const factorId = typeof body.factorId === "string" ? body.factorId : "";
    const challengeId = typeof body.challengeId === "string" ? body.challengeId : "";
    const mode = body.mode === "create" ? "create" : "request";
    const credential = body.credential && typeof body.credential === "object" ? body.credential as JsonRecord : null;
    const site = webauthnSite(request);
    if (!site || !factorId || !challengeId || !credential) return json({ error: "Ungültige Face-ID-Anfrage" }, { status: 400 });
    if (mode === "request" && !verifiedWebauthnFactor(session, factorId)) return json({ error: "Kein gültiger Face-ID-Schlüssel gefunden" }, { status: 400 });
    const enrollmentAuthorization = mode === "create" ? await authorizeDashboard(request, true) : null;
    if (isResponse(enrollmentAuthorization)) return enrollmentAuthorization;
    const verified = await supabaseAuthRequest(`factors/${factorId}/verify`, session.accessToken, {
      challenge_id: challengeId,
      webauthn: { ...site, type: mode, credential_response: credential },
    });
    const accessToken = typeof verified.data?.access_token === "string" ? verified.data.access_token : "";
    const refreshToken = typeof verified.data?.refresh_token === "string" ? verified.data.refresh_token : "";
    const expiresIn = typeof verified.data?.expires_in === "number" ? verified.data.expires_in : 3600;
    if (verified.error || !accessToken || !refreshToken) return json({ error: verified.error || "Face ID konnte nicht bestätigt werden" }, { status: 400 });
    if (enrollmentAuthorization) await writeAudit(enrollmentAuthorization.client, enrollmentAuthorization.profile, "webauthn_enrolled", "dashboard_security", factorId);
    return json({ ok: true, enrolled: mode === "create" }, { headers: sessionCookieHeaders(accessToken, refreshToken, expiresIn) });
  }
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

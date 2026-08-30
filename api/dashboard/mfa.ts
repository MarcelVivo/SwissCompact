import { authorizeDashboard, dashboardSupabase, ensureProfile, isBuiltInAdmin, isResponse, sessionClient, sessionCookieHeaders, writeAudit } from "../_lib/dashboard/auth.js";
import { json, validatePublicPost } from "../_lib/assistant/security.js";

// TOTP and native Supabase Passkeys share this endpoint to keep the
// deployment within Vercel Hobby's serverless-function limit.
export async function POST(request: Request): Promise<Response> {
  const guard = validatePublicPost(request, {
    key: "dashboard-mfa",
    limit: 12,
    windowMs: 10 * 60_000,
    contentTypes: ["application/json"],
    maxBytes: 8_000,
  });
  if (guard) return guard;
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const action = body.action;
  if (action === "passkey_login") {
    const accessToken = typeof body.accessToken === "string" ? body.accessToken : "";
    const refreshToken = typeof body.refreshToken === "string" ? body.refreshToken : "";
    if (!accessToken || !refreshToken) return json({ error: "Ungültige Anmeldedaten" }, { status: 400 });
    const authClient = dashboardSupabase();
    if (!authClient) return json({ error: "Dashboard ist noch nicht konfiguriert" }, { status: 503 });
    const { data, error } = await authClient.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
    if (error || !data.session || !data.user) return json({ error: "Face-ID-Anmeldung konnte nicht bestätigt werden" }, { status: 401 });
    const email = data.user.email?.toLowerCase() ?? "";
    if (!isBuiltInAdmin(email)) return json({ error: "Kein Dashboard-Zugriff" }, { status: 403 });
    const profileClient = dashboardSupabase();
    const profile = profileClient ? await ensureProfile(profileClient, data.user) : null;
    if (!profile) return json({ error: "Adminprofil fehlt. Bitte zuerst die Datenbankmigration ausführen." }, { status: 503 });
    return json({ ok: true, profile }, {
      headers: sessionCookieHeaders(data.session.access_token, data.session.refresh_token, data.session.expires_in),
    });
  }

  const passkeyAction = typeof action === "string" && action.startsWith("passkey_");
  const authorized = await authorizeDashboard(request, passkeyAction);
  if (isResponse(authorized)) return authorized;
  const session = await sessionClient(request);
  if (!session) return json({ error: "Sitzung abgelaufen" }, { status: 401 });
  if (action === "passkey_bridge_tokens") {
    return json({ accessToken: session.accessToken, refreshToken: session.refreshToken });
  }
  if (action === "passkey_list") {
    const { data, error } = await session.client.auth.passkey.list();
    if (error) return json({ error: error.message }, { status: 400 });
    return json({ passkeys: data ?? [] });
  }
  if (action === "passkey_delete") {
    const passkeyId = typeof body.passkeyId === "string" ? body.passkeyId : "";
    if (!passkeyId) return json({ error: "Ungültiger Passkey" }, { status: 400 });
    const { error } = await session.client.auth.passkey.delete({ passkeyId });
    if (error) return json({ error: error.message }, { status: 400 });
    await writeAudit(authorized.client, authorized.profile, "passkey_deleted", "dashboard_security", passkeyId);
    return json({ ok: true });
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

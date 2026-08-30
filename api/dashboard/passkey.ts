import { authorizeDashboard, dashboardSupabase, ensureProfile, isBuiltInAdmin, isResponse, sessionClient, sessionCookieHeaders, writeAudit } from "../_lib/dashboard/auth.js";
import { json, validatePublicPost } from "../_lib/assistant/security.js";

export const config = { runtime: "nodejs", maxDuration: 15 };

export async function POST(request: Request): Promise<Response> {
  const guard = validatePublicPost(request, {
    key: "dashboard-passkey",
    limit: 12,
    windowMs: 10 * 60_000,
    contentTypes: ["application/json"],
    maxBytes: 8_000,
  });
  if (guard) return guard;
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const action = body.action;

  if (action === "login") {
    // Public: bridges a freshly-created client-side passkey session (from
    // auth.signInWithPasskey() in the browser) into this app's own httpOnly
    // session cookies, the same way password login already does.
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

  // Everything below needs an already-authorized dashboard session (password
  // + TOTP, or an earlier passkey login) — matches Supabase's own
  // "registerPasskey() requires an active session" requirement, and keeps
  // listing/deleting passkeys from being reachable before that.
  const authorized = await authorizeDashboard(request, true);
  if (isResponse(authorized)) return authorized;
  const session = await sessionClient(request);
  if (!session) return json({ error: "Sitzung abgelaufen" }, { status: 401 });

  if (action === "bridge_tokens") {
    // Hands the browser its own already-valid session tokens so it can set
    // up a short-lived, separate Supabase client instance and call
    // registerPasskey() there — the WebAuthn ceremony (navigator.credentials
    // .create()) only runs in the browser, so the SDK's high-level helper
    // needs a live client-side session, not a server-proxied call.
    return json({ accessToken: session.accessToken, refreshToken: session.refreshToken });
  }

  if (action === "list") {
    const { data, error } = await session.client.auth.passkey.list();
    if (error) return json({ error: error.message }, { status: 400 });
    return json({ passkeys: data ?? [] });
  }

  if (action === "delete") {
    const passkeyId = typeof body.passkeyId === "string" ? body.passkeyId : "";
    if (!passkeyId) return json({ error: "Ungültiger Passkey" }, { status: 400 });
    const { error } = await session.client.auth.passkey.delete({ passkeyId });
    if (error) return json({ error: error.message }, { status: 400 });
    await writeAudit(authorized.client, authorized.profile, "passkey_deleted", "dashboard_security", passkeyId);
    return json({ ok: true });
  }

  return json({ error: "Unbekannte Passkey-Aktion" }, { status: 400 });
}

import {
  activatePendingPortalMembership,
  authorizeDashboard,
  authorizePortal,
  currentSecuritySessionHash,
  dashboardSupabase,
  ensurePortalProfile,
  ensureProfile,
  isBuiltInAdmin,
  isResponse,
  recordSecuritySession,
  sessionClient,
  sessionCookieHeaders,
  writeAudit,
} from "../_lib/dashboard/auth.js";
import { json, validatePublicPost } from "../_lib/assistant/security.js";

type Audience = "dashboard" | "portal";

async function authorizeSecurity(request: Request, audience: Audience, requireStrong: boolean) {
  return audience === "portal" ? authorizePortal(request, requireStrong) : authorizeDashboard(request, requireStrong);
}

async function auditSecurity(client: any, authorized: any, audience: Audience, action: string, entityId?: string): Promise<void> {
  if (audience === "portal") {
    await client.from("tenant_audit_log").insert({
      tenant_id: authorized.profile.tenantId,
      actor_user_id: authorized.profile.userId,
      action,
      entity_type: "portal_security",
      entity_id: entityId || null,
      metadata: {},
    });
  } else {
    await writeAudit(client, authorized.profile, action, "dashboard_security", entityId);
  }
}

// TOTP and native Supabase Passkeys share this endpoint so both the internal
// dashboard and customer portal use the same audited security rules.
export async function POST(request: Request): Promise<Response> {
  const guard = validatePublicPost(request, {
    key: "dashboard-mfa",
    limit: 30,
    windowMs: 10 * 60_000,
    contentTypes: ["application/json"],
    maxBytes: 12_000,
  });
  if (guard) return guard;
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const action = typeof body.action === "string" ? body.action : "";
  const audience: Audience = body.audience === "portal" ? "portal" : "dashboard";

  if (action === "passkey_login") {
    const accessToken = typeof body.accessToken === "string" ? body.accessToken : "";
    const refreshToken = typeof body.refreshToken === "string" ? body.refreshToken : "";
    if (!accessToken || !refreshToken) return json({ error: "Ungültige Anmeldedaten" }, { status: 400 });
    const authClient = dashboardSupabase();
    if (!authClient) return json({ error: "Anmeldung ist noch nicht konfiguriert" }, { status: 503 });
    const { data, error } = await authClient.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
    if (error || !data.session || !data.user) return json({ error: "Passkey-Anmeldung konnte nicht bestätigt werden" }, { status: 401 });

    if (audience === "portal") {
      await activatePendingPortalMembership(data.user);
      const profile = await ensurePortalProfile(authClient, data.user, request);
      if (!profile) return json({ error: "Kein Portal-Zugriff" }, { status: 403 });
      await recordSecuritySession(request, data.user.id, "portal", data.session.access_token, data.session.refresh_token, profile.tenantId);
      return json({ ok: true, profile }, { headers: sessionCookieHeaders(data.session.access_token, data.session.refresh_token, data.session.expires_in) });
    }

    const email = data.user.email?.toLowerCase() ?? "";
    if (!isBuiltInAdmin(email)) return json({ error: "Kein Dashboard-Zugriff" }, { status: 403 });
    const profileClient = dashboardSupabase();
    const profile = profileClient ? await ensureProfile(profileClient, data.user) : null;
    if (!profile) return json({ error: "Adminprofil fehlt. Bitte zuerst die Datenbankmigration ausführen." }, { status: 503 });
    await recordSecuritySession(request, data.user.id, "dashboard", data.session.access_token, data.session.refresh_token);
    return json({ ok: true, profile }, { headers: sessionCookieHeaders(data.session.access_token, data.session.refresh_token, data.session.expires_in) });
  }

  // Erstregistrierung und Codeprüfung müssen aus einer gültigen AAL1-Sitzung
  // möglich sein; alle Verwaltungsaktionen verlangen eine starke Sitzung.
  const authorized = await authorizeSecurity(request, audience, !["enroll", "verify"].includes(action));
  if (isResponse(authorized)) return authorized;
  const session = await sessionClient(request);
  if (!session) return json({ error: "Sitzung abgelaufen" }, { status: 401 });

  if (action === "security_status") {
    const [factors, passkeys] = await Promise.all([session.client.auth.mfa.listFactors(), session.client.auth.passkey.list()]);
    if (factors.error) return json({ error: factors.error.message }, { status: 400 });
    const admin = dashboardSupabase();
    const currentHash = currentSecuritySessionHash(request);
    const devices = admin
      ? await admin.from("user_security_sessions").select("id,session_hash,audience,device_label,browser_name,operating_system,created_at,last_seen_at,revoked_at").eq("user_id", session.user.id).is("revoked_at", null).gte("last_seen_at", new Date(Date.now() - 30 * 24 * 60 * 60_000).toISOString()).order("last_seen_at", { ascending: false }).limit(30)
      : null;
    return json({
      aal: authorized.profile.aal,
      passkeyVerified: authorized.profile.passkeyVerified,
      factors: [...(factors.data?.totp ?? []), ...(factors.data?.phone ?? [])].filter((factor: any) => factor.status === "verified"),
      passkeys: passkeys.error ? [] : passkeys.data ?? [],
      devicesAvailable: Boolean(admin && !devices?.error),
      devices: (devices?.data ?? []).map((device: any) => ({ ...device, current: device.session_hash === currentHash, session_hash: undefined })),
    });
  }

  if (action === "passkey_bridge_tokens") return json({ accessToken: session.accessToken, refreshToken: session.refreshToken });

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
    await auditSecurity(authorized.client, authorized, audience, "passkey_deleted", passkeyId);
    return json({ ok: true });
  }

  if (action === "enroll") {
    const friendlyName = audience === "portal" ? "SwissCompact Kundenportal" : "SwissCompact Dashboard";
    const { data, error } = await session.client.auth.mfa.enroll({ factorType: "totp", friendlyName });
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
    if (verified.error || !verified.data.access_token || !verified.data.refresh_token) return json({ error: verified.error?.message || "Code konnte nicht bestätigt werden" }, { status: 400 });
    const tenantId = audience === "portal" && "tenantId" in authorized.profile
      ? authorized.profile.tenantId
      : null;
    await recordSecuritySession(request, session.user.id, audience, verified.data.access_token, verified.data.refresh_token, tenantId);
    await auditSecurity(authorized.client, authorized, audience, "mfa_verified", factorId);
    return json({ ok: true }, { headers: sessionCookieHeaders(verified.data.access_token, verified.data.refresh_token, verified.data.expires_in) });
  }

  if (action === "unenroll") {
    const factorId = typeof body.factorId === "string" ? body.factorId : "";
    if (!factorId) return json({ error: "Sicherheitsfaktor fehlt" }, { status: 400 });
    const removed = await session.client.auth.mfa.unenroll({ factorId });
    if (removed.error) return json({ error: removed.error.message }, { status: 400 });
    await auditSecurity(authorized.client, authorized, audience, "mfa_factor_removed", factorId);
    return json({ ok: true });
  }

  if (action === "sign_out_others") {
    const result = await session.client.auth.signOut({ scope: "others" });
    if (result.error) return json({ error: result.error.message }, { status: 400 });
    const admin = dashboardSupabase();
    const currentHash = currentSecuritySessionHash(request);
    if (admin && currentHash) await admin.from("user_security_sessions").update({ revoked_at: new Date().toISOString() }).eq("user_id", session.user.id).neq("session_hash", currentHash).is("revoked_at", null);
    await auditSecurity(authorized.client, authorized, audience, "other_sessions_revoked");
    return json({ ok: true });
  }

  return json({ error: "Unbekannte Sicherheitsaktion" }, { status: 400 });
}

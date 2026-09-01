import { activatePendingPortalMembership, dashboardSupabase, ensurePortalProfile, ensureProfile, isBuiltInAdmin, recordSecuritySession, sessionCookieHeaders } from "../_lib/dashboard/auth.js";
import { json, validatePublicPost } from "../_lib/assistant/security.js";

export const config = { runtime: "nodejs", maxDuration: 15 };

export async function POST(request: Request): Promise<Response> {
  const guard = validatePublicPost(request, {
    key: "dashboard-login",
    limit: 8,
    windowMs: 15 * 60_000,
    contentTypes: ["application/json"],
    maxBytes: 8_000,
  });
  if (guard) return guard;
  const authClient = dashboardSupabase();
  if (!authClient) return json({ error: "Dashboard ist noch nicht konfiguriert" }, { status: 503 });
  try {
    const body = await request.json() as Record<string, unknown>;
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    const audience = body.audience === "portal" ? "portal" : "dashboard";
    if (audience === "dashboard" && !isBuiltInAdmin(email)) return json({ error: "Kein Dashboard-Zugriff" }, { status: 403 });
    const { data, error } = await authClient.auth.signInWithPassword({ email, password });
    if (error || !data.session || !data.user) return json({ error: "E-Mail oder Passwort ist falsch" }, { status: 401 });
    if (audience === "portal") {
      if (!data.user.email_confirmed_at) {
        return json({ error: "Bitte bestätigen Sie zuerst Ihre E-Mail-Adresse. Öffnen Sie dafür die Nachricht von SwissCompact." }, { status: 403 });
      }
      await activatePendingPortalMembership(data.user);
      const portalProfile = await ensurePortalProfile(authClient, data.user, request);
      if (!portalProfile) return json({ error: "Für dieses Konto ist kein registriertes und verifiziertes Kundenportal freigeschaltet" }, { status: 403 });
      await recordSecuritySession(request, data.user.id, "portal", data.session.access_token, data.session.refresh_token, portalProfile.tenantId);
      const verifiedFactors = data.user.factors?.filter((factor) => factor.status === "verified") ?? [];
      const totpFactor = verifiedFactors.find((factor) => factor.factor_type === "totp");
      return json({
        ok: true,
        audience,
        profile: portalProfile,
        mfaRequired: verifiedFactors.length > 0 && portalProfile.aal !== "aal2" && !portalProfile.passkeyVerified,
        factorId: totpFactor?.id ?? verifiedFactors[0]?.id,
        totpFactorId: totpFactor?.id,
      }, {
        headers: sessionCookieHeaders(data.session.access_token, data.session.refresh_token, data.session.expires_in),
      });
    }
    // Auth- und Admin-Client bleiben getrennt: Nach signIn verwendet der
    // Auth-Client das Benutzer-JWT und darf sein erstes RLS-Profil noch nicht
    // selbst anlegen. Der separate Service-Client provisioniert nur die zwei
    // fest eingebauten Admins.
    const profileClient = dashboardSupabase();
    const profile = profileClient ? await ensureProfile(profileClient, data.user) : null;
    if (!profile) return json({ error: "Adminprofil fehlt. Bitte zuerst die Datenbankmigration ausführen." }, { status: 503 });
    await recordSecuritySession(request, data.user.id, "dashboard", data.session.access_token, data.session.refresh_token);
    const verifiedFactors = data.user.factors?.filter((factor) => factor.status === "verified") ?? [];
    const totpFactor = verifiedFactors.find((factor) => factor.factor_type === "totp");
    return json({
      ok: true,
      audience,
      profile,
      mfaRequired: verifiedFactors.length > 0 && profile.aal !== "aal2",
      mfaEnrollmentRequired: verifiedFactors.length === 0,
      factorId: totpFactor?.id ?? verifiedFactors[0]?.id,
      totpFactorId: totpFactor?.id,
    }, { headers: sessionCookieHeaders(data.session.access_token, data.session.refresh_token, data.session.expires_in) });
  } catch {
    return json({ error: "Anmeldung konnte nicht verarbeitet werden" }, { status: 400 });
  }
}

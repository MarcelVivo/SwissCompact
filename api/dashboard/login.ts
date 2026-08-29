import { dashboardSupabase, ensureProfile, isBuiltInAdmin, sessionCookieHeaders } from "../_lib/dashboard/auth.js";
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
    if (!isBuiltInAdmin(email)) return json({ error: "Kein Dashboard-Zugriff" }, { status: 403 });
    const { data, error } = await authClient.auth.signInWithPassword({ email, password });
    if (error || !data.session || !data.user) return json({ error: "E-Mail oder Passwort ist falsch" }, { status: 401 });
    // Auth- und Admin-Client bleiben getrennt: Nach signIn verwendet der
    // Auth-Client das Benutzer-JWT und darf sein erstes RLS-Profil noch nicht
    // selbst anlegen. Der separate Service-Client provisioniert nur die zwei
    // fest eingebauten Admins.
    const profileClient = dashboardSupabase();
    const profile = profileClient ? await ensureProfile(profileClient, data.user) : null;
    if (!profile) return json({ error: "Adminprofil fehlt. Bitte zuerst die Datenbankmigration ausführen." }, { status: 503 });
    const verifiedFactors = data.user.factors?.filter((factor) => factor.status === "verified") ?? [];
    const webauthnFactor = verifiedFactors.find((factor) => factor.factor_type === "webauthn");
    const totpFactor = verifiedFactors.find((factor) => factor.factor_type === "totp");
    return json({
      ok: true,
      profile,
      mfaRequired: verifiedFactors.length > 0 && profile.aal !== "aal2",
      mfaEnrollmentRequired: verifiedFactors.length === 0,
      factorId: totpFactor?.id ?? verifiedFactors[0]?.id,
      totpFactorId: totpFactor?.id,
      webauthnFactorId: webauthnFactor?.id,
    }, { headers: sessionCookieHeaders(data.session.access_token, data.session.refresh_token, data.session.expires_in) });
  } catch {
    return json({ error: "Anmeldung konnte nicht verarbeitet werden" }, { status: 400 });
  }
}

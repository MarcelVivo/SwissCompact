import { clearSessionCookieHeaders, currentSecuritySessionHash, dashboardSupabase, sessionClient } from "../_lib/dashboard/auth.js";
import { json, validatePublicPost } from "../_lib/assistant/security.js";

export async function POST(request: Request): Promise<Response> {
  const guard = validatePublicPost(request, {
    key: "dashboard-logout",
    limit: 30,
    windowMs: 10 * 60_000,
    contentTypes: ["application/json"],
    maxBytes: 1_000,
  });
  if (guard) return guard;
  const session = await sessionClient(request);
  if (session) {
    await session.client.auth.signOut({ scope: "local" }).catch(() => undefined);
    const hash = currentSecuritySessionHash(request);
    const admin = dashboardSupabase();
    if (hash && admin) await admin.from("user_security_sessions").update({ revoked_at: new Date().toISOString() }).eq("session_hash", hash).eq("user_id", session.user.id);
  }
  return json({ ok: true }, { headers: clearSessionCookieHeaders() });
}

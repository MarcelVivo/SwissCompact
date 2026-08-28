import { clearSessionCookieHeaders } from "../_lib/dashboard/auth.js";
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
  return json({ ok: true }, { headers: clearSessionCookieHeaders() });
}

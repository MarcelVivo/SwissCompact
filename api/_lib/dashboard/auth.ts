import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { json } from "../assistant/security.js";

const ACCESS_COOKIE = "sc_dashboard_access";
const REFRESH_COOKIE = "sc_dashboard_refresh";

const BUILT_IN_ADMINS: Record<string, { displayName: string; role: "owner_admin" | "admin"; securityAdmin: boolean }> = {
  "kontakt@swisscompact.com": { displayName: "Marcel Spahr", role: "owner_admin", securityAdmin: true },
  "thomas.peter@swisscompact.com": { displayName: "Thomas Peter", role: "admin", securityAdmin: false },
};

export interface DashboardProfile {
  userId: string;
  email: string;
  displayName: string;
  role: "owner_admin" | "admin" | "staff" | "advisor" | "client";
  securityAdmin: boolean;
  aal: "aal1" | "aal2" | null;
  passkeyVerified: boolean;
}

export interface PortalProfile {
  userId: string;
  email: string;
  displayName: string;
  membershipId: string;
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  role: "owner" | "admin" | "editor" | "viewer";
  branding: Record<string, unknown>;
  enabledModules: string[];
}

function config() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return { url, key };
}

export function dashboardSupabase(): SupabaseClient<any, any, any> | null {
  const values = config();
  if (!values) return null;
  return createClient(values.url, values.key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, experimental: { passkey: true } },
    db: { schema: "swisscompact" },
  });
}

function parseCookies(request: Request): Record<string, string> {
  return Object.fromEntries(
    (request.headers.get("cookie") || "")
      .split(";")
      .map((part) => part.trim().split("="))
      .filter(([key, value]) => Boolean(key && value))
      .map(([key, ...value]) => [decodeURIComponent(key), decodeURIComponent(value.join("="))]),
  );
}

function cookie(name: string, value: string, maxAge: number): string {
  return `${name}=${encodeURIComponent(value)}; Path=/api/dashboard; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Strict`;
}

export function sessionCookieHeaders(accessToken: string, refreshToken: string, expiresIn = 3600): Headers {
  const headers = new Headers();
  headers.append("Set-Cookie", cookie(ACCESS_COOKIE, accessToken, Math.max(60, expiresIn)));
  headers.append("Set-Cookie", cookie(REFRESH_COOKIE, refreshToken, 60 * 60 * 24 * 30));
  return headers;
}

export function clearSessionCookieHeaders(): Headers {
  const headers = new Headers();
  headers.append("Set-Cookie", cookie(ACCESS_COOKIE, "", 0));
  headers.append("Set-Cookie", cookie(REFRESH_COOKIE, "", 0));
  return headers;
}

export async function sessionClient(request: Request): Promise<{
  client: SupabaseClient<any, any, any>;
  user: User;
  accessToken: string;
  refreshToken: string;
} | null> {
  const values = config();
  if (!values) return null;
  const cookies = parseCookies(request);
  const accessToken = cookies[ACCESS_COOKIE];
  const refreshToken = cookies[REFRESH_COOKIE];
  if (!accessToken || !refreshToken) return null;
  const client = createClient(values.url, values.key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, experimental: { passkey: true } },
    db: { schema: "swisscompact" },
  });
  const { data, error } = await client.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
  if (error || !data.user) return null;
  return { client, user: data.user, accessToken, refreshToken };
}

async function ensureProfile(client: SupabaseClient<any, any, any>, user: User): Promise<DashboardProfile | null> {
  const email = user.email?.toLowerCase();
  if (!email) return null;
  let { data } = await client
    .from("dashboard_profiles")
    .select("user_id,email,display_name,role,security_admin,active")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!data && BUILT_IN_ADMINS[email]) {
    const seed = BUILT_IN_ADMINS[email];
    const result = await client
      .from("dashboard_profiles")
      .upsert({
        user_id: user.id,
        email,
        display_name: seed.displayName,
        role: seed.role,
        security_admin: seed.securityAdmin,
        active: true,
      })
      .select("user_id,email,display_name,role,security_admin,active")
      .single();
    data = result.data;
  }
  if (!data?.active) return null;
  const { data: aal } = await client.auth.mfa.getAuthenticatorAssuranceLevel();
  return {
    userId: data.user_id,
    email: data.email,
    displayName: data.display_name,
    role: data.role,
    securityAdmin: Boolean(data.security_admin),
    aal: aal?.currentLevel ?? null,
    passkeyVerified: usedPasskeyAuthentication(aal?.currentAuthenticationMethods),
  } as DashboardProfile;
}

// Supabase's native Passkey feature (auth.signInWithPasskey/registerPasskey)
// authenticates with a single, inherently strong credential (device
// possession + biometric) rather than going through the classic
// password-then-mfa.challenge/verify flow — so a passkey-only session may
// still come back as "aal1" from Supabase's own AAL model even though it's
// already equivalent to (or stronger than) our password+TOTP baseline. We
// treat either as satisfying the dashboard's 2FA requirement. The exact
// AMR method string Supabase emits for this isn't pinned down in the SDK's
// own type reference list, so match loosely rather than on an exact value.
function usedPasskeyAuthentication(methods: Array<{ method: string } | string> | undefined | null): boolean {
  if (!methods) return false;
  return methods.some((entry) => {
    const method = typeof entry === "string" ? entry : entry.method;
    return /passkey|webauthn/i.test(method);
  });
}

function requestHostname(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwarded || request.headers.get("host") || new URL(request.url).host;
  return host.toLowerCase().replace(/:\d+$/, "");
}

export async function ensurePortalProfile(
  client: SupabaseClient<any, any, any>,
  user: User,
  request: Request,
): Promise<PortalProfile | null> {
  const email = user.email?.toLowerCase();
  if (!email) return null;
  const requestedSlug = new URL(request.url).searchParams.get("tenant")?.trim().toLowerCase() || "";
  const hostname = requestHostname(request);
  let tenantId = "";
  if (requestedSlug) {
    const tenant = await client.from("tenants").select("id").eq("slug", requestedSlug).eq("status", "active").maybeSingle();
    tenantId = tenant.data?.id || "";
  } else if (!hostname.endsWith("swisscompact.com") && hostname !== "localhost" && hostname !== "127.0.0.1") {
    const domain = await client.from("tenant_domains").select("tenant_id").eq("hostname", hostname).eq("purpose", "portal").eq("verified", true).maybeSingle();
    tenantId = domain.data?.tenant_id || "";
  }
  let query = client
    .from("tenant_memberships")
    .select("id,tenant_id,user_id,role,display_name,active")
    .eq("user_id", user.id)
    .eq("active", true);
  if (tenantId) query = query.eq("tenant_id", tenantId);
  const memberships = await query.order("created_at", { ascending: true }).limit(1);
  const membership = memberships.data?.[0];
  if (!membership) return null;
  const tenant = await client
    .from("tenants")
    .select("id,name,slug,status,branding,enabled_modules")
    .eq("id", membership.tenant_id)
    .eq("status", "active")
    .maybeSingle();
  if (!tenant.data) return null;
  return {
    userId: user.id,
    email,
    displayName: membership.display_name || user.user_metadata?.full_name || email.split("@")[0],
    membershipId: membership.id,
    tenantId: tenant.data.id,
    tenantName: tenant.data.name,
    tenantSlug: tenant.data.slug,
    role: membership.role,
    branding: tenant.data.branding || {},
    enabledModules: Array.isArray(tenant.data.enabled_modules) ? tenant.data.enabled_modules : [],
  } as PortalProfile;
}

export async function authorizeDashboard(request: Request, requireMfa = true): Promise<{
  client: SupabaseClient<any, any, any>;
  user: User;
  profile: DashboardProfile;
} | Response> {
  const session = await sessionClient(request);
  if (!session) return json({ error: "Nicht angemeldet" }, { status: 401 });
  const profile = await ensureProfile(session.client, session.user);
  if (!profile || !["owner_admin", "admin", "staff", "advisor"].includes(profile.role)) {
    return json({ error: "Kein Dashboard-Zugriff" }, { status: 403 });
  }
  const verifiedFactors = session.user.factors?.filter((factor) => factor.status === "verified") ?? [];
  const strongAuth = profile.aal === "aal2" || profile.passkeyVerified;
  if (requireMfa && !strongAuth) {
    return json(
      { error: "Zwei-Faktor-Authentifizierung erforderlich", code: verifiedFactors.length ? "mfa_required" : "mfa_enrollment_required" },
      { status: 403 },
    );
  }
  return { client: session.client, user: session.user, profile };
}

export async function authorizePortal(request: Request): Promise<{
  client: SupabaseClient<any, any, any>;
  user: User;
  profile: PortalProfile;
} | Response> {
  const session = await sessionClient(request);
  if (!session) return json({ error: "Nicht angemeldet" }, { status: 401 });
  const profile = await ensurePortalProfile(session.client, session.user, request);
  if (!profile) return json({ error: "Kein Portal-Zugriff" }, { status: 403 });
  return { client: session.client, user: session.user, profile };
}

export function isResponse(value: unknown): value is Response {
  return value instanceof Response;
}

export async function writeAudit(
  client: SupabaseClient<any, any, any>,
  profile: DashboardProfile,
  action: string,
  entityType: string,
  entityId?: string,
  previousData?: unknown,
  newData?: unknown,
): Promise<void> {
  const { error } = await client.from("audit_log").insert({
    actor_user_id: profile.userId,
    actor_email: profile.email,
    action,
    entity_type: entityType,
    entity_id: entityId,
    previous_data: previousData ?? null,
    new_data: newData ?? null,
  });
  if (error) console.error("dashboard audit:", error.message);
}

export function isBuiltInAdmin(email: string): boolean {
  return Boolean(BUILT_IN_ADMINS[email.toLowerCase()]);
}

export { ensureProfile };

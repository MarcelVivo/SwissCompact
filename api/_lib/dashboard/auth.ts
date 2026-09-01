import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
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
  clientId: string;
  tenantName: string;
  tenantSlug: string;
  role: "owner" | "admin" | "editor" | "viewer";
  branding: Record<string, unknown>;
  enabledModules: string[];
  aal: "aal1" | "aal2" | null;
  passkeyVerified: boolean;
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

function sessionHash(accessToken: string, refreshToken: string): string {
  let stableId = "";
  try {
    const payload = JSON.parse(Buffer.from(accessToken.split(".")[1] || "", "base64url").toString("utf8")) as Record<string, unknown>;
    stableId = typeof payload.session_id === "string" ? payload.session_id : "";
  } catch { /* fall back to the refresh token */ }
  return createHash("sha256").update(stableId || refreshToken).digest("hex");
}

function deviceDetails(userAgent: string): { browser: string; operatingSystem: string; label: string } {
  const browser = /Edg\//.test(userAgent) ? "Microsoft Edge"
    : /CriOS\//.test(userAgent) ? "Chrome iOS"
      : /Chrome\//.test(userAgent) ? "Google Chrome"
        : /Firefox\//.test(userAgent) ? "Firefox"
          : /Safari\//.test(userAgent) ? "Safari"
            : "Unbekannter Browser";
  const operatingSystem = /iPhone|iPad/.test(userAgent) ? "iOS / iPadOS"
    : /Android/.test(userAgent) ? "Android"
      : /Mac OS X/.test(userAgent) ? "macOS"
        : /Windows/.test(userAgent) ? "Windows"
          : /Linux/.test(userAgent) ? "Linux"
            : "Unbekanntes System";
  const form = /iPad|Tablet/.test(userAgent) ? "Tablet" : /Mobile|iPhone|Android/.test(userAgent) ? "Mobilgerät" : "Computer";
  return { browser, operatingSystem, label: `${form} · ${browser}` };
}

function requestIpHash(request: Request): string | null {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip")?.trim() || "";
  if (!ip) return null;
  const salt = process.env.SECURITY_IP_HASH_SALT || process.env.SUPABASE_SERVICE_ROLE_KEY || "swisscompact";
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex");
}

export async function recordSecuritySession(
  request: Request,
  userId: string,
  audience: "dashboard" | "portal",
  accessToken: string,
  refreshToken: string,
  tenantId: string | null = null,
): Promise<void> {
  const admin = dashboardSupabase();
  if (!admin) return;
  const userAgent = (request.headers.get("user-agent") || "").slice(0, 1000);
  const device = deviceDetails(userAgent);
  const { error } = await admin.from("user_security_sessions").upsert({
    user_id: userId,
    tenant_id: audience === "portal" ? tenantId : null,
    session_hash: sessionHash(accessToken, refreshToken),
    audience,
    device_label: device.label,
    browser_name: device.browser,
    operating_system: device.operatingSystem,
    user_agent: userAgent,
    ip_hash: requestIpHash(request),
    last_seen_at: new Date().toISOString(),
    revoked_at: null,
  }, { onConflict: "session_hash" });
  if (error && !/user_security_sessions/i.test(error.message)) console.error("security session:", error.message);
}

export function currentSecuritySessionHash(request: Request): string | null {
  const cookies = parseCookies(request);
  const accessToken = cookies[ACCESS_COOKIE];
  const refreshToken = cookies[REFRESH_COOKIE];
  return accessToken && refreshToken ? sessionHash(accessToken, refreshToken) : null;
}

async function touchSecuritySession(request: Request, userId: string, audience: "dashboard" | "portal", tenantId: string | null): Promise<void> {
  const cookies = parseCookies(request);
  const accessToken = cookies[ACCESS_COOKIE];
  const refreshToken = cookies[REFRESH_COOKIE];
  if (!accessToken || !refreshToken) return;
  const admin = dashboardSupabase();
  if (!admin) return;
  const hash = sessionHash(accessToken, refreshToken);
  const cutoff = new Date(Date.now() - 5 * 60_000).toISOString();
  const touched = await admin.from("user_security_sessions").update({ last_seen_at: new Date().toISOString() }).eq("session_hash", hash).eq("user_id", userId).lt("last_seen_at", cutoff);
  if (!touched.error) return;
  await recordSecuritySession(request, userId, audience, accessToken, refreshToken, tenantId);
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
  if (!email || !user.email_confirmed_at) return null;
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
    .select("id,tenant_id,user_id,role,display_name,active,access_status,verified_at")
    .eq("user_id", user.id)
    .eq("active", true)
    .eq("access_status", "active")
    .not("verified_at", "is", null);
  if (tenantId) query = query.eq("tenant_id", tenantId);
  const memberships = await query.order("created_at", { ascending: true }).limit(1);
  const membership = memberships.data?.[0];
  if (!membership || membership.access_status !== "active" || !membership.verified_at) return null;
  const tenant = await client
    .from("tenants")
    .select("id,client_id,name,slug,status,branding,enabled_modules")
    .eq("id", membership.tenant_id)
    .eq("status", "active")
    .maybeSingle();
  if (!tenant.data) return null;
  const verifiedCustomer = await client.rpc("is_verified_portal_customer", { target_tenant: tenant.data.id });
  if (verifiedCustomer.error || verifiedCustomer.data !== true || !tenant.data.client_id) return null;
  const { data: aal } = await client.auth.mfa.getAuthenticatorAssuranceLevel();
  return {
    userId: user.id,
    email,
    displayName: membership.display_name || user.user_metadata?.full_name || email.split("@")[0],
    membershipId: membership.id,
    tenantId: tenant.data.id,
    clientId: tenant.data.client_id,
    tenantName: tenant.data.name,
    tenantSlug: tenant.data.slug,
    role: membership.role,
    branding: tenant.data.branding || {},
    enabledModules: Array.isArray(tenant.data.enabled_modules) ? tenant.data.enabled_modules : [],
    aal: aal?.currentLevel ?? null,
    passkeyVerified: usedPasskeyAuthentication(aal?.currentAuthenticationMethods),
  } as PortalProfile;
}

export async function activatePendingPortalMembership(user: User): Promise<void> {
  if (!user.email || !user.email_confirmed_at) return;
  const admin = dashboardSupabase();
  if (!admin) return;
  const pending = await admin
    .from("tenant_memberships")
    .select("id,tenant_id,access_status,tenant:tenants(id,status,client_id)")
    .eq("user_id", user.id)
    .eq("access_status", "invited");
  if (pending.error) return;
  for (const membership of pending.data ?? []) {
    const tenant = Array.isArray(membership.tenant) ? membership.tenant[0] : membership.tenant;
    if (!tenant?.client_id) continue;
    const customer = await admin.from("clients").select("id,lifecycle,portal_verified_at").eq("id", tenant.client_id).maybeSingle();
    if (!customer.data || customer.data.lifecycle !== "customer" || !customer.data.portal_verified_at) continue;
    const now = new Date().toISOString();
    const activated = await admin.from("tenant_memberships").update({ access_status: "active", active: true, accepted_at: now, verified_at: now, revoked_at: null }).eq("id", membership.id).eq("access_status", "invited");
    if (activated.error) continue;
    await admin.from("tenants").update({ status: "active", updated_at: now }).eq("id", membership.tenant_id).eq("client_id", tenant.client_id).in("status", ["onboarding", "active"]);
    await admin.from("tenant_audit_log").insert({ tenant_id: membership.tenant_id, actor_user_id: user.id, action: "portal_invitation_accepted", entity_type: "membership", entity_id: membership.id, metadata: { email: user.email.toLowerCase() } });
  }
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
  await touchSecuritySession(request, profile.userId, "dashboard", null);
  return { client: session.client, user: session.user, profile };
}

export async function authorizePortal(request: Request, requireMfa = true): Promise<{
  client: SupabaseClient<any, any, any>;
  user: User;
  profile: PortalProfile;
} | Response> {
  const session = await sessionClient(request);
  if (!session) return json({ error: "Nicht angemeldet" }, { status: 401 });
  const profile = await ensurePortalProfile(session.client, session.user, request);
  if (!profile) return json({ error: "Kein Portal-Zugriff" }, { status: 403 });
  const verifiedFactors = session.user.factors?.filter((factor) => factor.status === "verified") ?? [];
  if (requireMfa && verifiedFactors.length > 0 && profile.aal !== "aal2" && !profile.passkeyVerified) {
    return json({ error: "Zwei-Faktor-Authentifizierung erforderlich", code: "mfa_required" }, { status: 403 });
  }
  await touchSecuritySession(request, profile.userId, "portal", profile.tenantId);
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

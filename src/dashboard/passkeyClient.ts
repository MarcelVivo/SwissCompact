import { createClient } from "@supabase/supabase-js";

// A separate, short-lived Supabase client instance used only for the two
// operations that must run in the browser because they drive the actual
// WebAuthn ceremony (navigator.credentials.create()/get()): registering a
// passkey and signing in with one. Everything else (listing/deleting
// passkeys, and bridging a resulting session into this app's own httpOnly
// cookies) goes through the normal /api/dashboard/* endpoints instead.
//
// persistSession/autoRefreshToken are off on purpose — this app manages its
// own session via server-set httpOnly cookies, not supabase-js's browser
// storage. For registerPasskey() we explicitly hydrate a session first via
// setSession() using tokens fetched from our own already-authorized
// session; for signInWithPasskey() no prior session is needed at all.
let client: ReturnType<typeof createClient> | null | undefined;

export function getPasskeyClient() {
  if (client !== undefined) return client;
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  client = url && anonKey
    ? createClient(url, anonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
        experimental: { passkey: true },
      },
    })
    : null;
  return client;
}

export function passkeySupported(): boolean {
  return typeof window !== "undefined" && "PublicKeyCredential" in window;
}

export async function passkeyPlatformAvailable(): Promise<boolean> {
  if (!passkeySupported()) return false;
  try {
    return await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

// Supabase's WebAuthnError carries a specific `code` describing exactly why
// the browser ceremony failed (see @supabase/auth-js's webauthn.errors) —
// map the ones a user can actually run into to plain German instead of
// surfacing the English spec-language error.
export function friendlyPasskeyError(error: unknown): string {
  const code = (error as { code?: string } | null)?.code;
  const name = (error as { name?: string } | null)?.name;
  if (code === "ERROR_CEREMONY_ABORTED" || name === "NotAllowedError" || name === "AbortError") {
    return "Abgebrochen. Du kannst es jederzeit erneut versuchen.";
  }
  if (code === "ERROR_INVALID_DOMAIN" || code === "ERROR_INVALID_RP_ID") {
    return "Face ID ist auf dieser Adresse nicht verfügbar.";
  }
  if (
    code === "ERROR_AUTHENTICATOR_MISSING_DISCOVERABLE_CREDENTIAL_SUPPORT"
    || code === "ERROR_AUTHENTICATOR_MISSING_USER_VERIFICATION_SUPPORT"
  ) {
    return "Auf diesem Gerät wurde kein passender Passkey gefunden.";
  }
  if (code === "ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED") {
    return "Dieser Passkey ist bereits eingerichtet.";
  }
  const message = (error as { message?: string } | null)?.message;
  return message || "Face ID konnte nicht verarbeitet werden.";
}

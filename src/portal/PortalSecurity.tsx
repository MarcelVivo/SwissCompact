import { FormEvent, useCallback, useEffect, useState } from "react";
import { friendlyPasskeyError, getPasskeyClient, passkeyPlatformAvailable } from "../dashboard/passkeyClient";

type SecurityFactor = { id: string; friendly_name?: string; factor_type: string; created_at: string; updated_at: string };
type SecurityPasskey = { id: string; friendly_name?: string; created_at: string; last_used_at?: string };
type SecurityDevice = { id: string; audience: "dashboard" | "portal"; device_label: string; browser_name: string; operating_system: string; created_at: string; last_seen_at: string; current: boolean };
type SecurityStatus = { aal: string | null; passkeyVerified: boolean; factors: SecurityFactor[]; passkeys: SecurityPasskey[]; devicesAvailable: boolean; devices: SecurityDevice[] };
type Enrollment = { factorId: string; qrCode: string; secret: string };

async function securityApi<T>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
  const response = await fetch("/api/dashboard/mfa", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, audience: "portal", ...payload }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Sicherheitsaktion fehlgeschlagen");
  return data as T;
}

const dateTime = (value?: string) => value
  ? new Intl.DateTimeFormat("de-CH", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value))
  : "–";

export function PortalMfaChallenge({ factorId, onVerified, onLogout }: { factorId: string; onVerified: () => void; onLogout: () => void }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function verify(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try { await securityApi("verify", { factorId, code }); onVerified(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Code konnte nicht bestätigt werden"); }
    finally { setBusy(false); }
  }
  return <main className="login-shell portal-mfa-shell"><section className="login-brand"><a className="wordmark" href="/">Swiss<span>Compact</span></a><p>Kundenportal</p><h1>Zusätzliche Bestätigung</h1><p className="lead">Ihr Konto ist mit einer Authenticator-App geschützt.</p></section><section className="login-panel"><div className="eyebrow">Zwei-Faktor-Schutz</div><h2>Sicherheitscode eingeben</h2><p>Öffnen Sie Ihre Authenticator-App und geben Sie den aktuellen sechsstelligen Code ein.</p><form onSubmit={verify}><label>Sicherheitscode<input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required autoFocus value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}/></label>{error && <div className="form-error" role="alert">{error}</div>}<button className="primary" disabled={busy || code.length !== 6}>{busy ? "Wird bestätigt …" : "Sicher anmelden"}</button><button type="button" className="secondary" onClick={onLogout} disabled={busy}>Abmelden</button></form></section></main>;
}

export function PortalSecurityCard() {
  const [status, setStatus] = useState<SecurityStatus | null>(null);
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [passkeyAvailable, setPasskeyAvailable] = useState(false);

  const load = useCallback(async () => {
    try { setStatus(await securityApi<SecurityStatus>("security_status")); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Sicherheitsstatus nicht verfügbar"); }
  }, []);

  useEffect(() => { void load(); void passkeyPlatformAvailable().then(setPasskeyAvailable); }, [load]);

  async function beginMfa() {
    setBusy("mfa"); setError(""); setNotice("");
    try { setEnrollment(await securityApi<Enrollment>("enroll")); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Authenticator konnte nicht vorbereitet werden"); }
    finally { setBusy(""); }
  }

  async function verifyMfa(event: FormEvent) {
    event.preventDefault();
    if (!enrollment) return;
    setBusy("mfa"); setError("");
    try {
      await securityApi("verify", { factorId: enrollment.factorId, code });
      setEnrollment(null); setCode(""); setNotice("Authenticator wurde erfolgreich aktiviert."); await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Code konnte nicht bestätigt werden"); }
    finally { setBusy(""); }
  }

  async function removeFactor(factorId: string) {
    if (!window.confirm("Authenticator wirklich entfernen? Der Passkey oder das Passwort schützt das Konto weiterhin.")) return;
    setBusy(factorId); setError("");
    try { await securityApi("unenroll", { factorId }); setNotice("Authenticator wurde entfernt."); await load(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Authenticator konnte nicht entfernt werden"); }
    finally { setBusy(""); }
  }

  async function addPasskey() {
    setBusy("passkey"); setError(""); setNotice("");
    try {
      const tokens = await securityApi<{ accessToken: string; refreshToken: string }>("passkey_bridge_tokens");
      const client = getPasskeyClient();
      if (!client) throw new Error("Passkeys sind auf diesem Gerät nicht verfügbar");
      const hydrated = await client.auth.setSession({ access_token: tokens.accessToken, refresh_token: tokens.refreshToken });
      if (hydrated.error) throw hydrated.error;
      const registered = await client.auth.registerPasskey();
      if (registered.error) throw registered.error;
      setNotice("Passkey wurde auf diesem Gerät eingerichtet."); await load();
    } catch (reason) { setError(friendlyPasskeyError(reason)); }
    finally { setBusy(""); }
  }

  async function removePasskey(passkeyId: string) {
    if (!window.confirm("Diesen Passkey wirklich entfernen?")) return;
    setBusy(passkeyId); setError("");
    try { await securityApi("passkey_delete", { passkeyId }); setNotice("Passkey wurde entfernt."); await load(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Passkey konnte nicht entfernt werden"); }
    finally { setBusy(""); }
  }

  async function signOutOthers() {
    setBusy("sessions"); setError(""); setNotice("");
    try { await securityApi("sign_out_others"); setNotice("Alle anderen Sitzungen wurden abgemeldet."); await load(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Sitzungen konnten nicht abgemeldet werden"); }
    finally { setBusy(""); }
  }

  const protectedAccount = Boolean(status?.factors.length || status?.passkeys.length);
  return <article className="card portal-security-card"><div className="portal-security-heading"><div><span>Kontosicherheit</span><h3>Sicherheitscenter</h3></div><b className={protectedAccount ? "protected" : "recommended"}>{protectedAccount ? "Geschützt" : "Empfohlen"}</b></div><p>Schützen Sie Ihren persönlichen Zugang zusätzlich und kontrollieren Sie angemeldete Geräte.</p>{!status ? <div className="security-loading">Sicherheitsstatus wird geladen …</div> : <div className="portal-security-sections"><section><header><div><strong>Authenticator-App</strong><small>Sechsstelliger Zusatzcode bei jeder Passwort-Anmeldung.</small></div>{status.factors.length ? <em>Aktiv</em> : <button type="button" className="secondary" disabled={Boolean(busy)} onClick={() => void beginMfa()}>{busy === "mfa" ? "Wird vorbereitet …" : "Aktivieren"}</button>}</header>{status.factors.map((factor) => <div className="security-entry" key={factor.id}><span><b>{factor.friendly_name || "Authenticator"}</b><small>Eingerichtet am {dateTime(factor.created_at)}</small></span><button type="button" className="text-button" disabled={Boolean(busy)} onClick={() => void removeFactor(factor.id)}>Entfernen</button></div>)}</section><section><header><div><strong>Passkey</strong><small>Anmeldung mit Face ID, Touch ID, PIN oder Sicherheitsschlüssel.</small></div>{passkeyAvailable && <button type="button" className="secondary" disabled={Boolean(busy)} onClick={() => void addPasskey()}>{busy === "passkey" ? "Gerät wird geöffnet …" : "Passkey hinzufügen"}</button>}</header>{!passkeyAvailable && <p className="security-hint">Auf diesem Gerät ist kein Plattform-Passkey verfügbar.</p>}{status.passkeys.map((passkey) => <div className="security-entry" key={passkey.id}><span><b>{passkey.friendly_name || "Passkey"}</b><small>{passkey.last_used_at ? `Zuletzt verwendet ${dateTime(passkey.last_used_at)}` : `Eingerichtet ${dateTime(passkey.created_at)}`}</small></span><button type="button" className="text-button" disabled={Boolean(busy)} onClick={() => void removePasskey(passkey.id)}>Entfernen</button></div>)}</section><section className="security-devices"><header><div><strong>Angemeldete Geräte</strong><small>Aktive Portal-Sitzungen der letzten 30 Tage.</small></div>{status.devices.filter((device) => !device.current).length > 0 && <button type="button" className="secondary" disabled={Boolean(busy)} onClick={() => void signOutOthers()}>{busy === "sessions" ? "Wird abgemeldet …" : "Andere abmelden"}</button>}</header>{status.devicesAvailable ? status.devices.map((device) => <div className={`security-entry ${device.current ? "current" : ""}`} key={device.id}><span><b>{device.device_label}{device.current ? " · Dieses Gerät" : ""}</b><small>{device.operating_system} · zuletzt aktiv {dateTime(device.last_seen_at)}</small></span>{device.current && <em>Aktiv</em>}</div>) : <p className="security-hint">Die Gerätehistorie wird mit der Sicherheitsmigration aktiviert.</p>}</section></div>}{enrollment && <div className="security-enrollment" role="dialog" aria-modal="true" aria-labelledby="security-enrollment-title"><div><span>Authenticator einrichten</span><h3 id="security-enrollment-title">QR-Code scannen</h3><p>Öffnen Sie beispielsweise Microsoft Authenticator, Google Authenticator oder 1Password und scannen Sie diesen Code.</p>{enrollment.qrCode && <img src={enrollment.qrCode} alt="QR-Code für die Authenticator-App"/>}<details><summary>Code manuell eingeben</summary><code>{enrollment.secret}</code></details><form onSubmit={verifyMfa}><label>Sechsstelligen Code bestätigen<input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} required autoFocus/></label><footer><button type="button" className="secondary" onClick={() => { setEnrollment(null); setCode(""); }}>Abbrechen</button><button className="primary" disabled={busy === "mfa" || code.length !== 6}>{busy === "mfa" ? "Wird bestätigt …" : "Authenticator aktivieren"}</button></footer></form></div></div>}{notice && <div className="security-notice" role="status">✓ {notice}</div>}{error && <div className="form-error" role="alert">{error}</div>}</article>;
}

export async function signInPortalWithPasskey(): Promise<void> {
  try {
    const client = getPasskeyClient();
    if (!client) throw new Error("Passkeys sind auf diesem Gerät nicht verfügbar");
    const signedIn = await client.auth.signInWithPasskey();
    if (signedIn.error || !signedIn.data.session) throw signedIn.error || new Error("Passkey-Anmeldung fehlgeschlagen");
    await securityApi("passkey_login", {
      accessToken: signedIn.data.session.access_token,
      refreshToken: signedIn.data.session.refresh_token,
    });
  } catch (reason) {
    throw new Error(friendlyPasskeyError(reason));
  }
}

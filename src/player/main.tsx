import { FormEvent, useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./player.css";

type PlaylistItem = { contentId: string; title: string; contentType: string; payload?: { text?: string }; mediaUrl?: string | null; durationSeconds: number };
type DeviceConfig = { display: { id: string; name: string }; configurationVersion: number; playlist: PlaylistItem[]; generatedAt: string };
const TOKEN_KEY = "swisscompact_device_token";
const DISPLAY_KEY = "swisscompact_display_id";
const CONFIG_KEY = "swisscompact_device_config";
const PLAYER_VERSION = "1.0.0-web";

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Verbindung fehlgeschlagen");
  return data as T;
}

function Pairing({ initialDisplayId, onPaired }: { initialDisplayId: string; onPaired: (token: string, displayId: string) => void }) {
  const [displayId, setDisplayId] = useState(initialDisplayId);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function pair(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const result = await request<{ token: string }>("/api/dashboard/records?device=pair", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ displayId: displayId.trim(), code: code.trim(), softwareVersion: PLAYER_VERSION }) });
      onPaired(result.token, displayId.trim());
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Aktivierung fehlgeschlagen"); }
    finally { setBusy(false); }
  }
  return <main className="pairing"><section><div className="brand">Swiss<span>Compact</span></div><div className="eyebrow">Display Player</div><h1>Display aktivieren</h1><p>Geben Sie die Display-ID und den Aktivierungscode aus dem SwissCompact Portal ein.</p><form onSubmit={pair}><label>Display-ID<input value={displayId} onChange={(event) => setDisplayId(event.target.value)} required autoComplete="off" /></label><label>Aktivierungscode<input className="code" value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} required maxLength={8} autoComplete="one-time-code" /></label>{error && <div className="error">{error}</div>}<button disabled={busy}>{busy ? "Wird verbunden …" : "Display verbinden"}</button></form><small>Der Code ist 30 Minuten gültig und kann nur einmal verwendet werden.</small></section></main>;
}

function Player() {
  const query = new URLSearchParams(location.search);
  const queryDisplayId = query.get("display") || "";
  const forcePairing = query.get("pair") === "1";
  const [token, setToken] = useState(() => forcePairing ? "" : localStorage.getItem(TOKEN_KEY) || "");
  const [config, setConfig] = useState<DeviceConfig | null>(() => { if (forcePairing) return null; try { return JSON.parse(localStorage.getItem(CONFIG_KEY) || "null"); } catch { return null; } });
  const [index, setIndex] = useState(0);
  const [online, setOnline] = useState(navigator.onLine);
  const [message, setMessage] = useState("Konfiguration wird geladen …");

  const loadConfig = useCallback(async (activeToken = token) => {
    if (!activeToken) return;
    try {
      const next = await request<DeviceConfig>("/api/dashboard/records?device=config", { headers: { Authorization: `Bearer ${activeToken}` } });
      setConfig(next); localStorage.setItem(CONFIG_KEY, JSON.stringify(next)); setOnline(true); setMessage(next.playlist.length ? "" : "Noch keine aktive Kampagne für dieses Display.");
    } catch (reason) {
      setOnline(false);
      if (reason instanceof Error && /Gerätetoken/.test(reason.message)) { localStorage.removeItem(TOKEN_KEY); setToken(""); }
      else if (!config) setMessage("Keine Verbindung. Erneuter Versuch läuft …");
    }
  }, [token, config]);

  useEffect(() => {
    if (!token) return;
    void loadConfig();
    const refresh = window.setInterval(() => void loadConfig(), 60_000);
    const heartbeat = window.setInterval(() => void request("/api/dashboard/records?device=heartbeat", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ health: "online", softwareVersion: PLAYER_VERSION }) }).then(() => setOnline(true)).catch(() => setOnline(false)), 30_000);
    return () => { clearInterval(refresh); clearInterval(heartbeat); };
  }, [token, loadConfig]);

  useEffect(() => {
    if (!config?.playlist.length) return;
    if (index >= config.playlist.length) setIndex(0);
    const item = config.playlist[index % config.playlist.length];
    const timer = window.setTimeout(() => setIndex((current) => (current + 1) % config.playlist.length), Math.max(5, item.durationSeconds) * 1000);
    return () => clearTimeout(timer);
  }, [config, index]);

  useEffect(() => {
    const keepAwake = async () => { try { if ("wakeLock" in navigator) await (navigator as Navigator & { wakeLock: { request: (type: string) => Promise<unknown> } }).wakeLock.request("screen"); } catch { /* Player läuft auch ohne Wake Lock. */ } };
    void keepAwake();
  }, []);

  function resetPairing() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(CONFIG_KEY);
    setConfig(null);
    setToken("");
  }

  if (!token) return <Pairing initialDisplayId={queryDisplayId || localStorage.getItem(DISPLAY_KEY) || ""} onPaired={(nextToken, displayId) => {
    localStorage.setItem(TOKEN_KEY, nextToken);
    localStorage.setItem(DISPLAY_KEY, displayId);
    const cleanUrl = new URL(location.href);
    cleanUrl.searchParams.delete("pair");
    history.replaceState(null, "", cleanUrl);
    setToken(nextToken);
    void loadConfig(nextToken);
  }} />;
  const item = config?.playlist[index % Math.max(1, config.playlist.length)];
  return <main className="stage" onDoubleClick={() => document.documentElement.requestFullscreen?.()}>{item ? <section className={`content content-${item.contentType}`} key={`${item.contentId}-${index}`}>{item.contentType === "image" && item.mediaUrl ? <img src={item.mediaUrl} alt=""/> : item.contentType === "video" && item.mediaUrl ? <video src={item.mediaUrl} autoPlay muted playsInline/> : <div className="text-content">{item.payload?.text || item.title}</div>}</section> : <section className="idle"><div className="brand">Swiss<span>Compact</span></div><p>{message}</p><button className="reconnect" onClick={resetPairing}>Aktivierungscode eingeben</button></section>}<div className={`connection ${online ? "online" : "offline"}`} title={online ? "Verbunden" : "Offline"}></div></main>;
}

createRoot(document.getElementById("player-root")!).render(<Player/>);

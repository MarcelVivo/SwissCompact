import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./player.css";
import "./player-video.css";

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

function PlayerVideo({ item, loop }: { item: PlaylistItem; loop: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const retryTimer = useRef<number | null>(null);
  const [playback, setPlayback] = useState<"loading" | "playing" | "waiting" | "blocked" | "error">("loading");

  const start = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = true;
    try {
      await video.play();
      setPlayback("playing");
    } catch {
      setPlayback("blocked");
    }
  }, []);

  const retry = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (retryTimer.current) window.clearTimeout(retryTimer.current);
    setPlayback("loading");
    video.load();
    retryTimer.current = window.setTimeout(() => void start(), 350);
  }, [start]);

  useEffect(() => {
    setPlayback("loading");
    retryTimer.current = window.setTimeout(() => void start(), 350);
    return () => { if (retryTimer.current) window.clearTimeout(retryTimer.current); };
  }, [item.mediaUrl, start]);

  useEffect(() => {
    if (playback !== "error") return;
    const timer = window.setTimeout(retry, 8_000);
    return () => window.clearTimeout(timer);
  }, [playback, retry]);

  return <>
    <video
      ref={videoRef}
      src={item.mediaUrl || undefined}
      autoPlay
      muted
      loop={loop}
      playsInline
      preload="auto"
      disablePictureInPicture
      onLoadedData={() => void start()}
      onCanPlay={() => void start()}
      onPlaying={() => setPlayback("playing")}
      onWaiting={() => setPlayback("waiting")}
      onStalled={() => setPlayback("waiting")}
      onError={() => setPlayback("error")}
    />
    {playback !== "playing" && <div className={`video-status video-status-${playback}`} role="status">
      <span className="video-spinner" aria-hidden="true"></span>
      <strong>{playback === "error" ? "Video konnte nicht geladen werden" : playback === "blocked" ? "Video wartet auf den Start" : "Video wird geladen"}</strong>
      {playback === "error" || playback === "blocked" ? <button type="button" onClick={() => { if (playback === "blocked") void start(); else retry(); }}>{playback === "blocked" ? "Video starten" : "Erneut versuchen"}</button> : null}
    </div>}
  </>;
}

function Pairing({ initialDisplayId, initialCode, autoConnect, onPaired }: { initialDisplayId: string; initialCode: string; autoConnect: boolean; onPaired: (token: string, displayId: string) => void }) {
  const [displayId, setDisplayId] = useState(initialDisplayId);
  const [code, setCode] = useState(initialCode);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const attemptedAutomaticConnection = useRef(false);
  const connect = useCallback(async (nextDisplayId: string, nextCode: string) => {
    setBusy(true); setError("");
    try {
      const cleanDisplayId = nextDisplayId.trim();
      const result = await request<{ token: string }>("/api/dashboard/records?device=pair", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ displayId: cleanDisplayId, code: nextCode.trim(), softwareVersion: PLAYER_VERSION }) });
      onPaired(result.token, cleanDisplayId);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Aktivierung fehlgeschlagen"); }
    finally { setBusy(false); }
  }, [onPaired]);
  useEffect(() => {
    if (!autoConnect || !initialDisplayId || !initialCode || attemptedAutomaticConnection.current) return;
    attemptedAutomaticConnection.current = true;
    void connect(initialDisplayId, initialCode);
  }, [autoConnect, connect, initialCode, initialDisplayId]);
  function pair(event: FormEvent) {
    event.preventDefault();
    void connect(displayId, code);
  }
  return <main className="pairing"><section><div className="brand">Swiss<span>Compact</span></div><div className="eyebrow">Display Player</div><h1>Display aktivieren</h1><p>{autoConnect && busy ? "QR-Code erkannt. Der Bildschirm wird automatisch verbunden …" : "Geben Sie zuerst die Bildschirm-ID und danach den Aktivierungscode aus dem SwissCompact Portal ein."}</p><form onSubmit={pair}><label>1 · Bildschirm-ID<input value={displayId} onChange={(event) => setDisplayId(event.target.value)} required autoComplete="off" /></label><label>2 · Aktivierungscode<input className="code" value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} required maxLength={8} autoComplete="one-time-code" /></label>{error && <div className="error">{error}</div>}<button disabled={busy}>{busy ? "Wird verbunden …" : "Bildschirm verbinden"}</button></form><small>Der Aktivierungscode ist 30 Minuten gültig und kann nur einmal verwendet werden.</small></section></main>;
}

function Player() {
  const query = new URLSearchParams(location.search);
  const queryDisplayId = query.get("display") || "";
  const queryActivationCode = (query.get("code") || "").toUpperCase();
  const autoConnectPairing = query.get("connect") === "1";
  const previewDisplayId = query.get("preview") || "";
  const forcePairing = query.get("pair") === "1";
  const [token, setToken] = useState(() => forcePairing || previewDisplayId ? "" : localStorage.getItem(TOKEN_KEY) || "");
  const [config, setConfig] = useState<DeviceConfig | null>(() => { if (forcePairing || previewDisplayId) return null; try { return JSON.parse(localStorage.getItem(CONFIG_KEY) || "null"); } catch { return null; } });
  const [index, setIndex] = useState(0);
  const [online, setOnline] = useState(navigator.onLine);
  const [message, setMessage] = useState("Konfiguration wird geladen …");

  const loadConfig = useCallback(async (activeToken = token) => {
    if (!activeToken && !previewDisplayId) return;
    try {
      const next = previewDisplayId
        ? await request<DeviceConfig>(`/api/dashboard/records?portalPreview=${encodeURIComponent(previewDisplayId)}`)
        : await request<DeviceConfig>("/api/dashboard/records?device=config", { headers: { Authorization: `Bearer ${activeToken}` } });
      setConfig(next);
      if (!previewDisplayId) localStorage.setItem(CONFIG_KEY, JSON.stringify(next));
      setOnline(true); setMessage(next.playlist.length ? "" : "Noch keine aktive Kampagne für dieses Display.");
    } catch (reason) {
      setOnline(false);
      if (!previewDisplayId && reason instanceof Error && /Gerätetoken/.test(reason.message)) { localStorage.removeItem(TOKEN_KEY); setToken(""); }
      else if (!config) setMessage("Keine Verbindung. Erneuter Versuch läuft …");
    }
  }, [token, config, previewDisplayId]);

  useEffect(() => {
    if (previewDisplayId) {
      void loadConfig();
      const refresh = window.setInterval(() => void loadConfig(), 60_000);
      return () => window.clearInterval(refresh);
    }
    if (!token) return;
    void loadConfig();
    const refresh = window.setInterval(() => void loadConfig(), 60_000);
    const heartbeat = window.setInterval(() => void request("/api/dashboard/records?device=heartbeat", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ health: "online", softwareVersion: PLAYER_VERSION }) }).then(() => setOnline(true)).catch(() => setOnline(false)), 30_000);
    return () => { clearInterval(refresh); clearInterval(heartbeat); };
  }, [token, loadConfig, previewDisplayId]);

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

  if (!previewDisplayId && !token) return <Pairing initialDisplayId={queryDisplayId || localStorage.getItem(DISPLAY_KEY) || ""} initialCode={queryActivationCode} autoConnect={autoConnectPairing} onPaired={(nextToken, displayId) => {
    localStorage.setItem(TOKEN_KEY, nextToken);
    localStorage.setItem(DISPLAY_KEY, displayId);
    const cleanUrl = new URL(location.href);
    cleanUrl.searchParams.delete("pair");
    cleanUrl.searchParams.delete("code");
    cleanUrl.searchParams.delete("connect");
    history.replaceState(null, "", cleanUrl);
    setToken(nextToken);
    void loadConfig(nextToken);
  }} />;
  const item = config?.playlist[index % Math.max(1, config.playlist.length)];
  return <main className="stage" onDoubleClick={() => document.documentElement.requestFullscreen?.()}>{item ? <section className={`content content-${item.contentType}`} key={`${item.contentId}-${index}`}>{item.contentType === "image" && item.mediaUrl ? <img src={item.mediaUrl} alt=""/> : item.contentType === "video" && item.mediaUrl ? <PlayerVideo item={item} loop={config?.playlist.length === 1}/> : <div className="text-content">{item.payload?.text || item.title}</div>}</section> : <section className="idle"><div className="brand">Swiss<span>Compact</span></div><p>{message}</p>{!previewDisplayId && <button className="reconnect" onClick={resetPairing}>Aktivierungscode eingeben</button>}</section>}<div className={`connection ${online ? "online" : "offline"}`} title={online ? "Verbunden" : "Offline"}></div></main>;
}

createRoot(document.getElementById("player-root")!).render(<Player/>);

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import QrScanner from "qr-scanner";
import { registerServiceWorker } from "../pwa/registerServiceWorker";
import "./player.css";
import "./player-video.css";
import "./player-safety.css";
import "./player-qr.css";

type PlaylistItem = { contentId: string; title: string; contentType: string; payload?: { text?: string }; mediaUrl?: string | null; durationSeconds: number };
type DeviceConfig = { display: { id: string; name: string }; configurationVersion: number; playlist: PlaylistItem[]; fallback?: PlaylistItem | null; mode?: "live" | "preview" | "test"; generatedAt: string };
const TOKEN_KEY = "swisscompact_device_token";
const DISPLAY_KEY = "swisscompact_display_id";
const CONFIG_KEY = "swisscompact_device_config";
const PLAYER_VERSION = "1.0.0-web";
const MEDIA_CACHE = "swisscompact-player-media-v1";

registerServiceWorker({ scope: "/" });

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isStandalonePlayer(): boolean {
  const iosStandalone = Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
  return iosStandalone || window.matchMedia("(display-mode: standalone), (display-mode: fullscreen)").matches;
}

function PlayerDisplayControls() {
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [standalone, setStandalone] = useState(isStandalonePlayer);
  const [visible, setVisible] = useState(() => !isStandalonePlayer());
  const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const canFullscreen = typeof document.documentElement.requestFullscreen === "function";

  useEffect(() => {
    const capturePrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
      setVisible(true);
    };
    const installed = () => { setStandalone(true); setVisible(false); setInstallPrompt(null); };
    window.addEventListener("beforeinstallprompt", capturePrompt);
    window.addEventListener("appinstalled", installed);
    return () => {
      window.removeEventListener("beforeinstallprompt", capturePrompt);
      window.removeEventListener("appinstalled", installed);
    };
  }, []);

  useEffect(() => {
    if (!visible || standalone) return;
    const timer = window.setTimeout(() => setVisible(false), 15_000);
    return () => window.clearTimeout(timer);
  }, [standalone, visible]);

  useEffect(() => {
    const reveal = () => { if (!standalone) setVisible(true); };
    window.addEventListener("pointerdown", reveal);
    return () => window.removeEventListener("pointerdown", reveal);
  }, [standalone]);

  if (standalone || (!visible && !installPrompt)) return null;

  return <aside className="player-display-controls" aria-label="Player im Vollbild öffnen">
    <button type="button" className="player-display-dismiss" onClick={() => setVisible(false)} aria-label="Hinweis schließen">×</button>
    <strong>Player bildfüllend öffnen</strong>
    {isIos && <span>In Safari: Teilen → „Zum Home-Bildschirm“ und danach über das SC-Player-Icon starten.</span>}
    {!isIos && installPrompt && <button type="button" onClick={() => void installPrompt.prompt().then(() => installPrompt.userChoice).then(() => setInstallPrompt(null))}>Player installieren</button>}
    {canFullscreen && <button type="button" onClick={() => void document.documentElement.requestFullscreen()}>Jetzt Vollbild öffnen</button>}
  </aside>;
}

function parsePairingQr(value: string): { displayId: string; code: string } {
  let url: URL;
  try { url = new URL(value); }
  catch { throw new Error("Dieser QR-Code enthält keine gültige Player-Adresse."); }
  if (url.origin !== location.origin || url.pathname.replace(/\/$/, "") !== "/player") throw new Error("Dieser QR-Code gehört nicht zum SwissCompact Player.");
  const displayId = (url.searchParams.get("display") || "").trim();
  const code = (url.searchParams.get("code") || "").trim().toUpperCase();
  if (!/^[0-9a-f-]{36}$/i.test(displayId) || !/^[A-Z0-9]{8}$/.test(code)) throw new Error("Im QR-Code fehlen Bildschirm-ID oder Aktivierungscode.");
  return { displayId, code };
}

function PairingQrScanner({ onClose, onScanned }: { onClose: () => void; onScanned: (displayId: string, code: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const scannerRef = useRef<QrScanner | null>(null);
  const acceptedRef = useRef(false);
  const [error, setError] = useState("");
  const [starting, setStarting] = useState(true);

  const acceptValue = useCallback((value: string) => {
    if (acceptedRef.current) return;
    try {
      const pairing = parsePairingQr(value);
      acceptedRef.current = true;
      scannerRef.current?.stop();
      onScanned(pairing.displayId, pairing.code);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "QR-Code konnte nicht gelesen werden.");
    }
  }, [onScanned]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const scanner = new QrScanner(video, (result) => acceptValue(result.data), {
      preferredCamera: "environment",
      maxScansPerSecond: 10,
      highlightScanRegion: true,
      highlightCodeOutline: true,
      returnDetailedScanResult: true,
    });
    scannerRef.current = scanner;
    void scanner.start().then(() => setStarting(false)).catch((reason) => {
      setStarting(false);
      const message = reason instanceof Error ? reason.name : String(reason);
      setError(/NotAllowed|Permission/i.test(message)
        ? "Kamerazugriff wurde nicht erlaubt. Erlauben Sie die Kamera oder wählen Sie unten ein QR-Bild aus."
        : /NotFound|DevicesNotFound/i.test(message)
          ? "Auf diesem Gerät wurde keine Kamera gefunden."
          : "Die Kamera konnte nicht gestartet werden. Wählen Sie alternativ ein QR-Bild aus.");
    });
    return () => { scanner.destroy(); scannerRef.current = null; };
  }, [acceptValue]);

  async function scanFile(file?: File) {
    if (!file) return;
    setError("");
    try {
      const result = await QrScanner.scanImage(file, { returnDetailedScanResult: true, alsoTryWithoutScanRegion: true });
      acceptValue(result.data);
    } catch {
      setError("Auf diesem Bild wurde kein lesbarer SwissCompact QR-Code gefunden.");
    }
  }

  return <div className="qr-scanner-backdrop" role="dialog" aria-modal="true" aria-label="Aktivierungs-QR-Code scannen">
    <section className="qr-scanner-dialog">
      <button type="button" className="qr-scanner-close" onClick={onClose} aria-label="Scanner schließen">×</button>
      <div className="eyebrow">Schnell verbinden</div>
      <h2>QR-Code scannen</h2>
      <p>Richten Sie die Kamera auf den Aktivierungs-QR-Code im SwissCompact Portal.</p>
      <div className="qr-camera"><video ref={videoRef} muted playsInline/>{starting && <span>Kamera wird geöffnet …</span>}</div>
      {error && <div className="error" role="alert">{error}</div>}
      <label className="qr-image-upload">QR-Bild auswählen<input type="file" accept="image/*" capture="environment" onChange={(event) => void scanFile(event.target.files?.[0])}/></label>
      <small>Die Kamera wird nur auf diesem Gerät verarbeitet. Es wird keine Aufnahme gespeichert.</small>
    </section>
  </div>;
}

function mediaCacheKey(item: PlaylistItem): string {
  return new URL(`/player-cache/${encodeURIComponent(item.contentId)}`, location.origin).toString();
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Verbindung fehlgeschlagen");
  return data as T;
}

async function cacheMedia(items: PlaylistItem[]): Promise<{ cached: string[]; errors: string[] }> {
  if (!("caches" in window)) return { cached: [], errors: [] };
  const cache = await caches.open(MEDIA_CACHE);
  const cached: string[] = [];
  const errors: string[] = [];
  await Promise.all(items.flatMap((item) => item.mediaUrl ? [item] : []).map(async (item) => {
    try {
      const cacheKey = mediaCacheKey(item);
      const existing = await cache.match(cacheKey);
      if (!existing) {
        const response = await fetch(item.mediaUrl!, { mode: "cors" });
        if (!response.ok) throw new Error(String(response.status));
        await cache.put(cacheKey, response.clone());
      }
      cached.push(item.contentId);
    } catch { errors.push(item.title); }
  }));
  if (!errors.length) {
    const activeUrls = new Set(items.flatMap((item) => item.mediaUrl ? [mediaCacheKey(item)] : []));
    const keys = await cache.keys();
    await Promise.all(keys.filter((entry) => !activeUrls.has(entry.url)).map((entry) => cache.delete(entry)));
  }
  return { cached, errors };
}

function usePlayableUrl(item?: PlaylistItem): string | null {
  const [url, setUrl] = useState<string | null>(item?.mediaUrl || null);
  useEffect(() => {
    let active = true;
    let objectUrl = "";
    setUrl(item?.mediaUrl || null);
    if (!item?.mediaUrl || !("caches" in window)) return;
    void caches.open(MEDIA_CACHE).then((cache) => cache.match(mediaCacheKey(item))).then(async (response) => {
      if (!active || !response) return;
      objectUrl = URL.createObjectURL(await response.blob());
      if (active) setUrl(objectUrl);
    }).catch(() => undefined);
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [item?.contentId, item?.mediaUrl]);
  return url;
}

function PlayerVideo({ source, loop, onEnded, onFailure }: { source: string | null; loop: boolean; onEnded: () => void; onFailure: () => void }) {
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
  }, [source, start]);

  useEffect(() => {
    if (playback !== "error") return;
    const timer = window.setTimeout(retry, 8_000);
    return () => window.clearTimeout(timer);
  }, [playback, retry]);

  return <>
    <video
      ref={videoRef}
      src={source || undefined}
      autoPlay
      muted
      loop={loop}
      playsInline
      preload="auto"
      disablePictureInPicture
      onLoadedData={() => void start()}
      onCanPlay={() => void start()}
      onPlaying={() => setPlayback("playing")}
      onEnded={onEnded}
      onWaiting={() => setPlayback("waiting")}
      onStalled={() => setPlayback("waiting")}
      onError={() => { setPlayback("error"); onFailure(); }}
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
  const [scannerOpen, setScannerOpen] = useState(false);
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
  return <main className="pairing"><section><div className="brand">Swiss<span>Compact</span></div><div className="eyebrow">Display Player</div><h1>Display aktivieren</h1><p>{autoConnect && busy ? "QR-Code erkannt. Der Bildschirm wird automatisch verbunden …" : "Scannen Sie den QR-Code oder geben Sie Bildschirm-ID und Aktivierungscode aus dem Portal ein."}</p><button type="button" className="pairing-scan-button" onClick={() => setScannerOpen(true)} disabled={busy}><span>▣</span> QR-Code scannen</button><div className="pairing-divider"><span>oder manuell eingeben</span></div><form onSubmit={pair}><label>1 · Bildschirm-ID<input value={displayId} onChange={(event) => setDisplayId(event.target.value)} required autoComplete="off" /></label><label>2 · Aktivierungscode<input className="code" value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} required maxLength={8} autoComplete="one-time-code" /></label>{error && <div className="error">{error}</div>}<button disabled={busy}>{busy ? "Wird verbunden …" : "Bildschirm verbinden"}</button></form><small>Der Aktivierungscode ist 30 Minuten gültig und kann nur einmal verwendet werden.</small></section>{scannerOpen && <PairingQrScanner onClose={() => setScannerOpen(false)} onScanned={(nextDisplayId, nextCode) => { setScannerOpen(false); setDisplayId(nextDisplayId); setCode(nextCode); void connect(nextDisplayId, nextCode); }}/>}</main>;
}

function Player() {
  const query = new URLSearchParams(location.search);
  const queryDisplayId = query.get("display") || "";
  const queryActivationCode = (query.get("code") || "").toUpperCase();
  const autoConnectPairing = query.get("connect") === "1";
  const previewDisplayId = query.get("preview") || "";
  const previewCampaignId = query.get("campaign") || "";
  const forcePairing = query.get("pair") === "1";
  const [token, setToken] = useState(() => forcePairing || previewDisplayId ? "" : localStorage.getItem(TOKEN_KEY) || "");
  const [config, setConfig] = useState<DeviceConfig | null>(() => { if (forcePairing || previewDisplayId) return null; try { return JSON.parse(localStorage.getItem(CONFIG_KEY) || "null"); } catch { return null; } });
  const [index, setIndex] = useState(0);
  const [online, setOnline] = useState(navigator.onLine);
  const [message, setMessage] = useState("Konfiguration wird geladen …");
  const [mediaFailed, setMediaFailed] = useState(false);

  const loadConfig = useCallback(async (activeToken = token) => {
    if (!activeToken && !previewDisplayId) return;
    try {
      const next = previewDisplayId
        ? await request<DeviceConfig>(`/api/dashboard/records?portalPreview=${encodeURIComponent(previewDisplayId)}${previewCampaignId ? `&campaign=${encodeURIComponent(previewCampaignId)}` : ""}`)
        : await request<DeviceConfig>("/api/dashboard/records?device=config", { headers: { Authorization: `Bearer ${activeToken}` } });
      const cached = await cacheMedia([...next.playlist, ...(next.fallback ? [next.fallback] : [])]);
      setConfig(next);
      setMediaFailed(false);
      if (!previewDisplayId) localStorage.setItem(CONFIG_KEY, JSON.stringify(next));
      if (!previewDisplayId) await request("/api/dashboard/records?device=ack", { method: "POST", headers: { Authorization: `Bearer ${activeToken}`, "Content-Type": "application/json" }, body: JSON.stringify({ configurationVersion: next.configurationVersion, cachedContentIds: cached.cached, error: cached.errors.length ? `Nicht offline gespeichert: ${cached.errors.join(", ")}` : null }) });
      setOnline(true); setMessage(next.playlist.length ? "" : "Noch keine aktive Kampagne für dieses Display.");
    } catch (reason) {
      setOnline(false);
      if (!previewDisplayId && reason instanceof Error && /Gerätetoken/.test(reason.message)) { localStorage.removeItem(TOKEN_KEY); setToken(""); }
      else setMessage("Keine Verbindung. Erneuter Versuch läuft …");
    }
  }, [token, previewDisplayId, previewCampaignId]);

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
    // Videos bestimmen ihre Laufzeit selbst und wechseln erst beim `ended`-Event.
    // Nur Bilder, Texte und Web-Inhalte verwenden die eingestellte Dauer.
    if (item.contentType === "video") return;
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

  const scheduledItem = config?.playlist[index % Math.max(1, config.playlist.length)];
  const usingFallback = Boolean(config?.fallback && (!scheduledItem || mediaFailed));
  const item = usingFallback ? config?.fallback || undefined : scheduledItem;
  const playableUrl = usePlayableUrl(item);
  const advancePlaylist = useCallback(() => {
    const playlistLength = config?.playlist.length || 0;
    if (usingFallback || playlistLength < 2) return;
    setMediaFailed(false);
    setIndex((current) => (current + 1) % playlistLength);
  }, [config?.playlist.length, usingFallback]);

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
  return <main className="stage" onDoubleClick={() => document.documentElement.requestFullscreen?.()}>{item ? <section className={`content content-${item.contentType}`} key={`${item.contentId}-${index}-${usingFallback ? "fallback" : "scheduled"}`}>{item.contentType === "image" && playableUrl ? <img src={playableUrl} alt="" onError={() => setMediaFailed(true)}/> : item.contentType === "video" && playableUrl ? <PlayerVideo source={playableUrl} loop={usingFallback || config?.playlist.length === 1} onEnded={advancePlaylist} onFailure={() => setMediaFailed(true)}/> : <div className="text-content">{item.payload?.text || item.title}</div>}</section> : <section className="idle"><div className="brand">Swiss<span>Compact</span></div><p>{message}</p>{!previewDisplayId && <button className="reconnect" onClick={resetPairing}>Aktivierungscode eingeben</button>}</section>}{usingFallback && <div className="player-mode fallback">Ersatzinhalt</div>}{config?.mode === "test" && <div className="player-mode test">Testbetrieb</div>}{previewDisplayId && <div className="player-mode preview">Gerätevorschau</div>}<PlayerDisplayControls/><div className={`connection ${online ? "online" : "offline"}`} title={online ? "Verbunden" : "Offline"}></div></main>;
}

createRoot(document.getElementById("player-root")!).render(<Player/>);

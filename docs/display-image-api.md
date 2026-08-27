# SwissCompact Display Image API

Der Inhalts-Konfigurator kann automatisch generierte Bilder über einen
serverseitigen Proxy beziehen. Der Browser erhält niemals den API-Schlüssel des
verwendeten Bildanbieters.

**Status: live.** Implementiert in `api/display-images.ts`, ruft OpenAIs
Bild-API (`gpt-image-1`, konfigurierbar über `OPENAI_IMAGE_MODEL`) mit dem
bereits gesetzten `OPENAI_API_KEY` auf — kein zusätzlicher Schlüssel nötig.
Standardmässig verdrahtet über den Meta-Tag `swisscompact-image-api` in
`index.html` (`content="/api/display-images"`), keine Env-Var-Konfiguration
erforderlich.

## Konfiguration

Beim Build wird der Endpoint über folgende Variable gesetzt:

```env
VITE_SWISSCOMPACT_IMAGE_API_URL=https://api.swisscompact.com/v1/display-images
```

Alternativ kann der Wert im Meta-Tag `swisscompact-image-api` in `index.html`
eingetragen werden. Die Umgebungsvariable hat Vorrang. Aktuell ist nur der
Meta-Tag gesetzt (auf die eigene `/api/display-images`-Route) — die Env-Var
bleibt für einen späteren Wechsel auf einen externen Bildanbieter frei.

## Anfrage

```http
POST /v1/display-images
Content-Type: application/json
```

```json
{
  "prompt": "Ein saisonales Schweizer Restaurantmotiv, elegant und warm",
  "room": "restaurant",
  "role": "background",
  "orientation": "landscape"
}
```

- `room`: interner Raum-Presetname
- `role`: `background` oder `hero`
- `orientation`: `landscape` oder `portrait`

## Antwort

Die API kann eines der folgenden Felder liefern:

```json
{ "dataUrl": "data:image/webp;base64,..." }
```

```json
{ "imageBase64": "UklGR..." }
```

```json
{ "imageUrl": "https://cdn.swisscompact.com/generated/abc.webp" }
```

Bei `imageUrl` muss der Bildserver CORS für die Website erlauben. Das Frontend
lädt und optimiert das Bild vor dem Einsetzen. Empfohlen werden WebP-Dateien mit
maximal 1600 Pixeln an der längsten Kante.

## Sicherheitsanforderungen

- Schlüssel des KI-Anbieters ausschliesslich serverseitig speichern.
- Benutzer und Kontingente am Proxy authentifizieren und limitieren.
- Prompt und generiertes Bild moderieren.
- Nur HTTPS-URLs und freigegebene Bildtypen ausgeben.
- Zeitlimits, Kostenlimits und nachvollziehbare Request-IDs verwenden.

Ohne konfigurierten Endpoint bleibt die manuelle SwissCompact-Bildbestellung
voll funktionsfähig. Sie erzeugt eine Referenznummer und öffnet eine
vorbereitete E-Mail mit Raum, Verwendungsart und Bildbeschreibung.

## Umsetzung der Sicherheitsanforderungen

| Anforderung | Status |
|---|---|
| Schlüssel nur serverseitig | ✓ — `OPENAI_API_KEY`, nie im Client |
| Nutzer/Kontingente limitieren | ✓ — 6 Anfragen / 10 Min. pro IP (best-effort, siehe `api/_lib/assistant/security.ts`) |
| Prompt/Bild moderieren | Teilweise — verlässt sich auf OpenAIs eigene Inhaltsrichtlinien (abgelehnte Prompts liefern HTTP 422); keine zusätzliche eigene Moderationsschicht |
| Nur HTTPS/freigegebene Bildtypen | ✓ — liefert ausschliesslich `data:image/png;base64,...`, keine externe Bild-URL |
| Zeit-/Kostenlimits, Request-IDs | ✓ — 40s Timeout, Rate-Limit als Kostenbremse, `requestId` in jeder Antwort/jedem Log |

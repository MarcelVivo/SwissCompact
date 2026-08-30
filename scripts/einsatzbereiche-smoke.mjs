import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const pages = [
  { slug: "retail-interaktive-beratung", title: "Vom Wanderschuh zum Rucksack." },
  { slug: "gastronomie-digitale-menuboards", title: "Ankommen. Auswählen. Geniessen." },
  { slug: "buero-videokonferenz", title: "Menschen verbinden. Überall." },
  { slug: "retail-digital-styling", title: "Beratung wird zum Erlebnis." },
  { slug: "transparente-led-folien", title: "Glas wird zur Medienfläche." },
  { slug: "kino-digital-signage", title: "Jede Fläche wird zum Erlebnis." },
  { slug: "museum-interaktive-infoscreens", title: "Geschichte wird zum Erlebnis." },
  { slug: "hotel-welcome-info-sales-screens", title: "Willkommen wird zum Erlebnis." },
  { slug: "beauty-salon-info-werbescreens", title: "Schönheit wird sichtbar." },
  { slug: "skipisten-info-werbescreens", title: "Orientierung auf einen Blick." },
];

assert.ok(
  existsSync(new URL("../dist/einsatzbereiche.css", import.meta.url)),
  "Geteiltes Stylesheet für Einsatzbereiche-Seiten fehlt im Build",
);

for (const { slug, title } of pages) {
  const distPath = `dist/einsatzbereiche/${slug}/index.html`;
  assert.ok(existsSync(new URL(`../${distPath}`, import.meta.url)), `${distPath} fehlt im Build`);
  const html = read(distPath);
  assert.ok(html.includes(`<title>${title} – SwissCompact</title>`), `${slug}: erwarteter Titel fehlt`);
  assert.ok(html.includes('href="/einsatzbereiche.css"'), `${slug}: Stylesheet-Verweis fehlt`);
  assert.ok(html.includes('class="station__details"') === false, `${slug}: Seite darf keine Journey-Overlay-Markup enthalten`);
  assert.ok(html.includes('href="/"'), `${slug}: Rücklink zur Startseite fehlt`);
  assert.ok(html.includes('href="/#branchen"'), `${slug}: Link zum Virtual Showroom fehlt`);
  assert.ok(html.includes('href="/?open-consultation=1#projekt-starten"'), `${slug}: "Projekt besprechen" muss zum KI-CTA-Funnel führen, nicht zu mailto`);
  assert.ok(!html.includes('mailto:kontakt@swisscompact.com">Projekt besprechen'), `${slug}: "Projekt besprechen" darf nicht mehr auf mailto zeigen`);
}

const stationFiles = [
  "station02Problem", "station03Solution", "station04DigitalSignage", "station05Software",
  "station06LedWalls", "station07Industries", "station08Process", "station09Hotel",
  "station10BeautySalon", "station11SkiPanorama",
];
const knownSlugs = new Set(pages.map((page) => page.slug));
for (const file of stationFiles) {
  const source = read(`src/stations/${file}.ts`);
  const match = source.match(/detailUrl:\s*"\/einsatzbereiche\/([^/]+)\/"/);
  assert.ok(match, `${file}: detailUrl fehlt oder zeigt nicht auf /einsatzbereiche/`);
  assert.ok(knownSlugs.has(match[1]), `${file}: detailUrl-Slug "${match[1]}" hat keine passende Einsatzbereiche-Seite`);
}

console.log("Einsatzbereiche smoke checks passed.");

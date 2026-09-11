import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, normalize } from "node:path";

const projectRoot = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, projectRoot), "utf8");

const htmlFiles = [
  "dist/index.html",
  "dist/legal.html",
  ...[
    "website-marke",
    "business-dashboard",
    "display-portal",
    "hardware-betrieb",
  ].map((slug) => `dist/plattform/${slug}/index.html`),
  ...[
    "retail-interaktive-beratung",
    "gastronomie-digitale-menuboards",
    "buero-videokonferenz",
    "retail-digital-styling",
    "transparente-led-folien",
    "kino-digital-signage",
    "museum-interaktive-infoscreens",
    "hotel-welcome-info-sales-screens",
    "beauty-salon-info-werbescreens",
    "skipisten-info-werbescreens",
  ].map((slug) => `dist/einsatzbereiche/${slug}/index.html`),
];

const localTarget = (sourceFile, href) => {
  const rawPath = href.split("#", 1)[0].split("?", 1)[0];
  if (!rawPath || /^(?:mailto:|tel:|https?:)/.test(rawPath)) return null;

  const relativePath = rawPath.startsWith("/")
    ? rawPath.slice(1)
    : normalize(join(dirname(sourceFile.replace(/^dist\//, "")), rawPath));

  if (!relativePath) return "dist/index.html";
  if (relativePath.endsWith("/")) return `dist/${relativePath}index.html`;
  if (!relativePath.includes(".")) {
    const directoryIndex = `dist/${relativePath}/index.html`;
    return existsSync(new URL(directoryIndex, projectRoot))
      ? directoryIndex
      : `dist/${relativePath}.html`;
  }
  return `dist/${relativePath}`;
};

for (const htmlFile of htmlFiles) {
  assert.ok(existsSync(new URL(htmlFile, projectRoot)), `${htmlFile} fehlt im Build`);
  const html = read(htmlFile);
  const hrefs = [...html.matchAll(/<a\b[^>]*\bhref=["']([^"']+)["']/gi)]
    .map((match) => match[1]);
  if (htmlFile !== "dist/legal.html") {
    assert.ok(hrefs.length > 0, `${htmlFile} enthält keine Links`);
  }

  for (const href of hrefs) {
    const target = localTarget(htmlFile, href);
    if (!target) continue;
    assert.ok(
      existsSync(new URL(target, projectRoot)),
      `${htmlFile}: Link ${href} hat kein Build-Ziel (${target})`,
    );
  }
}

const index = read("dist/index.html");
const platformLinks = [...index.matchAll(
  /<a\b[^>]*class=["'][^"']*business-platform__card-link[^"']*["'][^>]*href=["']([^"']+)["']/gi,
)].map((match) => match[1]);
assert.equal(platformLinks.length, 4, "Alle vier Plattformkarten brauchen einen nativen Link");

const styles = read("src/styles.css");
assert.match(
  styles,
  /\.business-platform__card-link\s*\{[^}]*position:\s*absolute;[^}]*inset:\s*0;/s,
  "Der native Link muss die gesamte Plattformkarte abdecken",
);
assert.doesNotMatch(
  styles,
  /\.station__details\s*\{[^}]*display:\s*none;/s,
  "Detaillinks dürfen auf kleinen Mobilgeräten nicht ausgeblendet werden",
);

const stationFiles = [
  "station02Problem.ts",
  "station03Solution.ts",
  "station04DigitalSignage.ts",
  "station05Software.ts",
  "station06LedWalls.ts",
  "station07Industries.ts",
  "station08Process.ts",
  "station09Hotel.ts",
  "station10BeautySalon.ts",
  "station11SkiPanorama.ts",
];
for (const stationFile of stationFiles) {
  const source = read(`src/stations/${stationFile}`);
  const detailUrl = source.match(/detailUrl:\s*["']([^"']+)["']/)?.[1];
  assert.ok(detailUrl, `${stationFile}: detailUrl fehlt`);
  const target = localTarget("dist/index.html", detailUrl);
  assert.ok(target && existsSync(new URL(target, projectRoot)), `${stationFile}: ${detailUrl} fehlt im Build`);
}

console.log(`Public link smoke checks passed (${htmlFiles.length} pages).`);

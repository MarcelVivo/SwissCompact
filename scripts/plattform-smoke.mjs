import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const index = read("dist/index.html");

const pages = [
  { slug: "website-marke", title: "Ihre Website. Ihr Wachstumsmotor." },
  { slug: "business-dashboard", title: "Ein System für Ihr ganzes Unternehmen." },
  { slug: "display-portal", title: "Inhalte und Displays. Zentral gesteuert." },
  { slug: "hardware-betrieb", title: "Displays und LED-Systeme, betreut." },
];

assert.ok(
  existsSync(new URL("../dist/plattform.css", import.meta.url)),
  "Geteiltes Stylesheet für Plattform-Seiten fehlt im Build",
);

for (const { slug, title } of pages) {
  const distPath = `dist/plattform/${slug}/index.html`;
  assert.ok(existsSync(new URL(`../${distPath}`, import.meta.url)), `${distPath} fehlt im Build`);
  const html = read(distPath);
  assert.ok(html.includes(`<title>${title} – SwissCompact</title>`), `${slug}: erwarteter Titel fehlt`);
  assert.ok(html.includes('href="/plattform.css"'), `${slug}: Stylesheet-Verweis fehlt`);
  assert.ok(html.includes('href="/?open-consultation=1#projekt-starten"'), `${slug}: "Projekt besprechen" muss zum KI-CTA-Funnel führen, nicht zu mailto`);
  assert.ok(!html.includes('mailto:kontakt@swisscompact.com">Projekt besprechen'), `${slug}: "Projekt besprechen" darf nicht auf mailto zeigen`);
  assert.ok(html.includes('href="/#plattform"'), `${slug}: Rücklink zur Plattform-Übersicht fehlt`);
  assert.match(html, /Illustratives Beispiel/, `${slug}: Beispiel muss klar als illustrativ gekennzeichnet sein`);

  assert.ok(index.includes(`href="/plattform/${slug}/"`), `index.html: Karte für ${slug} verlinkt nicht auf die Detailseite`);
}

console.log("Plattform smoke checks passed.");

// One-off generator for the 4 static "Plattform" sales detail pages linked
// from the #plattform section's business-platform cards in index.html.
// Not part of the build — run manually, re-run after editing the content
// below, then commit the generated HTML files.
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputRoot = resolve(rootDirectory, "public/site/plattform");

const ICONS = {
  target: '<path d="M12 3a9 9 0 100 18 9 9 0 000-18zM12 8a4 4 0 100 8 4 4 0 000-8zM12 11.5a.5.5 0 100 1 .5.5 0 000-1z"/>',
  layout: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M9 9v11"/>',
  code: '<path d="M8 8l-4 4 4 4M16 8l4 4-4 4M13 5l-2 14"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9.5" r="1.5"/><path d="M21 16l-5-5-4 4-2-2-5 5"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M20 20l-4.8-4.8"/>',
  refresh: '<path d="M4 4v6h6M20 20v-6h-6M4.5 15a8 8 0 0013.9 3.5M19.5 9a8 8 0 00-13.9-3.5"/>',
  users: '<circle cx="9" cy="8" r="3.2"/><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6M16 8.2a3 3 0 110 6M22 20c0-2.8-2-5-4.8-5.7"/>',
  flow: '<path d="M4 6h6l4 6h6M4 18h6l4-6"/>',
  shield: '<path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z"/>',
  bot: '<rect x="5" y="9" width="14" height="10" rx="2"/><path d="M12 5v4M9 14h.01M15 14h.01"/>',
  globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.5 2.4 3.8 5.4 3.8 8.5s-1.3 6.1-3.8 8.5c-2.5-2.4-3.8-5.4-3.8-8.5S9.5 5.9 12 3.5z"/>',
  invoice: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>',
  grid: '<rect x="3" y="4" width="8" height="8" rx="1"/><rect x="13" y="4" width="8" height="8" rx="1"/><rect x="3" y="14" width="8" height="6" rx="1"/><rect x="13" y="14" width="8" height="6" rx="1"/>',
  sparkle: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
  tool: '<path d="M14.5 3.5a4 4 0 00-5.4 5.4L3.5 15.5a2 2 0 002.8 2.8l6.6-5.6a4 4 0 005.4-5.4l-2.6 2.6-2-2z"/>',
  truck: '<rect x="2" y="7" width="12" height="9" rx="1"/><path d="M14 10h4l3 3v3h-7z"/><circle cx="6" cy="18" r="1.6"/><circle cx="17" cy="18" r="1.6"/>',
  wifi: '<path d="M4 9a13 13 0 0116 0M7 12.5a8.5 8.5 0 0110 0M10 16a4 4 0 014 0"/><circle cx="12" cy="19.5" r=".6"/>',
  activity: '<path d="M3 12h4l2-7 4 14 2-7h6"/>',
  headset: '<path d="M4 13v-1a8 8 0 0116 0v1"/><rect x="3" y="13" width="4" height="6" rx="1.5"/><rect x="17" y="13" width="4" height="6" rx="1.5"/><path d="M20 19v1a2 2 0 01-2 2h-3"/>',
};

const pages = [
  {
    slug: "website-marke",
    kicker: "Baustein 01 · Website & Marke",
    title: "Ihre Website. Ihr Wachstumsmotor.",
    description: "Strategie, UX, Design, Entwicklung, Inhalte, Bilder und Texte aus einer Hand – für eine Website, die nicht nur gut aussieht, sondern Anfragen bringt.",
    features: [
      { icon: "target", label: "Strategie & Konzeption", text: "Positionierung, Zielgruppen und Struktur, bevor die erste Zeile Text steht." },
      { icon: "layout", label: "UX & Design", text: "Klare Nutzerführung und eine Bildsprache, die zur Marke passt." },
      { icon: "code", label: "Entwicklung", text: "Schnell, mobil-optimiert und als installierbare App-Version nutzbar." },
      { icon: "image", label: "Inhalte & Bilder", text: "Texte, Fotografie und Bildmaterial – abgestimmt auf das Angebot." },
      { icon: "search", label: "SEO & GEO-Optimierung", text: "Sichtbarkeit in Suchmaschinen und in KI-gestützten Suchantworten." },
      { icon: "refresh", label: "Laufende Optimierung", text: "Regelmässige Nachjustierung anhand von echtem Nutzerverhalten." },
    ],
    steps: [
      { title: "Analyse & Konzept", text: "Zielgruppen, Wettbewerb und Angebot klären, Struktur und Content-Plan festlegen." },
      { title: "Design & Umsetzung", text: "Gestaltung, Entwicklung und Inhalte entstehen parallel, mit regelmässigen Abstimmungen." },
      { title: "Test & Abnahme", text: "Funktions-, Performance- und Cross-Device-Tests, gemeinsame Abnahme vor dem Livegang." },
      { title: "Betrieb & Optimierung", text: "Technische Pflege, SEO-Nachjustierung und Weiterentwicklung nach dem Start." },
    ],
    example: "Ein Fachgeschäft ersetzt seine veraltete Website durch eine neue, SEO-optimierte Seite mit klarer Angebotsstruktur. Der Kontakt-Button führt direkt in den KI-gestützten Beratungs-Chat – Anfragen lassen sich dadurch schon vor dem ersten persönlichen Kontakt einordnen.",
    body: [
      { h2: "Mehr als eine Visitenkarte", p: "Eine Website, die nur existiert, bringt kein Geschäft. Entscheidend ist, ob sie die richtigen Personen erreicht, ihnen in Sekunden zeigt, worum es geht, und ihnen einen einfachen nächsten Schritt anbietet. Genau darauf ist dieser Baustein ausgerichtet: Strategie und Design arbeiten mit Technik und Content zusammen statt getrennt voneinander." },
      { p: "SEO sorgt für Sichtbarkeit in klassischen Suchmaschinen, GEO-Optimierung zusätzlich dafür, dass die Seite auch in KI-gestützten Suchantworten korrekt und vollständig wiedergegeben wird – ein Bereich, der für viele Wettbewerber heute noch keine Rolle spielt." },
      { p: "Jede Website wird mit dem gleichen Beratungs-Chat verbunden, der auch auf der Hauptseite genutzt wird: Anfragen werden direkt qualifiziert und landen strukturiert im Business Dashboard, statt in einem unbeobachteten Postfach zu verschwinden." },
    ],
  },
  {
    slug: "business-dashboard",
    kicker: "Baustein 02 · Business Dashboard",
    title: "Ein System für Ihr ganzes Unternehmen.",
    description: "CRM, ERP, Projekte, Marketing und Automatisierung in einem auf Ihr Unternehmen zugeschnittenen Dashboard – mit eigener Domain und klaren Rollen.",
    features: [
      { icon: "users", label: "Kundenverwaltung (CRM)", text: "Zentrale Kundendaten, Verlauf und Kommunikation an einem Ort." },
      { icon: "flow", label: "Auftragstrichter", text: "Von der ersten Anfrage bis zur Abnahme – jede Phase sichtbar." },
      { icon: "shield", label: "Rollen & Rechte", text: "Passende Sichtbarkeit für jedes Teammitglied, nichts Unnötiges." },
      { icon: "bot", label: "KI-Bots für Administration", text: "Wiederkehrende Aufgaben wie Nachfassen und Sortieren automatisiert." },
      { icon: "globe", label: "Eigene Domain", text: "Eigenständiges, whitelabel-fähiges System statt Insellösung." },
      { icon: "invoice", label: "Rechnungen & Finanzen", text: "Angebote, Rechnungen und Zahlungsfreigaben im gleichen System." },
    ],
    steps: [
      { title: "Bedarfsanalyse", text: "Bestehende Prozesse, Rollen und Schnittstellen erfassen." },
      { title: "Konzeption & Aufbau", text: "Struktur, Automatisierungen und KI-Bots für den konkreten Betrieb einrichten." },
      { title: "Schulung & Abnahme", text: "Team einarbeiten, Abläufe gemeinsam testen und abnehmen." },
      { title: "Betrieb & Weiterentwicklung", text: "Laufende Anpassung, Support und neue Automatisierungen nach Bedarf." },
    ],
    example: "Ein Betrieb mit mehreren Standorten bündelt Kundenanfragen, Projektstatus und Rechnungsstellung in einem Dashboard. Anfragen von der Website werden automatisch als Kontakt und Chance angelegt, grössere Zahlungsfreigaben laufen nach dem Vier-Augen-Prinzip.",
    body: [
      { h2: "Weg von Excel-Listen und Insellösungen", p: "Viele Betriebe verwalten Kunden, Projekte, Rechnungen und Marketing in getrennten Tabellen, E-Mail-Postfächern und Tools, die nicht miteinander sprechen. Das Business Dashboard bringt diese Bereiche in ein System, das auf die tatsächlichen Abläufe des Unternehmens zugeschnitten ist – nicht umgekehrt." },
      { p: "Anfragen, die über die Website oder den KI-Beratungs-Chat eingehen, landen automatisch als Kontakt und Verkaufschance im Dashboard, statt manuell übertragen werden zu müssen. Von dort aus begleitet der Auftragstrichter jede Anfrage durch Beratung, Angebot, Umsetzung, Abnahme und Rechnungsstellung." },
      { p: "Weil das Dashboard auf einer eigenen Domain läuft und Rollen klar trennt, sehen Teammitglieder genau das, was für ihre Aufgabe relevant ist – von der Kundenberatung bis zur Buchhaltung." },
    ],
  },
  {
    slug: "display-portal",
    kicker: "Baustein 03 · Display Portal",
    title: "Inhalte und Displays. Zentral gesteuert.",
    description: "Die SwissCompact Software für Inhalte, Kampagnen, Displays und LED-Netzwerke – einfach bedienbar unter swisscompact.com/portal oder White-Label auf Ihrer eigenen Domain.",
    features: [
      { icon: "grid", label: "Zentrale Steuerung", text: "Alle Displays und LED-Netzwerke von einer Oberfläche aus verwalten." },
      { icon: "sparkle", label: "Content-Erstellung mit KI", text: "Inhalte schnell erstellen und an Anlässe oder Angebote anpassen." },
      { icon: "calendar", label: "Kampagnenplanung", text: "Zeitgesteuerte Kampagnen für einzelne Standorte oder Gruppen." },
      { icon: "globe", label: "White-Label", text: "Eigene Domain und eigenes Branding statt SwissCompact-Absender." },
      { icon: "shield", label: "Rollen & Freigaben", text: "Teams erstellen Inhalte, Freigaben verhindern Fehlveröffentlichungen." },
      { icon: "eye", label: "Live-Vorschau", text: "Inhalte vor der Veröffentlichung exakt so prüfen, wie sie erscheinen." },
    ],
    steps: [
      { title: "Einrichtung", text: "Displays und LED-Netzwerk im Portal anlegen und miteinander verbinden." },
      { title: "Content & Kampagnen", text: "Erste Inhalte erstellen, KI-Unterstützung für Varianten und Anpassungen nutzen." },
      { title: "Testlauf & Freigabe", text: "Vorschau prüfen, Kampagnen freigeben und zeitlich einplanen." },
      { title: "Laufender Betrieb", text: "Inhalte aktuell halten, neue Kampagnen planen, Wirkung beobachten." },
    ],
    example: "Ein Betrieb mit Displays an mehreren Standorten plant im Portal eine Wochenkampagne, lässt sich dafür Vorschläge von der KI erstellen und veröffentlicht sie zeitgesteuert an allen Standorten gleichzeitig – ohne dass jemand vor Ort etwas umstecken muss.",
    body: [
      { h2: "Inhalte ändern, ohne Techniker zu rufen", p: "Klassische Beschilderung und statische Displays haben einen Nachteil: Jede Änderung braucht Zeit, Material oder eine Vor-Ort-Anfahrt. Das Display Portal löst genau das – Inhalte, Kampagnen und ganze Bildschirmnetzwerke lassen sich zentral und in Echtzeit verwalten." },
      { p: "Die integrierte Content-Erstellung mit KI hilft dabei, neue Varianten für Aktionen, Saisons oder einzelne Standorte schnell umzusetzen, ohne jedes Mal bei null anzufangen. Freigaben und Rollen sorgen dafür, dass trotzdem nichts ungeprüft live geht." },
      { p: "Verfügbar direkt unter swisscompact.com/portal oder als White-Label-Lösung auf der eigenen Domain – je nachdem, wie stark das Portal als eigenständiges Produkt gegenüber Kundschaft oder Mitarbeitenden auftreten soll." },
    ],
  },
  {
    slug: "hardware-betrieb",
    kicker: "Baustein 04 · Hardware & Betrieb",
    title: "Displays und LED-Systeme, betreut.",
    description: "Displays und LED-Systeme inklusive Planung, Montage, Einrichtung, Monitoring, Wartung und Support – von der Konzeption bis zum laufenden Betrieb.",
    features: [
      { icon: "tool", label: "Hardware-Konzeption", text: "Passende Displays und LED-Lösung für Raum, Licht und Sichtabstand." },
      { icon: "truck", label: "Installation vor Ort", text: "Fachgerechte Montage, Verkabelung und Einrichtung durch ein Team." },
      { icon: "wifi", label: "Netzwerk & Anbindung", text: "Stabile Verbindung zum Display Portal und ins Unternehmensnetz." },
      { icon: "activity", label: "Monitoring", text: "Status aller Geräte im Blick, bevor Kundschaft einen Ausfall bemerkt." },
      { icon: "refresh", label: "Wartung", text: "Regelmässige Kontrolle, Reinigung und Software-Updates." },
      { icon: "headset", label: "Support", text: "Ein direkter Ansprechpartner bei Störungen statt mehrerer Lieferanten." },
    ],
    steps: [
      { title: "Planung & Konzept", text: "Raum, Anforderungen und passende Hardware gemeinsam festlegen." },
      { title: "Beschaffung & Installation", text: "Geräte beschaffen, montieren und fachgerecht einrichten." },
      { title: "Abnahme & Inbetriebnahme", text: "Gemeinsame Prüfung, Übergabe und Anbindung an das Display Portal." },
      { title: "Laufende Betreuung", text: "Monitoring, Wartung und Support während des gesamten Betriebs." },
    ],
    example: "Ein Standort erhält eine neue LED-Wand für den Empfangsbereich. Von der Konzeption über die Montage bis zur Anbindung an das Display Portal übernimmt SwissCompact den gesamten Ablauf – inklusive Fernwartung und Monitoring danach.",
    body: [
      { h2: "Ein Ansprechpartner statt mehrerer Lieferanten", p: "Hardware-Projekte scheitern selten an der Technik selbst, sondern daran, dass Planung, Lieferung, Montage und späterer Support über verschiedene Anbieter verteilt sind. Dieser Baustein bündelt den gesamten Ablauf bei einem Ansprechpartner." },
      { p: "Die Hardware-Konzeption berücksichtigt Lichtverhältnisse, Sichtabstände und die spätere Nutzung im Display Portal, damit Displays und LED-Flächen von Anfang an zum geplanten Content passen, statt nachträglich angepasst werden zu müssen." },
      { p: "Nach der Installation endet die Betreuung nicht: Monitoring erkennt Auffälligkeiten frühzeitig, regelmässige Wartung hält Geräte und Software aktuell, und Support-Anfragen laufen über eine feste Anlaufstelle statt über wechselnde Kontakte." },
    ],
  },
];

function escapeHtml(value) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function renderPage(page) {
  const url = `https://swisscompact.com/plattform/${page.slug}/`;
  const metaDescription = escapeHtml(page.description);

  const featuresHtml = page.features
    .map((feature) => `<li><svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[feature.icon]}</svg><strong>${escapeHtml(feature.label)}</strong><span>${escapeHtml(feature.text)}</span></li>`)
    .join("\n            ");

  const stepsHtml = page.steps
    .map((step) => `<li><strong>${escapeHtml(step.title)}</strong><span>${escapeHtml(step.text)}</span></li>`)
    .join("\n            ");

  const bodyHtml = page.body
    .map((block) => `${block.h2 ? `<h2>${escapeHtml(block.h2)}</h2>` : ""}<p>${escapeHtml(block.p)}</p>`)
    .join("\n            ");

  return `<!doctype html>
<html lang="de">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <meta name="theme-color" content="#060607" />
    <meta name="description" content="${metaDescription}" />
    <meta name="robots" content="index,follow" />
    <meta property="og:type" content="website" />
    <meta property="og:locale" content="de_CH" />
    <meta property="og:title" content="${escapeHtml(page.title)} – SwissCompact" />
    <meta property="og:description" content="${metaDescription}" />
    <meta property="og:url" content="${url}" />
    <link rel="canonical" href="${url}" />
    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
    <link rel="stylesheet" href="/plattform.css" />
    <title>${escapeHtml(page.title)} – SwissCompact</title>
  </head>
  <body>
    <header class="pf-header">
      <a class="pf-logo" href="/">Swiss<span>Compact</span></a>
      <a class="pf-header__cta" href="/#projekt-starten">Projekt starten</a>
    </header>

    <main>
      <section class="pf-hero">
        <p class="pf-eyebrow">${escapeHtml(page.kicker)}</p>
        <h1>${escapeHtml(page.title)}</h1>
        <p>${escapeHtml(page.description)}</p>
      </section>

      <section class="pf-section">
        <h2>Was enthalten ist</h2>
        <ul class="pf-features">
            ${featuresHtml}
        </ul>
      </section>

      <section class="pf-section">
        <h2>So läuft es ab</h2>
        <ol class="pf-steps">
            ${stepsHtml}
        </ol>
      </section>

      <section class="pf-section">
        <h2>Ein Beispiel</h2>
        <div class="pf-example">
          <span class="pf-example__label">Illustratives Beispiel</span>
          <p>${escapeHtml(page.example)}</p>
        </div>
      </section>

      <section class="pf-section pf-body">
            ${bodyHtml}
      </section>

      <section class="pf-cta">
        <h2>Bereit, das für Ihr Unternehmen zu besprechen?</h2>
        <p>Zurück zur Übersicht der Gesamtlösung oder direkt mit unserem Beratungs-Chat starten.</p>
        <div class="pf-cta__actions">
          <a class="primary" href="/#plattform">Zur Übersicht</a>
          <a class="secondary" href="/?open-consultation=1#projekt-starten">Projekt besprechen</a>
        </div>
      </section>
    </main>

    <footer class="pf-footer">
      <a href="/">SwissCompact</a>
      <span>Digitale Räume. Vernetzte Inhalte. Messbare Wirkung.</span>
      <a href="mailto:kontakt@swisscompact.com">kontakt@swisscompact.com</a>
      <span>© 2026 SwissCompact</span>
    </footer>
  </body>
</html>
`;
}

for (const page of pages) {
  const dir = resolve(outputRoot, page.slug);
  await mkdir(dir, { recursive: true });
  const filePath = resolve(dir, "index.html");
  await writeFile(filePath, renderPage(page), "utf8");
  process.stdout.write(`Wrote ${filePath}\n`);
}

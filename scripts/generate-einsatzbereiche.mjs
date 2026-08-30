// One-off generator for the 10 static "Einsatzbereiche" detail pages
// linked from stations 2-11's "Details entdecken" (see src/stations/*.ts
// detailUrl fields). Not part of the build — run manually, re-run after
// editing the content below, then commit the generated HTML files.
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputRoot = resolve(rootDirectory, "public/site/einsatzbereiche");

const pages = [
  {
    slug: "retail-interaktive-beratung",
    kicker: "Retail · Schuhgeschäft",
    title: "Vom Wanderschuh zum Rucksack.",
    description: "Digitale Beratung führt direkt zum passenden Produkt und macht Sortiment, Varianten, Verfügbarkeit und Preise sofort erlebbar.",
    benefits: ["Mehr Aufmerksamkeit", "Bessere Beratung", "Stärkere Kaufimpulse"],
    body: [
      { h2: "Beratung, die nie Pause macht", p: "In vielen Fachgeschäften hängt eine gute Kaufentscheidung stark davon ab, ob im richtigen Moment jemand verfügbar ist, der berät. Interaktive Displays direkt am Regal oder im Schaufenster übernehmen einen Teil dieser Beratung selbstständig: Sie zeigen passende Grössen, Farbvarianten, ergänzende Produkte und aktuelle Verfügbarkeit, ohne dass Kundinnen und Kunden warten müssen." },
      { p: "Gerade bei Outdoor- und Sportartikeln entscheidet oft das Zusammenspiel mehrerer Produkte über den Kauf – der passende Rucksack zum neuen Wanderschuh, die richtige Jacke zur Hose. Digitale Flächen zeigen solche Kombinationen gezielt, blenden saisonale Aktionen ein und erhöhen so den durchschnittlichen Bestellwert, ganz ohne zusätzliches Personal." },
      { p: "Inhalte lassen sich zentral pflegen und in Sekunden für alle Standorte aktualisieren – neue Kollektionen, Rabattaktionen oder Lagerbestände erscheinen sofort dort, wo die Kaufentscheidung fällt." },
    ],
  },
  {
    slug: "gastronomie-digitale-menuboards",
    kicker: "Gastronomie",
    title: "Ankommen. Auswählen. Geniessen.",
    description: "Digitale Menüboards machen Menüs, Aktionen und Verfügbarkeiten sichtbar – zentral gesteuert und in Sekunden aktualisiert.",
    benefits: ["Weniger Drucksachen", "Kürzere Wartezeiten", "Mehr Umsatz"],
    body: [
      { h2: "Schneller entscheiden, entspannter geniessen", p: "Gäste entscheiden sich schneller, wenn das Angebot klar, appetitlich und gut lesbar präsentiert wird. Digitale Menüboards ersetzen gedruckte Karten durch Bildschirme, die Gerichte, Preise und Tagesangebote übersichtlich zeigen – inklusive Fotos, Allergenhinweisen und Mengenangaben." },
      { p: "Ändert sich das Angebot, etwa weil ein Gericht ausverkauft ist oder eine neue Aktion startet, wird das zentral in Sekunden angepasst – an einem Standort oder gleichzeitig an mehreren. Kein Neudruck, keine veralteten Preise, keine Wartezeit an der Kasse durch Rückfragen." },
      { p: "Kürzere Entscheidungszeiten an der Theke bedeuten kürzere Warteschlangen und einen spürbar ruhigeren Betriebsablauf – gerade in Stosszeiten ein klarer Vorteil für Gäste und Personal gleichermassen." },
    ],
  },
  {
    slug: "buero-videokonferenz",
    kicker: "Büro · Konferenz",
    title: "Menschen verbinden. Überall.",
    description: "Videokonferenzen, Präsentationen und Rauminformationen verbinden Teams ohne Medienbruch – im Raum und über Standorte hinweg.",
    benefits: ["Klarere Meetings", "Weniger Technikaufwand", "Mehr Nähe"],
    body: [
      { h2: "Meetings, die einfach funktionieren", p: "Nichts kostet in Besprechungen mehr Zeit als Technik, die nicht auf Anhieb funktioniert – das falsche Kabel, ein Verbindungsproblem, ein Bildschirm, der nicht mitmacht. Fest installierte Konferenz- und Präsentationslösungen im Sitzungszimmer starten mit einem Klick und binden Videokonferenzen, Bildschirmfreigaben und Raumbelegung in ein System ein." },
      { p: "Auch Teams an unterschiedlichen Standorten sehen und hören sich klar, ohne dass jemand improvisieren muss. Raumbildschirme zeigen zusätzlich Belegungsstatus und nächste Termine an, damit Meetings pünktlich beginnen und Räume effizient genutzt werden." },
      { p: "Das Ergebnis sind Besprechungen, die sich auf den Inhalt statt auf die Technik konzentrieren – und ein professionellerer Eindruck gegenüber Kundinnen, Kunden und Partnern." },
    ],
  },
  {
    slug: "retail-digital-styling",
    kicker: "Retail · Beratung",
    title: "Beratung wird zum Erlebnis.",
    description: "Interaktive Displays zeigen Produkte, Varianten und persönliche Empfehlungen in Lebensgrösse direkt im Raum.",
    benefits: ["Mehr Inspiration", "Längere Verweildauer", "Ein echtes Wow-Erlebnis"],
    body: [
      { h2: "Inspiration in Lebensgrösse", p: "Grossformatige, interaktive Displays zeigen Kleidung, Accessoires oder Einrichtungsgegenstände in echter Grösse und lassen Kundinnen und Kunden verschiedene Kombinationen, Farben und Stile direkt vor Ort durchspielen – ganz ohne jedes Teil physisch anfassen zu müssen." },
      { p: "Das schafft ein Einkaufserlebnis, das über das reine Regal hinausgeht: Wer sich Zeit für die eigene Auswahl nimmt, bleibt länger im Geschäft und entwickelt eine stärkere Bindung zum Sortiment. Persönliche Empfehlungen auf Basis der aktuellen Auswahl runden das Erlebnis ab." },
      { p: "Für das Geschäft bedeutet das mehr als nur einen technischen Effekt – es ist ein zusätzlicher Grund, warum sich ein Besuch vor Ort lohnt, gerade im Vergleich zum Online-Einkauf." },
    ],
  },
  {
    slug: "transparente-led-folien",
    kicker: "Transparente LED-Folien",
    title: "Glas wird zur Medienfläche.",
    description: "Halbtransparente LED-Folien verwandeln bestehende Scheiben direkt in grossformatige Präsentations- und Werbeflächen.",
    benefits: ["Maximale Wirkung", "Freie Sicht", "Ohne massiven Displaykorpus"],
    body: [
      { h2: "Werbefläche, ohne die Sicht zu verstellen", p: "Schaufenster sind eine der wertvollsten Werbeflächen überhaupt – werden aber oft ungenutzt gelassen, weil klassische Displays die Sicht ins Geschäft blockieren. Transparente LED-Folien lösen dieses Problem: Sie werden direkt auf bestehende Glasflächen aufgebracht und zeigen brillante, grossformatige Inhalte, während man weiterhin ins Innere sehen kann." },
      { p: "Ob Produktinszenierung, Markenbotschaft oder aktuelle Aktion – Inhalte lassen sich wie bei einem klassischen Display digital steuern und jederzeit aktualisieren, bei deutlich geringerem Platzbedarf als ein herkömmlicher Bildschirm oder eine LED-Wand." },
      { p: "Gerade bei Tageslicht und aus der Distanz entfaltet die Technologie eine Wirkung, die mit bedruckten Folien oder Postern nicht erreichbar ist – ein klarer Blickfang für Laufkundschaft." },
    ],
  },
  {
    slug: "kino-digital-signage",
    kicker: "Kino & Entertainment",
    title: "Jede Fläche wird zum Erlebnis.",
    description: "Grossformatige Screens inszenieren Trailer, Programm, Events und Markenbotschaften bereits im Foyer in beeindruckender Grösse.",
    benefits: ["Mehr Aufmerksamkeit", "Flexible Inhalte", "Ein stärkeres Kinoerlebnis"],
    body: [
      { h2: "Das Erlebnis beginnt schon im Foyer", p: "Bevor der Film überhaupt beginnt, prägt bereits das Foyer den Eindruck eines Kinobesuchs. Grossformatige digitale Screens zeigen Trailer, aktuelles Programm, Sitzplaninformationen und Sonderevents in gestochen scharfer Bildqualität – deutlich eindrücklicher als gedruckte Plakate." },
      { p: "Da sich Programme, Vorstellungszeiten und Aktionen häufig ändern, lassen sich Inhalte zentral und ohne Druckkosten in Sekunden anpassen. Zusätzliche Werbeflächen für Partner oder Sponsoren lassen sich flexibel einbinden und liefern eine neue Einnahmequelle." },
      { p: "So wird aus reiner Information ein Teil der Inszenierung – und der Kinobesuch fühlt sich schon beim Betreten des Gebäudes hochwertiger an." },
    ],
  },
  {
    slug: "museum-interaktive-infoscreens",
    kicker: "Museum · Interaktive Information",
    title: "Geschichte wird zum Erlebnis.",
    description: "Interaktive Screens vertiefen Exponate mit Bildern, Filmen, Sprachen und individuell abrufbaren Informationen.",
    benefits: ["Mehr Kontext", "Barrierefreier Zugang", "Nachhaltig aktualisierbare Inhalte"],
    body: [
      { h2: "Mehr erfahren, wenn Interesse besteht", p: "Nicht jede Besucherin und jeder Besucher möchte zu jedem Exponat denselben Umfang an Information – manche wollen mehr wissen, andere reicht ein kurzer Überblick. Interaktive Infoscreens neben Exponaten bieten genau diese Wahlmöglichkeit: von der kurzen Beschriftung bis zu vertiefenden Bildern, Filmen und Hintergrundgeschichten." },
      { p: "Mehrsprachige Inhalte lassen sich auf Knopfdruck einblenden, was Museen für internationale Gäste deutlich zugänglicher macht – ganz ohne zusätzliche gedruckte Sprachversionen oder Audioguides, die verwaltet und gewartet werden müssen." },
      { p: "Da alle Inhalte zentral gepflegt werden, lassen sich neue Erkenntnisse, Ausstellungswechsel oder saisonale Sonderausstellungen jederzeit einpflegen, ohne bestehende Beschriftungen neu drucken zu müssen." },
    ],
  },
  {
    slug: "hotel-welcome-info-sales-screens",
    kicker: "Hotel · Welcome & Guest Experience",
    title: "Willkommen wird zum Erlebnis.",
    description: "Welcome-Screens, Gästeinformationen und digitale Verkaufsflächen begleiten den Aufenthalt vom Check-in bis zum Spa.",
    benefits: ["Bessere Orientierung", "Persönlicher Service", "Mehr Zusatzbuchungen"],
    body: [
      { h2: "Ein durchgängiges Gästeerlebnis", p: "Der erste Eindruck beim Check-in prägt den gesamten Aufenthalt. Digitale Welcome-Screens an der Lobby begrüssen Gäste, zeigen aktuelle Veranstaltungen im Haus und geben Orientierung – von der Lage des Spas bis zu den Öffnungszeiten des Restaurants." },
      { p: "Auf den Zimmerfluren und im Wellnessbereich übernehmen weitere Screens die Aufgabe, zusätzliche Angebote wie Massagen, Ausflüge oder das Frühstück am nächsten Tag sichtbar zu machen – und lassen sich in vielen Fällen direkt zur Buchung nutzen, ganz ohne Umweg über die Rezeption." },
      { p: "Für das Hotel bedeutet das weniger Rückfragen an der Rezeption, eine konsistente Markenwirkung im ganzen Haus und zusätzliche Einnahmen durch Zusatzbuchungen, die sonst ungenutzt geblieben wären." },
    ],
  },
  {
    slug: "beauty-salon-info-werbescreens",
    kicker: "Beauty · Beratung & Inspiration",
    title: "Schönheit wird sichtbar.",
    description: "Info- und Werbescreens präsentieren Behandlungen, Produkte, Pflegetipps und aktuelle Angebote direkt im Salon.",
    benefits: ["Mehr Aufmerksamkeit", "Bessere Beratung", "Mehr Zusatzverkäufe"],
    body: [
      { h2: "Wartezeit wird zur Inspiration", p: "Die Zeit im Wartebereich oder am Behandlungsplatz lässt sich nutzen, statt sie ungenutzt verstreichen zu lassen. Digitale Screens zeigen Behandlungsangebote, Vorher-Nachher-Beispiele, Pflegetipps und aktuelle Produkte – genau in dem Moment, in dem sich Kundinnen und Kunden ohnehin schon mit dem Thema beschäftigen." },
      { p: "Neue Behandlungen, saisonale Aktionen oder Produktneuheiten lassen sich jederzeit zentral einspielen, ohne Plakate neu drucken oder austauschen zu müssen. Das hält den Auftritt des Salons immer aktuell und professionell." },
      { p: "Gut platzierte Inhalte wirken dabei wie eine zusätzliche, stille Beratung – sie wecken Interesse an Zusatzleistungen und Pflegeprodukten, die im Gespräch sonst vielleicht nicht zur Sprache gekommen wären." },
    ],
  },
  {
    slug: "skipisten-info-werbescreens",
    kicker: "Bergbahnen · Pisteninformation",
    title: "Orientierung auf einen Blick.",
    description: "Robuste Outdoor-Screens zeigen Pistenstatus, Wetter, Liftbetrieb, Orientierung und Angebote genau dort, wo Entscheidungen fallen.",
    benefits: ["Mehr Sicherheit", "Bessere Besucherlenkung", "Relevante Werbung vor Ort"],
    body: [
      { h2: "Wichtige Informationen, witterungsfest im Aussenbereich", p: "An der Talstation, bei der Bergstation oder an Kreuzungspunkten im Skigebiet müssen Informationen zu Pistenstatus, Wetterlage und Liftbetrieb zuverlässig und gut lesbar verfügbar sein – auch bei Kälte, Sonneneinstrahlung oder Schneefall. Robuste Outdoor-Screens sind genau für diese Bedingungen gebaut." },
      { p: "Aktuelle Pistenzustände, Warnstufen, Wetterprognosen und Liftbetriebszeiten lassen sich zentral pflegen und erscheinen in Echtzeit an allen relevanten Standorten – wichtige Sicherheitsinformationen erreichen Gäste damit genau dort, wo Entscheidungen getroffen werden." },
      { p: "Die gleichen Flächen lassen sich zusätzlich für Orientierung, Restaurant-Hinweise oder Angebote lokaler Partner nutzen – eine sinnvolle Ergänzung zur reinen Sicherheitsinformation, ohne zusätzliche Infrastruktur." },
    ],
  },
];

function escapeHtml(value) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function renderPage(page) {
  const url = `https://swisscompact.com/einsatzbereiche/${page.slug}/`;
  const metaDescription = escapeHtml(page.description);
  const bodyHtml = page.body
    .map((block) => `${block.h2 ? `<h2>${escapeHtml(block.h2)}</h2>` : ""}<p>${escapeHtml(block.p)}</p>`)
    .join("\n            ");
  const benefitsHtml = page.benefits.map((benefit) => `<li>${escapeHtml(benefit)}</li>`).join("\n            ");

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
    <link rel="stylesheet" href="/einsatzbereiche.css" />
    <title>${escapeHtml(page.title)} – SwissCompact</title>
  </head>
  <body>
    <header class="eb-header">
      <a class="eb-logo" href="/">Swiss<span>Compact</span></a>
      <a class="eb-header__cta" href="/#projekt-starten">Projekt starten</a>
    </header>

    <main>
      <section class="eb-hero">
        <p class="eb-eyebrow">${escapeHtml(page.kicker)}</p>
        <h1>${escapeHtml(page.title)}</h1>
        <p>${escapeHtml(page.description)}</p>
      </section>

      <ul class="eb-benefits">
            ${benefitsHtml}
      </ul>

      <section class="eb-body">
            ${bodyHtml}
      </section>

      <section class="eb-cta">
        <h2>Bereit für den nächsten Schritt?</h2>
        <p>Sprich mit uns über dein Projekt oder entdecke den interaktiven Virtual Showroom.</p>
        <div class="eb-cta__actions">
          <a class="primary" href="/#branchen">Virtual Showroom entdecken</a>
          <a class="secondary" href="/?open-consultation=1#projekt-starten">Projekt besprechen</a>
        </div>
      </section>
    </main>

    <footer class="eb-footer">
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

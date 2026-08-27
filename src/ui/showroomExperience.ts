type BasePreset =
  | "restaurant"
  | "cafe"
  | "beautySalon"
  | "barber"
  | "physio"
  | "cinema"
  | "museum"
  | "eventHall"
  | "outdoorShop"
  | "mountainStation"
  | "fitnessCenter"
  | "fashionStore"
  | "electronicsStore"
  | "shoppingMall"
  | "corporateLobby"
  | "corporateMeeting"
  | "corporateCanteen"
  | "hotelLobby"
  | "spaWellness"
  | "guestSuite"
  | "stationTerminal"
  | "trafficControl"
  | "mobilityHub"
  | "clinicReception"
  | "waitingTreatment"
  | "careCenter"
  | "campusFoyer"
  | "classroom"
  | "libraryZone"
  | "productionHall"
  | "logisticsCenter"
  | "industrialControl"
  | "realEstateLounge"
  | "modelApartment"
  | "brandShowroom";

type Scenario = {
  label: string;
  content: "menu" | "campaign" | "pickup";
};

type Room = {
  id: string;
  label: string;
  story: string;
  goal: string;
  basePreset: BasePreset;
  scenarios: Scenario[];
};

type Category = {
  id: string;
  number: string;
  label: string;
  shortLabel: string;
  promise: string;
  rooms: Room[];
};

type Hotspot = {
  id: string;
  number: string;
  label: string;
  problem: string;
  solution: string;
  benefit: string;
  use: string;
  content: string[];
  integrations: string[];
  x: number;
  y: number;
};

type SavedSolution = {
  key: string;
  categoryId: string;
  category: string;
  roomId: string;
  room: string;
  hotspotId: string;
  solution: string;
  benefit: string;
  scenario: string;
};

export interface ShowroomExperience {
  destroy(): void;
}

const categories: Category[] = [
  {
    id: "gastronomy",
    number: "01",
    label: "Gastronomie",
    shortLabel: "Gastronomie",
    promise: "Angebote, Abläufe und Atmosphäre im richtigen Moment verbinden.",
    rooms: [
      room("restaurant", "Restaurant", "Vom Empfang bis zum Dessert entsteht eine ruhige, digitale Gästereise.", "Gäste informieren und den Umsatz pro Besuch steigern.", "restaurant", ["Frühstück", "Mittag", "Abend", "Aktion"]),
      room("takeaway", "Take-away & Quick Service", "Bestellen, bezahlen und abholen – ohne unnötige Wartezeit.", "Bestellfluss beschleunigen und Teams entlasten.", "cafe", ["Frühstück", "Lunch Rush", "Abholung", "Tagesaktion"]),
      room("cafe", "Café & Bäckerei", "Tagesfrische Angebote treffen auf eine warme, lokale Markenwelt.", "Spontankäufe fördern und Sortimente flexibel steuern.", "cafe", ["Morgen", "Mittag", "Kaffeezeit", "Saisonal"]),
    ],
  },
  {
    id: "beauty",
    number: "02",
    label: "Beauty & Personal Care",
    shortLabel: "Beauty",
    promise: "Service, Inspiration und Vertrauen sichtbar machen.",
    rooms: [
      room("salon", "Beauty Salon & Kosmetik", "Inspiration beginnt beim Empfang und begleitet jeden Behandlungsschritt.", "Services emotional inszenieren und Zusatzbuchungen fördern.", "beautySalon", ["Welcome", "Behandlung", "Produkte", "Kampagne"]),
      room("barber", "Coiffeur & Barber Shop", "Looks, Handwerk und Persönlichkeit werden zu einem starken Markenraum.", "Beratung vereinfachen und Looks erlebbar machen.", "barber", ["Morgen", "Walk-in", "Lookbook", "Abend"]),
      room("physio", "Physiotherapie & Massage", "Ruhige Information schafft Sicherheit vor und nach der Behandlung.", "Patienten führen und Fachpersonal kommunikativ entlasten.", "physio", ["Ankunft", "Therapie", "Übungen", "Hinweise"]),
    ],
  },
  {
    id: "culture",
    number: "03",
    label: "Kultur & Events",
    shortLabel: "Kultur",
    promise: "Programm, Orientierung und grosse Momente synchron erzählen.",
    rooms: [
      room("cinema", "Kino & Foyer", "Der Film beginnt bereits im Foyer – vom Trailer bis zum Saaleinlass.", "Besucher lenken und Programmwelten emotional aufladen.", "cinema", ["Premiere", "Nachmittag", "Abend", "Ausverkauft"]),
      room("museum", "Museum & Ausstellung", "Digitale Ebenen vertiefen Inhalte, ohne Exponate zu überlagern.", "Wissen zugänglich machen und Besucherflüsse verbessern.", "museum", ["Dauerausstellung", "Sonderausstellung", "Führung", "Event"]),
      room("event", "Konferenz- & Eventhalle", "Agenda, Bühne und Wegleitung reagieren gemeinsam auf den Eventverlauf.", "Abläufe synchronisieren und Marken professionell inszenieren.", "eventHall", ["Einlass", "Keynote", "Pause", "Abendprogramm"]),
    ],
  },
  {
    id: "sport",
    number: "04",
    label: "Sport & Freizeit",
    shortLabel: "Sport",
    promise: "Motivation, Sicherheit und Live-Information zusammenbringen.",
    rooms: [
      room("outdoor", "Sportgeschäft & Outdoor Shop", "Beratung, Touren und Produkte treffen in einer inspirierenden Bergwelt zusammen.", "Kompetenz zeigen und Kaufentscheidungen erleichtern.", "outdoorShop", ["Sommer", "Winter", "Tourentipp", "Wetterwechsel"]),
      room("mountain", "Skigebiet & Bergbahn", "Wetter, Pisten und Sicherheit werden in Sekunden erfassbar.", "Gäste sicher lenken und Betriebsmeldungen zentral ausspielen.", "mountainStation", ["Normalbetrieb", "Wetterwarnung", "Pistensperrung", "Letzte Bergfahrt"]),
      room("fitness", "Premium Fitnesscenter", "Kurse, Challenges und Trainingstipps begleiten die gesamte Member Journey.", "Mitglieder aktivieren und Betreuung skalierbar machen.", "fitnessCenter", ["Morgen", "Kursbetrieb", "Challenge", "Abend"]),
    ],
  },
  {
    id: "retail",
    number: "05",
    label: "Retail & Shopping",
    shortLabel: "Retail",
    promise: "Vom ersten Blick bis zur Kaufentscheidung relevant bleiben.",
    rooms: [
      room("fashion", "Modegeschäft", "Kollektion, Inspiration und Service bilden eine nahtlose Customer Journey.", "Marke stärken und Warenkörbe vergrössern.", "fashionStore", ["New Collection", "Beratung", "Sale", "Event"]),
      room("electronics", "Elektronikfachmarkt", "Vergleiche und Produktwelten werden dort sichtbar, wo Fragen entstehen.", "Komplexe Produkte verständlich machen und Beratung unterstützen.", "electronicsStore", ["Launch", "Vergleich", "Service", "Aktion"]),
      room("mall", "Einkaufszentrum", "Wegeleitung, Aktionen und Center-News begleiten jeden Besuch.", "Besucherströme lenken und Flächen zentral vermarkten.", "shoppingMall", ["Öffnung", "Peak Time", "Event", "Feierabend"]),
    ],
  },
  {
    id: "corporate",
    number: "06",
    label: "Corporate & Gebäude",
    shortLabel: "Corporate",
    promise: "Menschen willkommen heissen, verbinden und sicher informieren.",
    rooms: [
      room("lobby", "Empfang & Lobby", "Ein digitaler Empfang verbindet Marke, Gäste und Gebäudeinformation.", "Den ersten Eindruck stärken und Empfangsteams entlasten.", "corporateLobby", ["Morgen", "Besucher", "Townhall", "Notfall"]),
      room("meeting", "Meeting & Collaboration", "Räume, Agenda und hybride Inhalte funktionieren als ein System.", "Zusammenarbeit vereinfachen und Räume besser auslasten.", "corporateMeeting", ["Teammeeting", "Kundenbesuch", "Hybrid", "Workshop"]),
      room("canteen", "Mitarbeitendenrestaurant", "Menü, Auslastung und interne Kommunikation erreichen alle im Alltag.", "Wartezeiten reduzieren und Mitarbeitende informieren.", "corporateCanteen", ["Frühstück", "Mittag", "Nachmittag", "Intern"]),
    ],
  },
  {
    id: "hospitality",
    number: "07",
    label: "Hospitality & Wellness",
    shortLabel: "Hospitality",
    promise: "Aufmerksamkeit in echte Gastfreundschaft übersetzen.",
    rooms: [
      room("hotel", "Hotellobby", "Ankommen, orientieren und entdecken – persönlich trotz digitaler Unterstützung.", "Service sichtbar machen und die Rezeption entlasten.", "hotelLobby", ["Check-in", "Tagesprogramm", "Abend", "Event"]),
      room("spa", "Spa & Wellness", "Ruhige Inhalte führen durch Anwendungen, Rituale und Erholungsbereiche.", "Angebote hochwertig vermitteln und Ruhe bewahren.", "spaWellness", ["Morgen", "Behandlung", "Ruhezeit", "Special"]),
      room("guest", "Gästezimmer & Suite", "Persönliche Begrüssung und Services stehen genau dann bereit, wenn sie gebraucht werden.", "Aufenthalte personalisieren und Zusatzservices fördern.", "guestSuite", ["Welcome", "In-room", "Abend", "Check-out"]),
    ],
  },
  {
    id: "mobility",
    number: "08",
    label: "Mobilität & Infrastruktur",
    shortLabel: "Mobilität",
    promise: "Komplexe Wege und aktuelle Betriebsdaten sofort verständlich machen.",
    rooms: [
      room("station", "Bahnhof & Terminal", "Abfahrt, Umstieg und Service bleiben auch bei Änderungen klar.", "Reisende sicher führen und Stress reduzieren.", "stationTerminal", ["Normalbetrieb", "Verspätung", "Gleiswechsel", "Evakuation"]),
      room("control", "Verkehrsleitzentrale", "Live-Daten und Prioritäten verdichten sich zu einem klaren Lagebild.", "Entscheidungen beschleunigen und Teams synchronisieren.", "trafficControl", ["Normal", "Störung", "Grossereignis", "Nacht"]),
      room("parking", "Parkhaus & Mobilitätshub", "Freie Plätze, Ladepunkte und Ausgänge werden intuitiv auffindbar.", "Verkehr lenken und neue Mobilitätsservices integrieren.", "mobilityHub", ["Einfahrt", "Peak Time", "Laden", "Ausfahrt"]),
    ],
  },
  {
    id: "health",
    number: "09",
    label: "Gesundheit & Pflege",
    shortLabel: "Gesundheit",
    promise: "Orientierung und Vertrauen in sensiblen Situationen schaffen.",
    rooms: [
      room("clinic", "Klinikempfang", "Klare Wege und ruhige Information geben Sicherheit ab dem ersten Moment.", "Patientenströme ordnen und Personal entlasten.", "clinicReception", ["Anmeldung", "Sprechstunde", "Besuchszeit", "Notfall"]),
      room("waiting", "Warte- & Behandlungsbereich", "Diskrete Aufrufe und Gesundheitsinhalte verkürzen gefühlte Wartezeit.", "Abläufe transparent und datenschutzgerecht gestalten.", "waitingTreatment", ["Check-in", "Warten", "Aufruf", "Nachsorge"]),
      room("care", "Pflegezentrum", "Tagesstruktur, Aktivierung und Angehörigeninformation werden leicht zugänglich.", "Orientierung fördern und Betreuungsteams unterstützen.", "careCenter", ["Morgen", "Aktivierung", "Besuchszeit", "Abend"]),
    ],
  },
  {
    id: "education",
    number: "10",
    label: "Bildung & Wissen",
    shortLabel: "Bildung",
    promise: "Wissen sichtbar, Wege klar und Lernorte lebendig machen.",
    rooms: [
      room("campus", "Campus & Foyer", "Stundenplan, Veranstaltungen und Orientierung bilden einen verlässlichen Einstieg.", "Information zentral pflegen und Community stärken.", "campusFoyer", ["Tagesstart", "Vorlesung", "Event", "Prüfung"]),
      room("classroom", "Unterrichtsraum", "Lerninhalte, Kollaboration und Raumtechnik greifen nahtlos ineinander.", "Lehre flexibler und Inhalte zugänglicher machen.", "classroom", ["Unterricht", "Gruppenarbeit", "Hybrid", "Präsentation"]),
      room("library", "Bibliothek & Lernzone", "Bestände, freie Plätze und Wissenstipps begleiten konzentriertes Arbeiten.", "Ressourcen auffindbar machen und Flächen besser nutzen.", "libraryZone", ["Öffnung", "Lernzeit", "Recherche", "Schliessung"]),
    ],
  },
  {
    id: "industry",
    number: "11",
    label: "Industrie & Logistik",
    shortLabel: "Industrie",
    promise: "Sicherheit, Kennzahlen und Abläufe direkt an den Arbeitsplatz bringen.",
    rooms: [
      room("production", "Produktionshalle", "Auftrag, Qualität und Sicherheit sind an jeder Linie aktuell sichtbar.", "Stillstände reduzieren und Standards verankern.", "productionHall", ["Schichtstart", "Produktion", "Störung", "Wartung"]),
      room("logistics", "Logistikzentrum", "Tore, Aufträge und Prioritäten steuern Menschen und Waren effizient.", "Durchsatz erhöhen und Fehlwege vermeiden.", "logisticsCenter", ["Wareneingang", "Kommissionierung", "Peak", "Versand"]),
      room("command", "Leitstand", "KPIs, Meldungen und Kamerabilder werden zu einem gemeinsamen Lagebild.", "Reaktionszeiten verkürzen und Entscheidungen absichern.", "industrialControl", ["Normalbetrieb", "Abweichung", "Alarm", "Schichtübergabe"]),
    ],
  },
  {
    id: "realestate",
    number: "12",
    label: "Immobilien & Showrooms",
    shortLabel: "Immobilien",
    promise: "Noch nicht gebaute Räume verständlich und emotional erlebbar machen.",
    rooms: [
      room("sales", "Immobilien-Lounge", "Lage, Architektur und Verfügbarkeit werden als zusammenhängende Geschichte erlebbar.", "Entscheidungen beschleunigen und Projekte differenzieren.", "realEstateLounge", ["Projektstart", "Beratung", "Wohnungssuche", "Verkauf"]),
      room("apartment", "Musterwohnung", "Varianten, Materialien und Ausblicke lassen sich direkt im Raum vergleichen.", "Käufern Sicherheit geben und Optionen verständlich zeigen.", "modelApartment", ["Tag", "Abend", "Materialwahl", "Konfiguration"]),
      room("showroom", "Marken- & Messe-Showroom", "Produkte, Daten und Storytelling verschmelzen zu einem starken Auftritt.", "Komplexe Angebote erlebbar machen und Leads qualifizieren.", "brandShowroom", ["Welcome", "Produktdemo", "Präsentation", "Lead"]),
    ],
  },
];

function room(
  id: string,
  label: string,
  story: string,
  goal: string,
  basePreset: BasePreset,
  scenarioLabels: string[],
): Room {
  const contentTypes: Scenario["content"][] = ["menu", "campaign", "pickup", "campaign"];
  return {
    id,
    label,
    story,
    goal,
    basePreset,
    scenarios: scenarioLabels.map((scenario, index) => ({
      label: scenario,
      content: contentTypes[index] ?? "campaign",
    })),
  };
}

function buildHotspots(category: Category, activeRoom: Room): Hotspot[] {
  const positions = [
    { x: 28, y: 43 },
    { x: 57, y: 32 },
    { x: 74, y: 57 },
    { x: 40, y: 68 },
  ];
  return [
    {
      id: "orientation",
      number: "01",
      label: "Orientierung & Welcome",
      problem: `Besucher im ${activeRoom.label} müssen relevante Informationen oft selbst suchen.`,
      solution: "Ein kontextbezogener Welcome- und Orientierungs-Screen priorisiert Wege, Angebote und nächste Schritte.",
      benefit: "Weniger Rückfragen, schnellere Orientierung und ein professioneller erster Eindruck.",
      use: `${category.label} · Empfang und erste Kontaktzone`,
      content: ["Begrüssung", "Wegleitung", "Live-Hinweise"],
      integrations: ["Kalender", "Buchungssystem", "Gebäudedaten"],
      ...positions[0],
    },
    {
      id: "experience",
      number: "02",
      label: "Erlebnis & Aktivierung",
      problem: "Statische Kommunikation reagiert nicht auf Tageszeit, Situation oder Zielgruppe.",
      solution: "Vernetzte Displays wechseln Inhalte synchron und erzählen eine konsistente, raumbezogene Geschichte.",
      benefit: activeRoom.goal,
      use: `${category.label} · Hauptaufenthalts- und Aktionsfläche`,
      content: ["Kampagnen", "Storytelling", "Interaktive Inhalte"],
      integrations: ["CMS", "Mediathek", "Kampagnenplanung"],
      ...positions[1],
    },
    {
      id: "operations",
      number: "03",
      label: "Betrieb & Service",
      problem: "Aktuelle Meldungen und operative Änderungen erreichen Menschen häufig zu spät oder uneinheitlich.",
      solution: "Zentral gesteuerte Service-Screens verbinden Echtzeitdaten, Statusmeldungen und klare Handlungsimpulse.",
      benefit: "Abläufe werden transparenter, Teams entlastet und Informationen bleiben überall aktuell.",
      use: `${category.label} · Service-, Ausgangs- und Betriebszone`,
      content: ["Status", "Service", "Sicherheitsmeldungen"],
      integrations: ["API & Live-Daten", "Monitoring", "Alarmsysteme"],
      ...positions[2],
    },
    {
      id: "ecosystem",
      number: "04",
      label: "Partnernetzwerk & Kooperation",
      problem: `Freie Displayzeit im ${activeRoom.label} bleibt ungenutzt, während passende lokale Betriebe dieselbe Zielgruppe erreichen möchten.`,
      solution: "Das freiwillige SwissCompact Netzwerk verbindet passende Kundenstandorte. Eigene Inhalte behalten Vorrang; Partnerkampagnen werden beidseitig freigegeben und zeitlich gesteuert.",
      benefit: "Mehr Reichweite, neue Kundschaft und zusätzlicher Nutzen aus jedem Display – ohne Kontrollverlust.",
      use: `${category.label} · passende lokale Partner und ergänzende Angebote`,
      content: ["Partnerangebote", "Lokale Empfehlungen", "Gemeinsame Aktionen"],
      integrations: ["SwissCompact Network", "Freigabe-Workflow", "Kampagnenreporting"],
      ...positions[3],
    },
  ];
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[character] ?? character);
}

function readSavedSolutions(): SavedSolution[] {
  try {
    const parsed = JSON.parse(localStorage.getItem("swisscompact-solutions") ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function mountShowroomExperience(): ShowroomExperience {
  const stage = document.querySelector<HTMLElement>("[data-showroom-stage]");
  if (!stage) return { destroy() {} };

  const root = document.createElement("div");
  root.className = "solution-journey";
  root.dataset.solutionJourney = "";
  root.innerHTML = `
    <button class="solution-journey__launcher" type="button" data-journey-open>
      <span aria-hidden="true">✦</span>
      <span><small>Geführter Virtual Showroom</small><strong>Lösungsreise starten</strong></span>
      <i aria-hidden="true">→</i>
    </button>
    <button class="solution-journey__saved-cta" type="button" data-journey-saved-cta data-journey-consult hidden>
      <span aria-hidden="true">✓</span>
      <span>
        <small>Konfiguration gespeichert</small>
        <strong><span data-journey-saved-room>Ihr Raum</span> jetzt besprechen</strong>
      </span>
      <i aria-hidden="true">→ Beratung</i>
    </button>
    <section class="solution-journey__shell" data-journey-shell hidden aria-label="SwissCompact Lösungsreise">
      <header class="solution-journey__header">
        <button class="solution-journey__brand" type="button" data-journey-categories>
          <span>Swiss</span><strong>Compact</strong><small>Showroom</small>
        </button>
        <div class="solution-journey__context" aria-live="polite">
          <button type="button" data-journey-categories><small>Branche</small><strong data-journey-category>Auswählen</strong></button>
          <span aria-hidden="true">/</span>
          <button type="button" data-journey-rooms><small>Raum</small><strong data-journey-room>Auswählen</strong></button>
          <span aria-hidden="true">/</span>
          <label>
            <small>Grösse</small>
            <select data-journey-size aria-label="Raumgrösse">
              <option value="xs">XS</option>
              <option value="small" selected>S</option>
              <option value="compact">M</option>
              <option value="standard">L</option>
            </select>
          </label>
        </div>
        <div class="solution-journey__actions">
          <button type="button" data-journey-configure title="Raum vollständig konfigurieren">
            <span aria-hidden="true">⚙</span>
            <span data-journey-configure-label>Konfigurieren</span>
          </button>
          <button type="button" data-journey-tour title="Geführte Tour starten">
            <span aria-hidden="true">▶</span> Tour
          </button>
          <button type="button" data-journey-summary>
            <span aria-hidden="true">☆</span> Merkliste <strong data-journey-saved-count>0</strong>
          </button>
          <button class="solution-journey__consult-cta" type="button" data-journey-consult>
            Beratung <span aria-hidden="true">↗</span>
          </button>
          <button type="button" data-journey-close aria-label="Lösungsreise schliessen">×</button>
        </div>
      </header>
      <div class="solution-journey__room-copy" data-journey-room-copy hidden>
        <small data-journey-category-kicker></small>
        <h3 data-journey-room-title></h3>
        <p data-journey-room-story></p>
      </div>
      <div class="solution-journey__hotspots" data-journey-hotspots></div>
      <div class="solution-journey__focus-beam" data-journey-focus-beam hidden aria-hidden="true"></div>
      <nav class="solution-journey__scenarios" data-journey-scenarios aria-label="Display-Szenario" hidden></nav>
      <button
        class="solution-journey__room-config"
        type="button"
        data-journey-configure
        data-journey-room-config
        hidden
      >
        <span aria-hidden="true">⚙</span>
        <span><small>Direkt im Raum</small><strong>Raum konfigurieren</strong></span>
      </button>
      <button
        class="solution-journey__config-next"
        type="button"
        data-journey-consult
        hidden
      >
        <span><small>Nächster Schritt</small><strong>Konfiguration abschliessen</strong></span>
        <i aria-hidden="true">→ Beratung</i>
      </button>
      <aside class="solution-journey__panel" data-journey-panel hidden aria-live="polite"></aside>
      <aside class="solution-journey__summary" data-journey-summary-panel hidden></aside>
      <aside
        class="solution-journey__consult"
        data-journey-consult-panel
        role="dialog"
        aria-modal="true"
        aria-labelledby="journey-consult-title"
        hidden
      ></aside>
      <div class="solution-journey__tour-status" data-journey-tour-status hidden></div>
      <div class="solution-journey__toast" data-journey-toast aria-live="polite" hidden></div>
      <section class="solution-journey__picker" data-journey-picker role="dialog" aria-modal="true" aria-labelledby="journey-picker-title">
        <header>
          <div><small>SwissCompact Virtual Showroom</small><h3 id="journey-picker-title">Welche Welt möchten Sie betreten?</h3></div>
          <button type="button" data-journey-picker-close aria-label="Auswahl schliessen">×</button>
        </header>
        <p>Wählen Sie Ihre Branche und betreten Sie einen von drei konkreten Anwendungsräumen.</p>
        <ol data-journey-category-list></ol>
      </section>
    </section>
  `;
  stage.append(root);

  const shell = root.querySelector<HTMLElement>("[data-journey-shell]")!;
  const picker = root.querySelector<HTMLElement>("[data-journey-picker]")!;
  const list = root.querySelector<HTMLOListElement>("[data-journey-category-list]")!;
  const hotspotRoot = root.querySelector<HTMLElement>("[data-journey-hotspots]")!;
  const focusBeam = root.querySelector<HTMLElement>("[data-journey-focus-beam]")!;
  const panel = root.querySelector<HTMLElement>("[data-journey-panel]")!;
  const summaryPanel = root.querySelector<HTMLElement>("[data-journey-summary-panel]")!;
  const consultPanel = root.querySelector<HTMLElement>(
    "[data-journey-consult-panel]",
  )!;
  const scenarioRoot = root.querySelector<HTMLElement>("[data-journey-scenarios]")!;
  const roomConfigButton = root.querySelector<HTMLButtonElement>(
    "[data-journey-room-config]",
  )!;
  const configNextButton = root.querySelector<HTMLButtonElement>(
    ".solution-journey__config-next",
  )!;
  const toast = root.querySelector<HTMLElement>("[data-journey-toast]")!;
  const savedRoomCta = root.querySelector<HTMLButtonElement>(
    "[data-journey-saved-cta]",
  )!;
  const savedRoomCtaLabel = root.querySelector<HTMLElement>(
    "[data-journey-saved-room]",
  )!;
  const roomCopy = root.querySelector<HTMLElement>("[data-journey-room-copy]")!;
  const tourStatus = root.querySelector<HTMLElement>("[data-journey-tour-status]")!;
  const categoryOutput = root.querySelector<HTMLElement>("[data-journey-category]")!;
  const roomOutput = root.querySelector<HTMLElement>("[data-journey-room]")!;
  const categoryKicker = root.querySelector<HTMLElement>("[data-journey-category-kicker]")!;
  const roomTitle = root.querySelector<HTMLElement>("[data-journey-room-title]")!;
  const roomStory = root.querySelector<HTMLElement>("[data-journey-room-story]")!;
  const countOutputs = root.querySelectorAll<HTMLElement>("[data-journey-saved-count]");
  const sizeSelect = root.querySelector<HTMLSelectElement>("[data-journey-size]")!;
  const configureLabel = root.querySelector<HTMLElement>(
    "[data-journey-configure-label]",
  )!;
  const showroomRoot = document.querySelector<HTMLElement>("[data-showroom]");
  let activeCategory: Category | null = null;
  let activeRoom: Room | null = null;
  let activeScenario = 0;
  let activeHotspot: Hotspot | null = null;
  let saved = readSavedSolutions();
  let tourIndex = -1;
  let pickerMode: "categories" | "rooms" = "categories";
  let toastTimer = 0;

  const trackFunnel = (
    action: string,
    stageName: "discover" | "tour" | "configure" | "summary" | "consult",
  ) => {
    root.dataset.funnelStage = stageName;
    window.dispatchEvent(new CustomEvent("swisscompact:funnel", {
      detail: {
        action,
        stage: stageName,
        category: activeCategory?.label ?? null,
        room: activeRoom?.label ?? null,
        savedSolutions: saved.length,
      },
    }));
  };

  const showToast = (message: string) => {
    window.clearTimeout(toastTimer);
    toast.textContent = message;
    toast.hidden = false;
    toastTimer = window.setTimeout(() => {
      toast.hidden = true;
    }, 3200);
  };

  const updateJourneySize = () => {
    const size = showroomRoot?.dataset.showroomRoomSize;
    if (size && sizeSelect.querySelector(`option[value="${size}"]`)) {
      sizeSelect.value = size;
    }
  };

  const setConfigurationMode = (enabled: boolean) => {
    root.classList.toggle("is-configuring", enabled);
    root.classList.remove("is-consulting");
    stage.classList.toggle("is-journey-configuring", enabled);
    stage.classList.toggle("is-solution-journey", !enabled && !shell.hidden);
    configureLabel.textContent = enabled ? "Touransicht" : "Konfigurieren";
    panel.hidden = true;
    summaryPanel.hidden = true;
    picker.hidden = true;
    consultPanel.hidden = true;
    focusBeam.hidden = true;
    tourStatus.hidden = true;
    tourIndex = -1;
    configNextButton.hidden = !enabled;
    updateJourneySize();
    trackFunnel(
      enabled ? "configuration_opened" : "tour_view_opened",
      enabled ? "configure" : "discover",
    );
  };

  const persistSaved = () => {
    localStorage.setItem("swisscompact-solutions", JSON.stringify(saved));
    countOutputs.forEach((output) => {
      output.textContent = String(saved.length);
    });
  };

  const syncUnderlyingRoom = (selectedRoom: Room) => {
    const presetButton = document.querySelector<HTMLButtonElement>(
      `[data-showroom-setting="preset"][data-value="${selectedRoom.basePreset}"]`,
    );
    presetButton?.click();
  };

  const syncScenario = (scenario: Scenario) => {
    const contentButton = document.querySelector<HTMLButtonElement>(
      `[data-showroom-setting="content"][data-value="${scenario.content}"]`,
    );
    contentButton?.click();
  };

  const renderPicker = () => {
    const title = picker.querySelector<HTMLElement>("h3")!;
    const intro = picker.querySelector<HTMLElement>("p")!;
    if (pickerMode === "rooms" && activeCategory) {
      title.textContent = `Welchen Raum in ${activeCategory.label} möchten Sie betreten?`;
      intro.textContent = activeCategory.promise;
      list.innerHTML = activeCategory.rooms.map((selectedRoom, index) => `
        <li class="solution-journey__room-option">
          <button type="button" data-journey-room-id="${selectedRoom.id}">
            <span>${String(index + 1).padStart(2, "0")}</span>
            <strong>${escapeHtml(selectedRoom.label)}</strong>
            <p>${escapeHtml(selectedRoom.story)}</p>
            <small>Raum betreten <i aria-hidden="true">→</i></small>
          </button>
        </li>
      `).join("");
      return;
    }
    title.textContent = "Welche Welt möchten Sie betreten?";
    intro.textContent = "Wählen Sie Ihre Branche und betreten Sie einen von drei konkreten Anwendungsräumen.";
    list.innerHTML = categories.map((category) => `
      <li>
        <button type="button" data-journey-category-id="${category.id}">
          <span>${category.number}</span>
          <strong>${escapeHtml(category.label)}</strong>
          <p>${escapeHtml(category.promise)}</p>
          <small>3 Räume <i aria-hidden="true">→</i></small>
        </button>
      </li>
    `).join("");
  };

  const openPicker = (mode: "categories" | "rooms" = "categories") => {
    if (root.classList.contains("is-configuring")) {
      setConfigurationMode(false);
    }
    root.classList.remove("is-consulting");
    consultPanel.hidden = true;
    pickerMode = mode;
    renderPicker();
    picker.hidden = false;
    panel.hidden = true;
    summaryPanel.hidden = true;
    focusBeam.hidden = true;
    window.setTimeout(() => {
      picker.querySelector<HTMLButtonElement>("button:not([data-journey-picker-close])")?.focus();
    }, 0);
  };

  const renderScenarios = () => {
    if (!activeRoom) return;
    scenarioRoot.hidden = false;
    scenarioRoot.innerHTML = `
      <span>Szenario</span>
      ${activeRoom.scenarios.map((scenario, index) => `
        <button type="button" data-journey-scenario="${index}" class="${index === activeScenario ? "is-active" : ""}" aria-pressed="${index === activeScenario}">
          ${escapeHtml(scenario.label)}
        </button>
      `).join("")}
    `;
  };

  const renderHotspots = () => {
    if (!activeCategory || !activeRoom) return;
    const hotspots = buildHotspots(activeCategory, activeRoom);
    hotspotRoot.innerHTML = hotspots.map((hotspot) => `
      <button
        type="button"
        class="solution-hotspot ${activeHotspot?.id === hotspot.id ? "is-active" : ""}"
        style="--hotspot-x:${
          activeHotspot && window.innerWidth > 700
            ? Math.min(hotspot.x, 63)
            : hotspot.x
        }%;--hotspot-y:${hotspot.y}%"
        data-journey-hotspot="${hotspot.id}"
        aria-label="${hotspot.number}: ${escapeHtml(hotspot.label)}"
        aria-pressed="${activeHotspot?.id === hotspot.id}"
      ><span>${hotspot.number}</span><strong>${escapeHtml(hotspot.label)}</strong></button>
    `).join("");
  };

  const isSaved = (hotspot: Hotspot) => {
    if (!activeCategory || !activeRoom) return false;
    return saved.some((item) => item.key === `${activeCategory!.id}:${activeRoom!.id}:${hotspot.id}`);
  };

  const openHotspot = (hotspot: Hotspot) => {
    if (!activeCategory || !activeRoom) return;
    root.classList.remove("is-consulting");
    consultPanel.hidden = true;
    activeHotspot = hotspot;
    renderHotspots();
    panel.hidden = false;
    summaryPanel.hidden = true;
    const hotspots = buildHotspots(activeCategory, activeRoom);
    const activeIndex = hotspots.findIndex((item) => item.id === hotspot.id);
    const previousHotspot = hotspots[(activeIndex - 1 + hotspots.length) % hotspots.length];
    const nextHotspot = hotspots[(activeIndex + 1) % hotspots.length];
    focusBeam.style.setProperty("--focus-x", `${Math.min(hotspot.x, 63)}%`);
    focusBeam.style.setProperty("--focus-y", `${hotspot.y}%`);
    focusBeam.hidden = false;
    panel.innerHTML = `
      <header>
        <div><small>Hotspot ${hotspot.number} · ${escapeHtml(activeRoom.label)}</small><h3>${escapeHtml(hotspot.label)}</h3></div>
        <button type="button" data-journey-panel-close aria-label="Informationspanel schliessen">×</button>
      </header>
      <nav class="solution-journey__panel-steps" aria-label="Hotspots direkt auswählen">
        ${hotspots.map((item, index) => `
          <button
            type="button"
            data-journey-panel-step="${item.id}"
            class="${item.id === hotspot.id ? "is-active" : ""}"
            aria-current="${item.id === hotspot.id ? "step" : "false"}"
          >
            <span>${index + 1}</span>
            <strong>${escapeHtml(item.label)}</strong>
          </button>
        `).join("")}
      </nav>
      <div class="solution-journey__panel-scroll">
        <section><span>Problem</span><p>${escapeHtml(hotspot.problem)}</p></section>
        <section class="is-solution"><span>Lösung</span><p>${escapeHtml(hotspot.solution)}</p></section>
        <section><span>Ihr Nutzen</span><strong>${escapeHtml(hotspot.benefit)}</strong></section>
        <section><span>Einsatzgebiet</span><p>${escapeHtml(hotspot.use)}</p></section>
        <div class="solution-journey__tags">
          <section><span>Inhaltsbeispiele</span><div>${hotspot.content.map((item) => `<small>${escapeHtml(item)}</small>`).join("")}</div></section>
          <section><span>Integrationen</span><div>${hotspot.integrations.map((item) => `<small>${escapeHtml(item)}</small>`).join("")}</div></section>
        </div>
        <div class="solution-journey__panel-navigation">
          <button type="button" data-journey-panel-step="${previousHotspot.id}">
            <span aria-hidden="true">←</span>
            <small>Zurück</small>
          </button>
          ${activeIndex === hotspots.length - 1 ? `
            <button type="button" class="is-next" data-journey-summary>
              <span><small>Tour abschliessen</small><strong>Auswahl ansehen</strong></span>
              <i aria-hidden="true">→</i>
            </button>
          ` : `
            <button type="button" class="is-next" data-journey-panel-step="${nextHotspot.id}">
              <span><small>Nächster Hotspot ${nextHotspot.number}</small><strong>${escapeHtml(nextHotspot.label)}</strong></span>
              <i aria-hidden="true">→</i>
            </button>
          `}
        </div>
      </div>
      <footer>
        <button type="button" data-journey-save class="${isSaved(hotspot) ? "is-saved" : ""}">
          <span aria-hidden="true">${isSaved(hotspot) ? "★" : "☆"}</span>
          ${isSaved(hotspot) ? "Lösung vorgemerkt" : "Lösung vormerken"}
        </button>
        <button type="button" class="is-configure" data-journey-configure>
          <span aria-hidden="true">⚙</span> Raum konfigurieren
        </button>
        <a href="#projekt-starten" data-journey-consult>
          Beratung starten <span aria-hidden="true">↗</span>
        </a>
      </footer>
    `;
    panel.classList.remove("is-switching");
    void panel.offsetWidth;
    panel.classList.add("is-switching");
    trackFunnel(`hotspot_${hotspot.id}_opened`, "discover");
  };

  const selectRoom = (selectedRoom: Room) => {
    activeRoom = selectedRoom;
    activeScenario = 0;
    activeHotspot = null;
    tourIndex = -1;
    picker.hidden = true;
    panel.hidden = true;
    summaryPanel.hidden = true;
    consultPanel.hidden = true;
    focusBeam.hidden = true;
    root.classList.remove("is-consulting");
    roomCopy.hidden = false;
    categoryOutput.textContent = activeCategory?.shortLabel ?? "";
    roomOutput.textContent = selectedRoom.label;
    categoryKicker.textContent = activeCategory?.label ?? "";
    roomTitle.textContent = selectedRoom.label;
    roomStory.textContent = selectedRoom.story;
    roomConfigButton.hidden = false;
    syncUnderlyingRoom(selectedRoom);
    syncScenario(selectedRoom.scenarios[0]);
    renderHotspots();
    renderScenarios();
    trackFunnel("room_entered", "discover");
  };

  const showSummary = () => {
    panel.hidden = true;
    consultPanel.hidden = true;
    focusBeam.hidden = true;
    root.classList.remove("is-consulting");
    summaryPanel.hidden = false;
    summaryPanel.innerHTML = `
      <header>
        <div><small>Ihre Auswahl</small><h3>Persönliche Lösungsübersicht</h3></div>
        <button type="button" data-journey-summary-close aria-label="Zusammenfassung schliessen">×</button>
      </header>
      <div class="solution-journey__summary-scroll">
        ${saved.length === 0 ? `
          <div class="solution-journey__empty">
            <span aria-hidden="true">☆</span>
            <strong>Noch keine Lösung vorgemerkt</strong>
            <p>Öffnen Sie einen Hotspot und speichern Sie die für Sie interessanten Anwendungen.</p>
          </div>
        ` : saved.map((item) => `
          <article>
            <div><small>${escapeHtml(item.category)} · ${escapeHtml(item.room)}</small><strong>${escapeHtml(item.solution)}</strong><p>${escapeHtml(item.benefit)}</p></div>
            <button type="button" data-journey-remove="${item.key}" aria-label="${escapeHtml(item.solution)} entfernen">×</button>
          </article>
        `).join("")}
      </div>
      <footer>
        <div><span>Konfiguration</span><strong>${saved.length} ${saved.length === 1 ? "Lösung" : "Lösungen"} · ${new Set(saved.map((item) => item.roomId)).size} ${new Set(saved.map((item) => item.roomId)).size === 1 ? "Raum" : "Räume"}</strong></div>
        <div class="solution-journey__summary-actions">
          <button type="button" data-journey-configure>
            <span aria-hidden="true">⚙</span> Konfiguration verfeinern
          </button>
          <button type="button" data-journey-consult>
            Beratung mit Auswahl <span aria-hidden="true">→</span>
          </button>
        </div>
      </footer>
    `;
    trackFunnel("summary_opened", "summary");
  };

  const renderConsultation = () => {
    const selectedItems = saved.length > 0
      ? saved
      : activeHotspot && activeCategory && activeRoom
        ? [{
            category: activeCategory.label,
            room: activeRoom.label,
            solution: activeHotspot.label,
          }]
        : [];
    consultPanel.innerHTML = `
      <header>
        <div>
          <small>Schritt 3 · Persönliche Beratung</small>
          <h3 id="journey-consult-title">Aus Ihrem Raum wird ein konkretes Projekt.</h3>
        </div>
        <button type="button" data-journey-consult-close aria-label="Beratung schliessen">×</button>
      </header>
      <div class="solution-journey__consult-scroll">
        <ol class="solution-journey__funnel-progress" aria-label="Projektfortschritt">
          <li class="is-complete"><span>1</span><strong>Entdecken</strong></li>
          <li class="is-complete"><span>2</span><strong>Konfigurieren</strong></li>
          <li class="is-active"><span>3</span><strong>Beratung</strong></li>
        </ol>
        <section class="solution-journey__lead-summary">
          <div>
            <small>Ihre Ausgangslage</small>
            <strong>${escapeHtml(activeCategory?.label ?? "Individuelle Branche")} · ${escapeHtml(activeRoom?.label ?? "Individueller Raum")}</strong>
          </div>
          <span>${selectedItems.length} ${selectedItems.length === 1 ? "Lösung" : "Lösungen"}</span>
          ${selectedItems.length > 0 ? `
            <ul>
              ${selectedItems.slice(0, 4).map((item) => `
                <li><span aria-hidden="true">✓</span>${escapeHtml(item.solution)}</li>
              `).join("")}
            </ul>
          ` : `
            <p>Ihre aktuelle Raumkonfiguration wird der Anfrage automatisch als Ausgangspunkt beigefügt.</p>
          `}
        </section>
        <form
          class="solution-journey__lead-form"
          id="journey-lead-form"
          data-journey-lead-form
        >
          <div class="solution-journey__lead-qualifiers">
            <label>
              <span>Wichtigstes Projektziel</span>
              <select name="goal" required>
                <option value="">Bitte auswählen</option>
                <option>Kundenerlebnis verbessern</option>
                <option>Orientierung und Information</option>
                <option>Umsatz und Aktivierung</option>
                <option>Prozesse effizienter gestalten</option>
                <option>Markenauftritt modernisieren</option>
              </select>
            </label>
            <label>
              <span>Gewünschter Projektstart</span>
              <select name="timeline" required>
                <option value="">Bitte auswählen</option>
                <option>So bald wie möglich</option>
                <option>In 3–6 Monaten</option>
                <option>In 6–12 Monaten</option>
                <option>Erstorientierung</option>
              </select>
            </label>
            <label>
              <span>Anzahl Standorte</span>
              <select name="locations" required>
                <option value="">Bitte auswählen</option>
                <option>1 Standort</option>
                <option>2–5 Standorte</option>
                <option>6–20 Standorte</option>
                <option>Mehr als 20 Standorte</option>
              </select>
            </label>
          </div>
          <div class="solution-journey__lead-contact">
            <label><span>Name</span><input name="name" autocomplete="name" required></label>
            <label><span>Geschäftliche E-Mail</span><input name="email" type="email" autocomplete="email" required></label>
            <label><span>Telefon <small>optional</small></span><input name="phone" type="tel" autocomplete="tel"></label>
            <label class="is-wide"><span>Was sollten wir noch wissen? <small>optional</small></span><textarea name="note" rows="3"></textarea></label>
          </div>
        </form>
      </div>
      <footer>
        <p class="solution-journey__lead-note">
          Unverbindlich · Ihre Auswahl wird automatisch beigefügt.
        </p>
        <button
          class="solution-journey__lead-submit"
          type="submit"
          form="journey-lead-form"
        >
          Beratung anfragen <span aria-hidden="true">→</span>
        </button>
      </footer>
    `;
  };

  const openConsultation = () => {
    if (root.classList.contains("is-configuring")) {
      setConfigurationMode(false);
    }
    shell.hidden = false;
    root.classList.add("is-open");
    root.classList.add("is-consulting");
    root.classList.remove("has-saved-room");
    savedRoomCta.hidden = true;
    stage.classList.add("is-solution-journey");
    stage.classList.remove("is-journey-configuring");
    panel.hidden = true;
    summaryPanel.hidden = true;
    picker.hidden = true;
    tourStatus.hidden = true;
    focusBeam.hidden = true;
    configNextButton.hidden = true;
    renderConsultation();
    consultPanel.hidden = false;
    trackFunnel("consultation_opened", "consult");
    window.setTimeout(() => {
      consultPanel.querySelector<HTMLSelectElement>('select[name="goal"]')?.focus();
    }, 0);
  };

  const closeConsultation = () => {
    root.classList.remove("is-consulting");
    consultPanel.hidden = true;
    trackFunnel("consultation_closed", "discover");
  };

  const toggleSaved = () => {
    if (!activeCategory || !activeRoom || !activeHotspot) return;
    const key = `${activeCategory.id}:${activeRoom.id}:${activeHotspot.id}`;
    const existing = saved.findIndex((item) => item.key === key);
    if (existing >= 0) saved.splice(existing, 1);
    else {
      saved.push({
        key,
        categoryId: activeCategory.id,
        category: activeCategory.label,
        roomId: activeRoom.id,
        room: activeRoom.label,
        hotspotId: activeHotspot.id,
        solution: activeHotspot.label,
        benefit: activeHotspot.benefit,
        scenario: activeRoom.scenarios[activeScenario].label,
      });
    }
    persistSaved();
    openHotspot(activeHotspot);
    showToast(
      existing >= 0
        ? "Lösung aus Ihrer Auswahl entfernt."
        : `${saved.length} ${saved.length === 1 ? "Lösung vorgemerkt" : "Lösungen vorgemerkt"} – jetzt im Raum konfigurieren.`,
    );
    trackFunnel(
      existing >= 0 ? "solution_removed" : "solution_saved",
      "discover",
    );
  };

  const startTour = () => {
    if (!activeCategory || !activeRoom) {
      openPicker();
      return;
    }
    tourIndex = 0;
    const hotspots = buildHotspots(activeCategory, activeRoom);
    openHotspot(hotspots[tourIndex]);
    tourStatus.hidden = false;
    tourStatus.innerHTML = `
      <span>Geführte Tour · ${tourIndex + 1} / ${hotspots.length}</span>
      <button type="button" data-journey-tour-next>${tourIndex === hotspots.length - 1 ? "Tour beenden" : "Weiter"} <i aria-hidden="true">→</i></button>
      <button type="button" data-journey-tour-stop>Abbrechen</button>
    `;
    trackFunnel("guided_tour_started", "tour");
  };

  const nextTourStep = () => {
    if (!activeCategory || !activeRoom || tourIndex < 0) return;
    const hotspots = buildHotspots(activeCategory, activeRoom);
    if (tourIndex >= hotspots.length - 1) {
      tourIndex = -1;
      tourStatus.hidden = true;
      showSummary();
      return;
    }
    tourIndex += 1;
    openHotspot(hotspots[tourIndex]);
    startTourAtIndex();
  };

  const startTourAtIndex = () => {
    if (!activeCategory || !activeRoom || tourIndex < 0) return;
    const hotspots = buildHotspots(activeCategory, activeRoom);
    tourStatus.hidden = false;
    tourStatus.innerHTML = `
      <span>Geführte Tour · ${tourIndex + 1} / ${hotspots.length}</span>
      <button type="button" data-journey-tour-next>${tourIndex === hotspots.length - 1 ? "Tour beenden" : "Weiter"} <i aria-hidden="true">→</i></button>
      <button type="button" data-journey-tour-stop>Abbrechen</button>
    `;
  };

  const openJourney = () => {
    stage.scrollIntoView({ block: "start", behavior: "auto" });
    shell.hidden = false;
    root.classList.add("is-open");
    setConfigurationMode(false);
    openPicker(activeCategory ? "rooms" : "categories");
  };

  const closeJourney = () => {
    shell.hidden = true;
    root.classList.remove("is-open", "is-configuring", "is-consulting");
    stage.classList.remove("is-solution-journey");
    stage.classList.remove("is-journey-configuring");
    consultPanel.hidden = true;
    focusBeam.hidden = true;
    configNextButton.hidden = true;
    tourIndex = -1;
    tourStatus.hidden = true;
    root.querySelector<HTMLButtonElement>("[data-journey-open]")?.focus();
  };

  const handleClick = (event: MouseEvent) => {
    const target = event.target as HTMLElement;
    const button = target.closest<HTMLElement>("button, a");
    if (!button || !root.contains(button)) return;

    if (button.matches("[data-journey-open]")) openJourney();
    else if (button.matches("[data-journey-close]")) closeJourney();
    else if (button.matches("[data-journey-configure]")) {
      setConfigurationMode(!root.classList.contains("is-configuring"));
    }
    else if (button.matches("[data-journey-picker-close]")) {
      if (activeRoom) picker.hidden = true;
      else closeJourney();
    } else if (button.matches("[data-journey-categories]")) openPicker("categories");
    else if (button.matches("[data-journey-rooms]")) openPicker(activeCategory ? "rooms" : "categories");
    else if (button.matches("[data-journey-category-id]")) {
      activeCategory = categories.find((category) => category.id === button.dataset.journeyCategoryId) ?? null;
      if (activeCategory) openPicker("rooms");
    } else if (button.matches("[data-journey-room-id]") && activeCategory) {
      const selectedRoom = activeCategory.rooms.find((item) => item.id === button.dataset.journeyRoomId);
      if (selectedRoom) selectRoom(selectedRoom);
    } else if (button.matches("[data-journey-hotspot]") && activeCategory && activeRoom) {
      const hotspot = buildHotspots(activeCategory, activeRoom)
        .find((item) => item.id === button.dataset.journeyHotspot);
      if (hotspot) {
        if (tourIndex >= 0) {
          tourIndex = buildHotspots(activeCategory, activeRoom)
            .findIndex((item) => item.id === hotspot.id);
        }
        openHotspot(hotspot);
        if (tourIndex >= 0) startTourAtIndex();
      }
    } else if (button.matches("[data-journey-panel-step]") && activeCategory && activeRoom) {
      const hotspots = buildHotspots(activeCategory, activeRoom);
      const hotspot = hotspots.find(
        (item) => item.id === button.dataset.journeyPanelStep,
      );
      if (hotspot) {
        if (tourIndex >= 0) {
          tourIndex = hotspots.findIndex((item) => item.id === hotspot.id);
        }
        openHotspot(hotspot);
        if (tourIndex >= 0) startTourAtIndex();
      }
    } else if (button.matches("[data-journey-panel-close]")) {
      panel.hidden = true;
      focusBeam.hidden = true;
      activeHotspot = null;
      renderHotspots();
    } else if (button.matches("[data-journey-save]")) toggleSaved();
    else if (button.matches("[data-journey-summary]")) showSummary();
    else if (button.matches("[data-journey-summary-close]")) summaryPanel.hidden = true;
    else if (button.matches("[data-journey-remove]")) {
      saved = saved.filter((item) => item.key !== button.dataset.journeyRemove);
      persistSaved();
      showSummary();
    } else if (button.matches("[data-journey-scenario]") && activeRoom) {
      activeScenario = Number(button.dataset.journeyScenario);
      syncScenario(activeRoom.scenarios[activeScenario]);
      renderScenarios();
    } else if (button.matches("[data-journey-tour]")) {
      setConfigurationMode(false);
      startTour();
    }
    else if (button.matches("[data-journey-tour-next]")) nextTourStep();
    else if (button.matches("[data-journey-tour-stop]")) {
      tourIndex = -1;
      tourStatus.hidden = true;
    } else if (button.matches("[data-journey-consult]")) {
      event.preventDefault();
      openConsultation();
    } else if (button.matches("[data-journey-consult-close]")) {
      closeConsultation();
    }
  };

  const handleKeydown = (event: KeyboardEvent) => {
    if (shell.hidden) return;
    if (
      (event.key === "ArrowRight" || event.key === "ArrowLeft")
      && !panel.hidden
      && activeCategory
      && activeRoom
      && activeHotspot
    ) {
      event.preventDefault();
      const hotspots = buildHotspots(activeCategory, activeRoom);
      const activeIndex = hotspots.findIndex(
        (item) => item.id === activeHotspot?.id,
      );
      const direction = event.key === "ArrowRight" ? 1 : -1;
      const nextIndex = (
        activeIndex + direction + hotspots.length
      ) % hotspots.length;
      if (tourIndex >= 0) tourIndex = nextIndex;
      openHotspot(hotspots[nextIndex]);
      if (tourIndex >= 0) startTourAtIndex();
      return;
    }
    if (event.key !== "Escape") return;
    if (!consultPanel.hidden) closeConsultation();
    else if (!picker.hidden && activeRoom) picker.hidden = true;
    else if (!panel.hidden) {
      panel.hidden = true;
      focusBeam.hidden = true;
      activeHotspot = null;
      renderHotspots();
    }
    else if (!summaryPanel.hidden) summaryPanel.hidden = true;
    else closeJourney();
  };

  const handleSizeChange = () => {
    const sizeButton = document.querySelector<HTMLButtonElement>(
      `[data-showroom-setting="roomSize"][data-value="${sizeSelect.value}"]`,
    );
    sizeButton?.click();
    updateJourneySize();
  };

  const handleLeadSubmit = (event: SubmitEvent) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || !form.matches("[data-journey-lead-form]")) {
      return;
    }
    event.preventDefault();
    if (!form.reportValidity()) return;
    const formData = new FormData(form);
    const selectedSolutions = saved.length > 0
      ? saved.map((item) => (
          `- ${item.category} / ${item.room}: ${item.solution} (${item.scenario})`
        ))
      : [
          `- ${activeCategory?.label ?? "Branche offen"} / ${activeRoom?.label ?? "Raum offen"}`,
        ];
    const body = [
      "Guten Tag SwissCompact",
      "",
      "ich wünsche eine unverbindliche Beratung zu meiner Showroom-Konfiguration.",
      "",
      `Name: ${String(formData.get("name") ?? "")}`,
      `E-Mail: ${String(formData.get("email") ?? "")}`,
      `Telefon: ${String(formData.get("phone") ?? "") || "–"}`,
      `Projektziel: ${String(formData.get("goal") ?? "")}`,
      `Projektstart: ${String(formData.get("timeline") ?? "")}`,
      `Standorte: ${String(formData.get("locations") ?? "")}`,
      "",
      "Ausgewählte Lösungen:",
      ...selectedSolutions,
      "",
      `Zusatzinformation: ${String(formData.get("note") ?? "") || "–"}`,
    ].join("\n");
    trackFunnel("consultation_submitted", "consult");
    window.location.href = `mailto:kontakt@swisscompact.com?subject=${
      encodeURIComponent("Beratungsanfrage Virtual SwissCompact Showroom")
    }&body=${encodeURIComponent(body)}`;
  };

  const roomSizeObserver = new MutationObserver(updateJourneySize);
  if (showroomRoot) {
    roomSizeObserver.observe(showroomRoot, {
      attributes: true,
      attributeFilter: ["data-showroom-room-size"],
    });
  }

  const externalCategoryButtons = Array.from(
    document.querySelectorAll<HTMLButtonElement>(
      "[data-showroom-solution-category]",
    ),
  );
  const handleExternalCategory = (event: Event) => {
    const button = event.currentTarget as HTMLButtonElement;
    activeCategory = categories.find(
      (category) => category.id === button.dataset.showroomSolutionCategory,
    ) ?? null;
    document.querySelector<HTMLButtonElement>(
      "[data-showroom-themes-close]",
    )?.click();
    openJourney();
  };

  const handleShowroomSaved = (event: Event): void => {
    const detail = (event as CustomEvent<{
      roomLabel?: string;
    }>).detail;
    savedRoomCtaLabel.textContent = detail?.roomLabel ?? "Ihr Raum";
    savedRoomCta.hidden = false;
    root.classList.add("has-saved-room");
    window.requestAnimationFrame(() => savedRoomCta.focus());
  };
  const handleOpenConsultation = (): void => openConsultation();

  root.addEventListener("click", handleClick);
  root.addEventListener("submit", handleLeadSubmit);
  window.addEventListener("swisscompact:showroom-saved", handleShowroomSaved);
  window.addEventListener(
    "swisscompact:open-consultation",
    handleOpenConsultation,
  );
  sizeSelect.addEventListener("change", handleSizeChange);
  document.addEventListener("keydown", handleKeydown);
  externalCategoryButtons.forEach((button) => {
    button.addEventListener("click", handleExternalCategory);
  });
  renderPicker();
  persistSaved();

  return {
    destroy() {
      root.removeEventListener("click", handleClick);
      root.removeEventListener("submit", handleLeadSubmit);
      window.removeEventListener(
        "swisscompact:showroom-saved",
        handleShowroomSaved,
      );
      window.removeEventListener(
        "swisscompact:open-consultation",
        handleOpenConsultation,
      );
      window.clearTimeout(toastTimer);
      sizeSelect.removeEventListener("change", handleSizeChange);
      document.removeEventListener("keydown", handleKeydown);
      roomSizeObserver.disconnect();
      externalCategoryButtons.forEach((button) => {
        button.removeEventListener("click", handleExternalCategory);
      });
      stage.classList.remove("is-solution-journey");
      stage.classList.remove("is-journey-configuring");
      root.remove();
    },
  };
}

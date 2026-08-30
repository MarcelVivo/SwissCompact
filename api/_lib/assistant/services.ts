// Authoritative SwissCompact service catalogue used by the public sales assistant.

export type AssistantServiceCategory =
  | "strategy"
  | "software"
  | "hardware"
  | "media"
  | "marketing"
  | "automation";

export type AssistantServiceDefinition = {
  id: string;
  name: string;
  category: AssistantServiceCategory;
  description: string;
  solves: string[];
  suitableFor: string[];
  dependencies: string[];
  incompatibleWith: string[];
  priority: number;
};

export const ASSISTANT_SERVICE_LIBRARY: AssistantServiceDefinition[] = [
  {
    id: "website-brand-platform",
    name: "Website, Marke & digitale Präsenz",
    category: "marketing",
    description:
      "Konzipiert und erstellt eine vollständige Unternehmenswebsite inklusive Strategie, UX, Design, Entwicklung, Inhalten, Bildern, Texten sowie SEO- und GEO-Optimierung.",
    solves: ["fragmentierte Online-Präsenz", "unklare Nutzerführung", "fehlende Inhalte", "geringe Auffindbarkeit"],
    suitableFor: ["Neugründungen", "Relaunch", "wachsende Unternehmen", "Unternehmen mit mehreren Leistungen oder Standorten"],
    dependencies: ["digital-audit"],
    incompatibleWith: [],
    priority: 96,
  },
  {
    id: "business-operations-platform",
    name: "Individuelles Business Dashboard",
    category: "software",
    description:
      "Bündelt CRM, ERP, Projekte, Offerten, Rechnungen, Marketing und kundenspezifische Abläufe in einem Dashboard auf der eigenen Domain.",
    solves: ["isolierte Einzellösungen", "manuelle Administration", "fehlender Kundenüberblick", "Medienbrüche zwischen Teams"],
    suitableFor: ["KMU", "Dienstleister", "Retail", "mehrere Standorte", "individuelle Geschäftsprozesse"],
    dependencies: ["digital-audit"],
    incompatibleWith: [],
    priority: 95,
  },
  {
    id: "digital-audit",
    name: "Digitale Standortbestimmung",
    category: "strategy",
    description:
      "Ordnet Ziele, Räume und Customer Journey, bevor eine Investition in Displays oder Software festgelegt wird.",
    solves: ["unklare Wirkung der Räume", "zu viele Einzelentscheidungen", "fehlende Roadmap"],
    suitableFor: ["Retail", "Gastronomie", "Hospitality", "Corporate", "mehrere Standorte"],
    dependencies: [],
    incompatibleWith: [],
    priority: 100,
  },
  {
    id: "virtual-showroom-configurator",
    name: "Virtual Showroom Konfigurator",
    category: "software",
    description:
      "Lässt Räume, Displays und Möblierung vorab virtuell planen und prüfen, bevor real gebaut wird.",
    solves: ["schwer vorstellbare Planung", "späte Änderungswünsche", "Fehlplatzierung von Displays"],
    suitableFor: ["Retail", "Gastronomie", "Hotellerie", "Bildung", "Corporate", "Immobilien"],
    dependencies: [],
    incompatibleWith: ["einzelnes Standalone-Display ohne Raumbezug"],
    priority: 88,
  },
  {
    id: "content-management-system",
    name: "SwissCompact Display Portal",
    category: "software",
    description:
      "Die eigenständige SwissCompact Software steuert Inhalte, Kampagnen, Displays und LED-Netzwerke zentral – unter swisscompact.com/portal oder als White-Label-Portal auf der Kundendomain.",
    solves: ["manuelles Bespielen jedes Displays", "veraltete Inhalte", "kein Standortüberblick", "komplizierte Content-Erstellung"],
    suitableFor: ["mehrere Displays", "mehrere Standorte", "regelmässig wechselnde Inhalte"],
    dependencies: ["hardware-displays-led oder bestehende Displays"],
    incompatibleWith: [],
    priority: 92,
  },
  {
    id: "ai-business-automation",
    name: "KI-Bots & Prozessautomatisierung",
    category: "automation",
    description:
      "Unterstützt Administration, Kundenpflege, Marketing und Content-Erstellung direkt in Dashboard und Display Portal mit klar kontrollierten KI-Abläufen.",
    solves: ["wiederkehrende Handarbeit", "langsame Content-Produktion", "uneinheitliche Kundenpflege", "fehlende Prozessunterstützung"],
    suitableFor: ["wachsende Teams", "regelmässige Kampagnen", "mehrere Standorte", "individuelle Workflows"],
    dependencies: ["business-operations-platform oder content-management-system"],
    incompatibleWith: [],
    priority: 86,
  },
  {
    id: "hardware-displays-led",
    name: "Hardware & Systemintegration",
    category: "hardware",
    description:
      "Displays und LED-Flächen werden ausgewählt, verbaut und mit Software und Gebäudetechnik verbunden.",
    solves: ["falsche Displaywahl", "isolierte Geräte", "fehlende Integration ins System"],
    suitableFor: ["Neubau", "Umbau", "Erweiterung bestehender Standorte"],
    dependencies: ["digital-audit"],
    incompatibleWith: [],
    priority: 85,
  },
  {
    id: "media-studio-campaigns",
    name: "Media Studio: Motion Design & Content",
    category: "media",
    description:
      "Motion Design, Film, 3D und Kampagnensysteme, entwickelt für Bewegung, Distanz und Raum statt für einen kleineren Bildschirm.",
    solves: ["Inhalte wirken auf grossen Displays flach", "kein durchgängiges Kampagnensystem", "fehlende Templates"],
    suitableFor: ["Kampagnen", "Eröffnungen", "wiederkehrende Saison-Inhalte"],
    dependencies: [],
    incompatibleWith: [],
    priority: 80,
  },
  {
    id: "wayfinding-orientation",
    name: "Orientierung & Wayfinding",
    category: "software",
    description:
      "Relevante Informationen erscheinen genau im richtigen Moment und helfen bei Orientierung und Entscheidung im Raum.",
    solves: ["Besucher finden sich schlecht zurecht", "Informationsflut am falschen Ort", "lange Wege zum Ziel"],
    suitableFor: ["grössere Flächen", "Hotellerie", "Bildung", "Gesundheit", "öffentliche Gebäude"],
    dependencies: [],
    incompatibleWith: [],
    priority: 74,
  },
  {
    id: "immersive-experience",
    name: "Immersive Rauminszenierung",
    category: "media",
    description:
      "Technologie wird Teil der Architektur und des Markenerlebnisses, statt als zusätzlicher Screen aufzufallen.",
    solves: ["Räume wirken austauschbar", "Marke bleibt nicht in Erinnerung", "kein emotionaler Moment"],
    suitableFor: ["Flagship-Stores", "Showrooms", "Eventflächen", "Erlebnisgastronomie"],
    dependencies: ["hardware-displays-led", "media-studio-campaigns"],
    incompatibleWith: ["reine Informationsanzeige ohne gestalterischen Anspruch"],
    priority: 70,
  },
  {
    id: "retail-media-network",
    name: "Retail Media Netzwerk",
    category: "marketing",
    description:
      "Digitale Flächen werden zu planbaren, buch- und messbaren Werbeflächen für eigene oder Partnerkampagnen.",
    solves: ["ungenutztes Werbepotenzial eigener Flächen", "keine Einnahmen aus Displaynetz", "keine Kampagnensteuerung"],
    suitableFor: ["mehrere Standorte", "Einkaufszentren", "Markenpartnerschaften"],
    dependencies: ["content-management-system"],
    incompatibleWith: ["einzelnes Display ohne Netzwerk"],
    priority: 65,
  },
  {
    id: "rollout-betrieb-support",
    name: "Rollout, Betrieb & Support",
    category: "automation",
    description:
      "Sichert Rollout, Monitoring und Support über die gesamte Betriebsdauer, nicht nur bis zur Installation.",
    solves: ["Ausfälle bleiben unbemerkt", "kein Ansprechpartner nach Installation", "Rollout auf mehrere Standorte unkoordiniert"],
    suitableFor: ["mehrere Standorte", "laufender Betrieb", "Standortnetze"],
    dependencies: ["hardware-displays-led"],
    incompatibleWith: [],
    priority: 78,
  },
];

export const ASSISTANT_SERVICE_IDS = ASSISTANT_SERVICE_LIBRARY.map((service) => service.id);

export function getAssistantService(serviceId: string) {
  return ASSISTANT_SERVICE_LIBRARY.find((service) => service.id === serviceId);
}

export function getAssistantServiceCatalogForPrompt() {
  return ASSISTANT_SERVICE_LIBRARY.map((service) => ({
    id: service.id,
    name: service.name,
    category: service.category,
    description: service.description,
    solves: service.solves,
    suitableFor: service.suitableFor,
    dependencies: service.dependencies,
    incompatibleWith: service.incompatibleWith,
  }));
}

export interface PlatformDetails {
  destroy: () => void;
}

type PlatformDetailKey = "website" | "dashboard" | "portal" | "hardware";

interface PlatformDetail {
  number: string;
  category: string;
  title: string;
  headline: string;
  intro: string;
  services: string[];
  result: string;
  output: string;
  image: string;
  imageAlt: string;
}

const PLATFORM_DETAILS: Record<PlatformDetailKey, PlatformDetail> = {
  website: {
    number: "01",
    category: "Digitale Präsenz & Marke",
    title: "Website & Marke",
    headline: "Eine Website, die die richtigen Menschen erreicht und ins Gespräch bringt.",
    intro: "Strategie, UX, Design, Entwicklung, Inhalte und Sichtbarkeit greifen von Anfang an ineinander – für eine digitale Präsenz, die Ihre Marke verständlich und wirksam vermittelt.",
    services: [
      "Positionierung, Zielgruppen und klare Angebotsstruktur",
      "UX, visuelles Design und mobile Nutzerführung",
      "Entwicklung mit Performance- und Qualitätsfokus",
      "Fotografie, Inhalte und redaktionelle Systeme",
      "SEO und GEO für Suche und KI-gestützte Antworten",
      "Laufende Optimierung auf Basis echter Nutzung",
    ],
    result: "Ein digitaler Auftritt, der nicht nur gut aussieht, sondern Orientierung schafft, Vertrauen aufbaut und qualifizierte Anfragen auslöst.",
    output: "Typische Ergebnisse: Markenplattform · Website-System · Content- und Sichtbarkeitsplan",
    image: "/images/platform/website-marke.webp",
    imageAlt: "Designer arbeitet an einer digitalen Markenwelt in einem dunklen Studio",
  },
  dashboard: {
    number: "02",
    category: "Prozesse & Unternehmenssteuerung",
    title: "Business Dashboard",
    headline: "CRM, Projekte, Finanzen und Automatisierung in einem System.",
    intro: "Wir gestalten ein Dashboard, das Ihre tatsächlichen Abläufe abbildet: mit klaren Rollen, verbundenen Informationen und Automatisierungen, die dem Team spürbar Arbeit abnehmen.",
    services: [
      "Kundenverwaltung, Auftragstrichter und Projektübersicht",
      "Angebote, Rechnungen und Zahlungsfreigaben",
      "Rollen, Rechte und sichere Kundenverwaltung",
      "Automatisierungen und KI-Bots für Routineaufgaben",
      "Eigene Domain und White-Label-fähige Oberfläche",
      "Laufende Weiterentwicklung mit Ihrem Betrieb",
    ],
    result: "Weniger Medienbrüche, klarere Verantwortlichkeiten und ein Team, das mit aktuellen Daten statt mit Excel-Listen arbeitet.",
    output: "Typische Ergebnisse: Prozesslandkarte · individuelles Dashboard · Automatisierungs-Setup",
    image: "/images/platform/business-dashboard.webp",
    imageAlt: "Mitarbeiter vor einer Wand mit Daten- und Prozessübersichten",
  },
  portal: {
    number: "03",
    category: "Content & Display-Netzwerk",
    title: "Display Portal",
    headline: "Inhalte, Kampagnen und Displays zentral steuern.",
    intro: "Das SwissCompact Display Portal verbindet die Erstellung, Freigabe und Auslieferung von Inhalten mit der täglichen Steuerung einzelner Displays und ganzer LED-Netzwerke.",
    services: [
      "Zentrale Steuerung von Displays und LED-Netzwerken",
      "Content-Erstellung mit KI und wiederverwendbaren Vorlagen",
      "Kampagnenplanung nach Zeit, Ort und Zielgruppe",
      "Rollen, Freigaben und sichere Veröffentlichungen",
      "Live-Vorschau vor dem Go-live",
      "Eigene Domain oder White-Label für Ihr Unternehmen",
    ],
    result: "Aktuelle Kommunikation erreicht jeden Standort zur richtigen Zeit – ohne Vor-Ort-Einsätze und ohne unkontrollierte Veröffentlichungen.",
    output: "Typische Ergebnisse: Portal-Setup · Content-Bibliothek · Kampagnen- und Freigabemodell",
    image: "/images/platform/display-portal.webp",
    imageAlt: "Professioneller Arbeitsplatz zur Steuerung digitaler Displays",
  },
  hardware: {
    number: "04",
    category: "Hardware & kontinuierlicher Betrieb",
    title: "Hardware & Betrieb",
    headline: "Von der passenden Fläche bis zur langfristigen Betreuung.",
    intro: "Wir verbinden Planung, Beschaffung, Installation und Betrieb zu einer durchgängigen Verantwortung. So passen Hardware, Raum, Inhalte und das spätere Display Portal zusammen.",
    services: [
      "Display- und LED-Konzeption für Raum, Licht und Sichtabstand",
      "Beschaffung, fachgerechte Montage und Verkabelung",
      "Anbindung an Netzwerk und Display Portal",
      "Abnahme, Inbetriebnahme und Betriebsdokumentation",
      "Monitoring für den Status aller Geräte",
      "Wartung, Updates und persönlicher Support",
    ],
    result: "Eine zuverlässige digitale Infrastruktur mit einem festen Ansprechpartner – vom ersten Entwurf bis weit über die Eröffnung hinaus.",
    output: "Typische Ergebnisse: Hardware-Konzept · Installationsplan · Monitoring- und Supportmodell",
    image: "/images/platform/hardware-betrieb.webp",
    imageAlt: "Techniker betreut eine integrierte LED-Wand in einem hochwertigen Innenraum",
  },
};

const isPlatformDetailKey = (value: string | undefined): value is PlatformDetailKey => (
  value === "website" || value === "dashboard" || value === "portal" || value === "hardware"
);

export function mountPlatformDetails(): PlatformDetails {
  const dialog = document.querySelector<HTMLDialogElement>("[data-platform-detail-dialog]");
  const triggers = Array.from(document.querySelectorAll<HTMLElement>("[data-platform-detail]"));
  if (!dialog || triggers.length === 0) return { destroy: () => {} };

  const closeButton = dialog.querySelector<HTMLButtonElement>("[data-platform-detail-close]");
  const cta = dialog.querySelector<HTMLButtonElement>("[data-platform-detail-cta]");
  const surface = dialog.querySelector<HTMLElement>(".project-detail__surface");
  const services = dialog.querySelector<HTMLUListElement>("[data-platform-detail-services]");
  const image = dialog.querySelector<HTMLImageElement>("[data-platform-detail-image]");
  const fields = {
    number: dialog.querySelector<HTMLElement>("[data-platform-detail-number]"),
    category: dialog.querySelector<HTMLElement>("[data-platform-detail-category]"),
    title: dialog.querySelector<HTMLElement>("[data-platform-detail-title]"),
    headline: dialog.querySelector<HTMLElement>("[data-platform-detail-headline]"),
    intro: dialog.querySelector<HTMLElement>("[data-platform-detail-intro]"),
    result: dialog.querySelector<HTMLElement>("[data-platform-detail-result]"),
    output: dialog.querySelector<HTMLElement>("[data-platform-detail-output]"),
    index: dialog.querySelector<HTMLElement>("[data-platform-detail-index]"),
  };
  const imagePreloads = Object.values(PLATFORM_DETAILS).map(({ image: source }) => {
    const preload = new Image();
    preload.src = source;
    return preload;
  });
  let activeTrigger: HTMLElement | null = null;

  const close = (restoreFocus = true): void => {
    if (dialog.open) dialog.close();
    document.body.classList.remove("is-platform-detail-open");
    if (restoreFocus) activeTrigger?.focus();
  };
  const open = (trigger: HTMLElement): void => {
    const key = trigger.dataset.platformDetail;
    if (!isPlatformDetailKey(key)) return;
    const detail = PLATFORM_DETAILS[key];
    activeTrigger = trigger;
    fields.number!.textContent = detail.number;
    fields.category!.textContent = detail.category;
    fields.title!.textContent = detail.title;
    fields.headline!.textContent = detail.headline;
    fields.intro!.textContent = detail.intro;
    fields.result!.textContent = detail.result;
    fields.output!.textContent = detail.output;
    fields.index!.textContent = `Baustein ${detail.number} von 04`;
    if (image) {
      image.src = detail.image;
      image.alt = detail.imageAlt;
    }
    services!.replaceChildren(...detail.services.map((service) => {
      const item = document.createElement("li");
      item.textContent = service;
      return item;
    }));
    dialog.dataset.platformDetailActive = key;
    if (surface) surface.scrollTop = 0;
    document.body.classList.add("is-platform-detail-open");
    dialog.showModal();
  };

  const triggerHandlers = triggers.map((trigger) => {
    const handler = (event: Event): void => {
      event.preventDefault();
      open(trigger);
    };
    trigger.addEventListener("click", handler);
    return { trigger, handler };
  });
  const closeHandler = (): void => close();
  const backdropHandler = (event: MouseEvent): void => {
    if (event.target === dialog) close();
  };
  const nativeCloseHandler = (): void => {
    document.body.classList.remove("is-platform-detail-open");
  };
  const ctaHandler = (): void => {
    close(false);
    document.querySelector<HTMLElement>("[data-sales-assistant-open]")?.click();
  };
  closeButton?.addEventListener("click", closeHandler);
  dialog.addEventListener("click", backdropHandler);
  dialog.addEventListener("close", nativeCloseHandler);
  cta?.addEventListener("click", ctaHandler);

  return {
    destroy: () => {
      triggerHandlers.forEach(({ trigger, handler }) => trigger.removeEventListener("click", handler));
      closeButton?.removeEventListener("click", closeHandler);
      dialog.removeEventListener("click", backdropHandler);
      dialog.removeEventListener("close", nativeCloseHandler);
      cta?.removeEventListener("click", ctaHandler);
      imagePreloads.forEach((preload) => preload.removeAttribute("src"));
      close(false);
    },
  };
}

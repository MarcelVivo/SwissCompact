export interface ProjectSteps {
  destroy: () => void;
}

type ProjectStepKey = "strategy" | "media" | "system" | "operations";

interface ProjectStepDetail {
  number: string;
  phase: string;
  title: string;
  headline: string;
  intro: string;
  services: string[];
  result: string;
  output: string;
  image: string;
  imageAlt: string;
}

const PROJECT_STEP_DETAILS: Record<ProjectStepKey, ProjectStepDetail> = {
  strategy: {
    number: "01",
    phase: "Fundament & Leitplanken",
    title: "Strategie",
    headline: "Von der Idee zu einem belastbaren Konzept.",
    intro:
      "Wir verbinden Geschäftsziele, Zielgruppen und räumliche Situationen zu einer klaren Digital-Experience-Strategie – bevor Technik oder Inhalte festgelegt werden.",
    services: [
      "Standort-, Zielgruppen- und Bedarfsanalyse",
      "Customer Journey und relevante Nutzungsmomente",
      "Use Cases, Touchpoints und Erfolgskriterien",
      "Konzept, Priorisierung, Budgetrahmen und Roadmap",
    ],
    result:
      "Alle Beteiligten entscheiden auf derselben Grundlage. Investitionen, Inhalte und Technologie folgen einem nachvollziehbaren Zielbild.",
    output: "Typische Ergebnisse: Experience-Konzept · Use-Case-Map · Projekt-Roadmap",
    image: "/images/project/detail-strategy.webp",
    imageAlt: "Beratungsteam bei der räumlichen Projektplanung",
  },
  media: {
    number: "02",
    phase: "Inhalt & Inszenierung",
    title: "Media",
    headline: "Content, der für Distanz, Bewegung und Raum gemacht ist.",
    intro:
      "Wir entwickeln Inhalte nicht vom Desktop aus, sondern aus der Perspektive der Menschen vor Ort. Dramaturgie, Format und Lesbarkeit werden auf jede Fläche abgestimmt.",
    services: [
      "Content-Strategie und redaktionelle Planung",
      "Motion Design, Film, 3D und Echtzeit-Inhalte",
      "Responsive Formate für Displays, LED und Touch",
      "Templates und Kampagnensysteme für den Alltag",
    ],
    result:
      "Eine konsistente visuelle Sprache, die Aufmerksamkeit schafft, Informationen verständlich vermittelt und langfristig effizient bespielbar bleibt.",
    output: "Typische Ergebnisse: Content-Konzept · Master Assets · skalierbares Template-System",
    image: "/images/project/detail-media.webp",
    imageAlt: "Filmteam bei der Produktion räumlicher Medieninhalte",
  },
  system: {
    number: "03",
    phase: "Technologie & Integration",
    title: "System",
    headline: "Hardware und Software als präzise abgestimmtes Ganzes.",
    intro:
      "Wir planen die technische Architektur passend zum Raum, zur Nutzung und zum Betrieb. Displays, LED, Steuerung und Datenquellen greifen zuverlässig ineinander.",
    services: [
      "Display-, LED- und Medientechnikplanung",
      "CMS, Player, Netzwerk und Rechtekonzept",
      "Schnittstellen zu Daten, Buchung und Drittsystemen",
      "Prototyping, Tests, Dokumentation und Abnahme",
    ],
    result:
      "Ein robustes, wartbares System ohne unnötige Komplexität – technisch sauber dimensioniert und bereit für Erweiterungen.",
    output: "Typische Ergebnisse: Systemdesign · Komponentenplan · Integrations- und Testkonzept",
    image: "/images/project/detail-system.webp",
    imageAlt: "Techniker bei der Inbetriebnahme eines integrierten Displaysystems",
  },
  operations: {
    number: "04",
    phase: "Rollout & Kontinuität",
    title: "Betrieb",
    headline: "Damit die Lösung nicht nur startet, sondern dauerhaft wirkt.",
    intro:
      "Vom ersten Standort bis zum internationalen Rollout sichern wir Installation, Content-Abläufe und technischen Betrieb mit klaren Verantwortlichkeiten ab.",
    services: [
      "Rollout-Planung, Installation und Inbetriebnahme",
      "Monitoring, Wartung und definierte Service Levels",
      "Support, Schulung und Betriebsdokumentation",
      "Content Operations und kontinuierliche Optimierung",
    ],
    result:
      "Planbare Verfügbarkeit, schnelle Reaktion im Störungsfall und ein Betrieb, der mit neuen Standorten und Anforderungen mitwächst.",
    output: "Typische Ergebnisse: Rollout-Plan · Betriebshandbuch · Monitoring- und Supportmodell",
    image: "/images/project/detail-operations.webp",
    imageAlt: "Servicetechniker bei der Wartung vernetzter Displays",
  },
};

const isProjectStepKey = (value: string | undefined): value is ProjectStepKey => (
  value === "strategy"
  || value === "media"
  || value === "system"
  || value === "operations"
);

export function mountProjectSteps(): ProjectSteps {
  const dialog = document.querySelector<HTMLDialogElement>(
    "[data-project-detail-dialog]",
  );
  const triggers = Array.from(document.querySelectorAll<HTMLElement>("[data-project-step]"));
  if (!dialog || triggers.length === 0) return { destroy: () => {} };

  const closeButton = dialog.querySelector<HTMLButtonElement>(
    "[data-project-detail-close]",
  );
  const cta = dialog.querySelector<HTMLButtonElement>(
    "[data-project-detail-cta]",
  );
  const services = dialog.querySelector<HTMLUListElement>(
    "[data-project-detail-services]",
  );
  const detailImage = dialog.querySelector<HTMLImageElement>(
    "[data-project-detail-image]",
  );
  const imagePreloads = Object.values(PROJECT_STEP_DETAILS).map(({ image }) => {
    const preload = new Image();
    preload.src = image;
    return preload;
  });
  const fields = {
    number: dialog.querySelector<HTMLElement>("[data-project-detail-number]"),
    phase: dialog.querySelector<HTMLElement>("[data-project-detail-phase]"),
    title: dialog.querySelector<HTMLElement>("[data-project-detail-title]"),
    headline: dialog.querySelector<HTMLElement>("[data-project-detail-headline]"),
    intro: dialog.querySelector<HTMLElement>("[data-project-detail-intro]"),
    result: dialog.querySelector<HTMLElement>("[data-project-detail-result]"),
    output: dialog.querySelector<HTMLElement>("[data-project-detail-output]"),
    index: dialog.querySelector<HTMLElement>("[data-project-detail-index]"),
  };
  let activeTrigger: HTMLElement | null = null;

  const close = (restoreFocus = true): void => {
    if (dialog.open) dialog.close();
    document.body.classList.remove("is-project-detail-open");
    if (restoreFocus) activeTrigger?.focus();
  };
  const open = (trigger: HTMLElement): void => {
    const key = trigger.dataset.projectStep;
    if (!isProjectStepKey(key)) return;
    const detail = PROJECT_STEP_DETAILS[key];
    activeTrigger = trigger;
    fields.number!.textContent = detail.number;
    fields.phase!.textContent = detail.phase;
    fields.title!.textContent = detail.title;
    fields.headline!.textContent = detail.headline;
    fields.intro!.textContent = detail.intro;
    fields.result!.textContent = detail.result;
    fields.output!.textContent = detail.output;
    fields.index!.textContent = `Disziplin ${detail.number} von 04`;
    if (detailImage) {
      detailImage.src = detail.image;
      detailImage.alt = detail.imageAlt;
    }
    services!.replaceChildren(...detail.services.map((service) => {
      const item = document.createElement("li");
      item.textContent = service;
      return item;
    }));
    dialog.dataset.projectDetailActive = key;
    document.body.classList.add("is-project-detail-open");
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
    document.body.classList.remove("is-project-detail-open");
  };
  const ctaHandler = (): void => {
    close(false);
    document.querySelector<HTMLButtonElement>("[data-sales-assistant-open]")
      ?.click();
  };
  closeButton?.addEventListener("click", closeHandler);
  dialog.addEventListener("click", backdropHandler);
  dialog.addEventListener("close", nativeCloseHandler);
  cta?.addEventListener("click", ctaHandler);

  return {
    destroy: () => {
      triggerHandlers.forEach(({ trigger, handler }) => {
        trigger.removeEventListener("click", handler);
      });
      closeButton?.removeEventListener("click", closeHandler);
      dialog.removeEventListener("click", backdropHandler);
      dialog.removeEventListener("close", nativeCloseHandler);
      cta?.removeEventListener("click", ctaHandler);
      imagePreloads.forEach((image) => image.removeAttribute("src"));
      close(false);
    },
  };
}

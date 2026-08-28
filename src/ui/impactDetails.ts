export interface ImpactDetails {
  destroy: () => void;
}

type ImpactDetailKey = "attention" | "decision" | "network" | "space";

interface ImpactDetail {
  number: string;
  category: string;
  title: string;
  headline: string;
  intro: string;
  services: string[];
  result: string;
  output: string;
}

const IMPACT_DETAILS: Record<ImpactDetailKey, ImpactDetail> = {
  attention: {
    number: "01",
    category: "Präsenz & Inszenierung",
    title: "Aufmerksamkeit gewinnen",
    headline: "Digitale Inhalte werden zum sichtbaren Teil des Raums.",
    intro: "Wir verbinden Bewegtbild, Dimension und räumliche Dramaturgie so, dass Marken auch in bewegten Umgebungen sofort wahrgenommen werden.",
    services: [
      "Sichtachsen und relevante Kontaktmomente analysieren",
      "Motion Content für Distanz und kurze Verweildauer entwickeln",
      "Display- und LED-Flächen architektonisch inszenieren",
      "Wirkung mit klaren visuellen Hierarchien verstärken",
    ],
    result: "Mehr Sichtbarkeit und ein prägnanter erster Eindruck, ohne den Raum mit zusätzlicher Kommunikation zu überladen.",
    output: "Geeignet für Empfang, Retail, Showroom und öffentliche Räume",
  },
  decision: {
    number: "02",
    category: "Orientierung & Relevanz",
    title: "Entscheidungen erleichtern",
    headline: "Die richtige Information erscheint genau im richtigen Moment.",
    intro: "Inhalte reagieren auf Ort, Situation und Nutzerbedürfnis. So werden komplexe Angebote verständlich und nächste Schritte unmittelbar erkennbar.",
    services: [
      "Informationswege und Entscheidungspunkte strukturieren",
      "Wayfinding, Beratung und Serviceinhalte verbinden",
      "Kontextabhängige Inhalte und Daten integrieren",
      "Lesbarkeit und Bedienlogik für reale Nutzung testen",
    ],
    result: "Menschen orientieren sich schneller, verstehen Angebote besser und treffen Entscheidungen mit weniger Reibung.",
    output: "Geeignet für Mobilität, Retail, Hospitality und Corporate",
  },
  network: {
    number: "03",
    category: "Steuerung & Skalierung",
    title: "Inhalte zentral steuern",
    headline: "Ein System verbindet einzelne Displays und ganze Standortnetze.",
    intro: "Zentrale Planung, klare Freigaben und automatisierte Verteilung machen aktuelle Kommunikation über alle Flächen hinweg beherrschbar.",
    services: [
      "CMS-, Player- und Netzwerkarchitektur planen",
      "Rollen, Freigaben und redaktionelle Abläufe definieren",
      "Standorte, Formate und Zeitpläne zentral orchestrieren",
      "Monitoring und automatisierte Statusmeldungen einrichten",
    ],
    result: "Konsistente Inhalte, weniger manueller Aufwand und ein System, das mit neuen Displays und Standorten mitwächst.",
    output: "Geeignet für Filialnetze, Campus, Unternehmen und Destinationen",
  },
  space: {
    number: "04",
    category: "Atmosphäre & Erlebnis",
    title: "Räume emotionalisieren",
    headline: "Technologie wird Teil der Architektur und des Markenerlebnisses.",
    intro: "Licht, Bewegung und digitale Bildwelten verändern die Atmosphäre eines Ortes und schaffen Erlebnisse, die im Gedächtnis bleiben.",
    services: [
      "Medienflächen in Material, Licht und Architektur integrieren",
      "Immersive Bildwelten und räumliche Dramaturgien entwickeln",
      "Content, Technik und Raumakustik präzise abstimmen",
      "Szenarien für Tageszeit, Anlass und Publikum gestalten",
    ],
    result: "Ein unverwechselbarer Raum, der Markenwerte fühlbar macht und Besucher emotional bindet.",
    output: "Geeignet für Flagship Stores, Museen, Hotels und Erlebnisräume",
  },
};

const isImpactDetailKey = (value: string | undefined): value is ImpactDetailKey => (
  value === "attention" || value === "decision" || value === "network" || value === "space"
);

export function mountImpactDetails(): ImpactDetails {
  const dialog = document.querySelector<HTMLDialogElement>("[data-impact-detail-dialog]");
  const triggers = Array.from(
    document.querySelectorAll<HTMLElement>("[data-impact-detail]"),
  );
  if (!dialog || triggers.length === 0) return { destroy: () => {} };

  const closeButton = dialog.querySelector<HTMLButtonElement>("[data-impact-detail-close]");
  const cta = dialog.querySelector<HTMLButtonElement>("[data-impact-detail-cta]");
  const surface = dialog.querySelector<HTMLElement>(".project-detail__surface");
  const services = dialog.querySelector<HTMLUListElement>("[data-impact-detail-services]");
  const fields = {
    number: dialog.querySelector<HTMLElement>("[data-impact-detail-number]"),
    category: dialog.querySelector<HTMLElement>("[data-impact-detail-category]"),
    title: dialog.querySelector<HTMLElement>("[data-impact-detail-title]"),
    headline: dialog.querySelector<HTMLElement>("[data-impact-detail-headline]"),
    intro: dialog.querySelector<HTMLElement>("[data-impact-detail-intro]"),
    result: dialog.querySelector<HTMLElement>("[data-impact-detail-result]"),
    output: dialog.querySelector<HTMLElement>("[data-impact-detail-output]"),
    index: dialog.querySelector<HTMLElement>("[data-impact-detail-index]"),
  };
  let activeTrigger: HTMLElement | null = null;

  const close = (restoreFocus = true): void => {
    if (dialog.open) dialog.close();
    document.body.classList.remove("is-impact-detail-open");
    if (restoreFocus) activeTrigger?.focus();
  };
  const open = (trigger: HTMLElement): void => {
    const key = trigger.dataset.impactDetail;
    if (!isImpactDetailKey(key)) return;
    const detail = IMPACT_DETAILS[key];
    activeTrigger = trigger;
    fields.number!.textContent = detail.number;
    fields.category!.textContent = detail.category;
    fields.title!.textContent = detail.title;
    fields.headline!.textContent = detail.headline;
    fields.intro!.textContent = detail.intro;
    fields.result!.textContent = detail.result;
    fields.output!.textContent = detail.output;
    fields.index!.textContent = `Wirkungsfeld ${detail.number} von 04`;
    services!.replaceChildren(...detail.services.map((service) => {
      const item = document.createElement("li");
      item.textContent = service;
      return item;
    }));
    dialog.dataset.impactDetailActive = key;
    if (surface) surface.scrollTop = 0;
    document.body.classList.add("is-impact-detail-open");
    dialog.showModal();
  };

  const triggerHandlers = triggers.map((trigger) => {
    const clickHandler = (): void => open(trigger);
    const keyHandler = (event: KeyboardEvent): void => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      open(trigger);
    };
    trigger.addEventListener("click", clickHandler);
    trigger.addEventListener("keydown", keyHandler);
    return { trigger, clickHandler, keyHandler };
  });
  const closeHandler = (): void => close();
  const backdropHandler = (event: MouseEvent): void => {
    if (event.target === dialog) close();
  };
  const nativeCloseHandler = (): void => {
    document.body.classList.remove("is-impact-detail-open");
  };
  const ctaHandler = (): void => {
    close(false);
    document.querySelector<HTMLButtonElement>("[data-sales-assistant-open]")?.click();
  };
  closeButton?.addEventListener("click", closeHandler);
  dialog.addEventListener("click", backdropHandler);
  dialog.addEventListener("close", nativeCloseHandler);
  cta?.addEventListener("click", ctaHandler);

  return {
    destroy: () => {
      triggerHandlers.forEach(({ trigger, clickHandler, keyHandler }) => {
        trigger.removeEventListener("click", clickHandler);
        trigger.removeEventListener("keydown", keyHandler);
      });
      closeButton?.removeEventListener("click", closeHandler);
      dialog.removeEventListener("click", backdropHandler);
      dialog.removeEventListener("close", nativeCloseHandler);
      cta?.removeEventListener("click", ctaHandler);
      close(false);
    },
  };
}

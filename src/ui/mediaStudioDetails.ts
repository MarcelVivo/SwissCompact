export interface MediaStudioDetails {
  destroy: () => void;
}

type MediaDetailKey = "motion" | "film" | "three-d" | "campaigns" | "templates";

interface MediaDetail {
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

const MEDIA_DETAILS: Record<MediaDetailKey, MediaDetail> = {
  motion: {
    number: "01",
    category: "Bewegte Markenkommunikation",
    title: "Motion Design",
    headline: "Bewegung mit Idee, Rhythmus und klarer Wirkung.",
    intro:
      "Wir übersetzen Marken, Produkte und Informationen in präzise choreografierte Bildwelten, die auf grossen Flächen auch aus Distanz sofort verstanden werden.",
    services: [
      "Konzept, Storyboard und visuelle Dramaturgie",
      "2D-/3D-Animation, Typografie und Infografik",
      "Sound Design und rhythmische Inszenierung",
      "Formatadaptionen für Display, LED und Social Media",
    ],
    result:
      "Ein eigenständiger visueller Auftritt, der Aufmerksamkeit führt, Inhalte verdichtet und die Marke in Bewegung unverwechselbar macht.",
    output: "Mögliche Deliverables: Key Visuals · Animations-Master · Format- und Sprachversionen",
    image: "/images/media-studio/detail-motion.webp",
    imageAlt: "Motion Designer an zwei professionellen Arbeitsmonitoren",
  },
  film: {
    number: "02",
    category: "Konzeption & Produktion",
    title: "Film",
    headline: "Geschichten, die im Raum in wenigen Sekunden ankommen.",
    intro:
      "Von der ersten Idee bis zum finalen Master produzieren wir Filme für reale Nutzungssituationen – mit klarer Bildsprache, starker Regie und passender Länge.",
    services: [
      "Idee, Treatment, Drehbuch und Produktionsplanung",
      "Regie, Kamera, Licht und Produktion vor Ort",
      "Schnitt, Color Grading, Sound und Untertitel",
      "Versionierung für Formate, Standorte und Sprachen",
    ],
    result:
      "Filmischer Content, der ohne unnötige Erklärung funktioniert und Menschen auch in bewegten, lauten oder weitläufigen Räumen erreicht.",
    output: "Mögliche Deliverables: Imagefilm · Produktfilm · Interviews · modulare Kurzformate",
    image: "/images/media-studio/detail-film.webp",
    imageAlt: "Filmteam bei einer hochwertigen Produktproduktion",
  },
  "three-d": {
    number: "03",
    category: "Visualisierung & Animation",
    title: "3D",
    headline: "Produkte und Welten sichtbar machen, bevor sie real sind.",
    intro:
      "3D ermöglicht Perspektiven, Materialien und Abläufe, die mit klassischer Produktion kaum erreichbar sind – fotorealistisch, stilisiert oder interaktiv.",
    services: [
      "3D-Modelling, Materialien, Licht und Rendering",
      "Produkt-, Architektur- und Prozessvisualisierung",
      "Character-, Objekt- und Kameraanimation",
      "Compositing sowie Varianten aus einem 3D-Master",
    ],
    result:
      "Hochwertige Bildwelten mit maximaler gestalterischer Kontrolle, die flexibel weiterentwickelt und für viele Kanäle genutzt werden können.",
    output: "Mögliche Deliverables: Renderings · Produktanimation · räumliche Simulation · Echtzeit-Assets",
    image: "/images/media-studio/detail-three-d.webp",
    imageAlt: "3D Artist bei der fotorealistischen Produktvisualisierung",
  },
  campaigns: {
    number: "04",
    category: "Skalierung & Steuerung",
    title: "Campaign Systems",
    headline: "Aus einzelnen Sujets wird ein steuerbares Content-System.",
    intro:
      "Wir gestalten Kampagnen modular, damit Botschaften, Angebote und Formate zentral geführt und trotzdem standort- oder zielgruppenspezifisch ausgespielt werden können.",
    services: [
      "Kampagnenlogik und modulare Asset-Architektur",
      "Masterdesign, Varianten und Lokalisierung",
      "Scheduling, Datenanbindung und Ausspielregeln",
      "Qualitätssicherung, Auswertung und Optimierung",
    ],
    result:
      "Ein konsistenter Markenauftritt bei deutlich weniger Produktionsaufwand – skalierbar über Formate, Standorte, Sprachen und Zeiträume.",
    output: "Mögliche Deliverables: Campaign Toolkit · Variantenmatrix · Playlists · Governance",
    image: "/images/media-studio/detail-campaigns.webp",
    imageAlt: "Synchronisierte Kampagne auf verschiedenen Retail-Displays",
  },
  templates: {
    number: "05",
    category: "Effiziente Content-Produktion",
    title: "Templates",
    headline: "Schneller publizieren, ohne die Marke zu verwässern.",
    intro:
      "Intelligente Vorlagen geben Teams die nötige Freiheit für aktuelle Inhalte und schützen gleichzeitig Layout, Lesbarkeit und visuelle Identität.",
    services: [
      "Modulare Layouts für wiederkehrende Inhaltstypen",
      "Brand-sichere Typografie, Farben und Animationen",
      "Responsive Regeln für unterschiedliche Screens",
      "CMS-Integration, Dokumentation und Schulung",
    ],
    result:
      "Teams erstellen aktuelle, professionelle Inhalte selbstständig – schneller, konsistenter und ohne jedes Format neu produzieren zu müssen.",
    output: "Mögliche Deliverables: Template-Bibliothek · Designregeln · Redaktionsleitfaden · Training",
    image: "/images/media-studio/detail-templates.webp",
    imageAlt: "Content-Team vor einer modularen Template-Bibliothek",
  },
};

const isMediaDetailKey = (value: string | undefined): value is MediaDetailKey => (
  value === "motion"
  || value === "film"
  || value === "three-d"
  || value === "campaigns"
  || value === "templates"
);

export function mountMediaStudioDetails(): MediaStudioDetails {
  const dialog = document.querySelector<HTMLDialogElement>(
    "[data-media-detail-dialog]",
  );
  const triggers = Array.from(document.querySelectorAll<HTMLElement>("[data-media-studio-detail]"));
  if (!dialog || triggers.length === 0) return { destroy: () => {} };

  const closeButton = dialog.querySelector<HTMLButtonElement>(
    "[data-media-detail-close]",
  );
  const cta = dialog.querySelector<HTMLButtonElement>("[data-media-detail-cta]");
  const services = dialog.querySelector<HTMLUListElement>(
    "[data-media-detail-services]",
  );
  const detailImage = dialog.querySelector<HTMLImageElement>(
    "[data-media-detail-image]",
  );
  const imagePreloads = Object.values(MEDIA_DETAILS).map(({ image }) => {
    const preloader = new Image();
    preloader.src = image;
    return preloader;
  });
  const fields = {
    number: dialog.querySelector<HTMLElement>("[data-media-detail-number]"),
    category: dialog.querySelector<HTMLElement>("[data-media-detail-category]"),
    title: dialog.querySelector<HTMLElement>("[data-media-detail-title]"),
    headline: dialog.querySelector<HTMLElement>("[data-media-detail-headline]"),
    intro: dialog.querySelector<HTMLElement>("[data-media-detail-intro]"),
    result: dialog.querySelector<HTMLElement>("[data-media-detail-result]"),
    output: dialog.querySelector<HTMLElement>("[data-media-detail-output]"),
    index: dialog.querySelector<HTMLElement>("[data-media-detail-index]"),
  };
  let activeTrigger: HTMLElement | null = null;

  const close = (restoreFocus = true): void => {
    if (dialog.open) dialog.close();
    document.body.classList.remove("is-media-detail-open");
    if (restoreFocus) activeTrigger?.focus();
  };
  const open = (trigger: HTMLElement): void => {
    const key = trigger.dataset.mediaStudioDetail;
    if (!isMediaDetailKey(key)) return;
    const detail = MEDIA_DETAILS[key];
    activeTrigger = trigger;
    fields.number!.textContent = detail.number;
    fields.category!.textContent = detail.category;
    fields.title!.textContent = detail.title;
    fields.headline!.textContent = detail.headline;
    fields.intro!.textContent = detail.intro;
    fields.result!.textContent = detail.result;
    fields.output!.textContent = detail.output;
    fields.index!.textContent = `Media-Kompetenz ${detail.number} von 05`;
    if (detailImage) {
      detailImage.src = detail.image;
      detailImage.alt = detail.imageAlt;
    }
    services!.replaceChildren(...detail.services.map((service) => {
      const item = document.createElement("li");
      item.textContent = service;
      return item;
    }));
    dialog.dataset.mediaDetailActive = key;
    document.body.classList.add("is-media-detail-open");
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
    document.body.classList.remove("is-media-detail-open");
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
      imagePreloads.forEach((preloader) => preloader.removeAttribute("src"));
      close(false);
    },
  };
}

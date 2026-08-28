export interface SiteNavigation {
  destroy: () => void;
}

interface SolutionCopy {
  number: string;
  label: string;
  title: string;
  description: string;
  tags: string[];
}

const solutions: Record<string, SolutionCopy> = {
  verkaufen: {
    number: "01",
    label: "Retail Experience",
    title: "Vom Blickkontakt zur Kaufentscheidung.",
    description:
      "Digitale Verkaufsflächen verbinden Kampagnen, Produkte und Beratung zu einem durchgängigen Erlebnis am Point of Sale.",
    tags: ["Digital Signage", "Interactive", "Retail Media"],
  },
  informieren: {
    number: "02",
    label: "Connected Communication",
    title: "Die richtige Information. Genau im richtigen Moment.",
    description:
      "Zentral gesteuerte Inhalte erreichen Gäste, Mitarbeitende und Kundschaft aktuell, verständlich und standortgenau.",
    tags: ["Content Management", "Live Data", "Multi-Site"],
  },
  orientieren: {
    number: "03",
    label: "Wayfinding & Service",
    title: "Komplexe Räume werden intuitiv verständlich.",
    description:
      "Digitale Orientierung verbindet Wegführung, Serviceinformationen und barrierearme Interaktion in einem klaren System.",
    tags: ["Wayfinding", "Touch", "Accessibility"],
  },
  begeistern: {
    number: "04",
    label: "Immersive Experience",
    title: "Aus einem Besuch wird ein Erlebnis.",
    description:
      "LED, Bewegtbild und interaktive Medien verschmelzen mit der Architektur und machen Marken räumlich erlebbar.",
    tags: ["LED Walls", "Motion Design", "Interactive"],
  },
  monetarisieren: {
    number: "05",
    label: "Retail Media",
    title: "Reichweite am Standort wird zum neuen Medienkanal.",
    description:
      "Planbare Werbeflächen, flexible Kampagnen und relevante Daten schaffen ein skalierbares Angebot für Marken und Partner.",
    tags: ["Campaigns", "Scheduling", "Analytics"],
  },
};

function journeyMaximum(): number {
  const scroller = document.querySelector<HTMLElement>("#scroller");
  return Math.max(1, (scroller?.offsetHeight ?? 1) - window.innerHeight);
}

export function mountSiteNavigation(): SiteNavigation {
  const header = document.querySelector<HTMLElement>("[data-site-header]");
  const primaryNav = document.querySelector<HTMLElement>("#primary-nav");
  const menuToggle = document.querySelector<HTMLButtonElement>("[data-menu-toggle]");
  const transition = document.querySelector<HTMLElement>("[data-route-transition]");
  const marketingTargets = [
    ...document.querySelectorAll<HTMLElement>("[data-marketing-target]"),
  ];
  const experienceStarts = [
    ...document.querySelectorAll<HTMLElement>("[data-experience-start]"),
  ];
  const solutionTabs = [
    ...document.querySelectorAll<HTMLButtonElement>("[data-solution-goal]"),
  ];
  const solutionResult = document.querySelector<HTMLElement>("[data-solution-result]");
  const timers = new Set<number>();
  const cleanupListeners: Array<() => void> = [];
  let menuOpen = false;
  let destroyed = false;
  const mobileMenu = window.matchMedia("(max-width: 1100px)");

  const syncMenuAccessibility = () => {
    const hidden = mobileMenu.matches && !menuOpen;
    primaryNav?.toggleAttribute("inert", hidden);
    if (hidden) primaryNav?.setAttribute("aria-hidden", "true");
    else primaryNav?.removeAttribute("aria-hidden");
  };

  const setMenuOpen = (open: boolean, restoreFocus = false) => {
    menuOpen = open;
    document.body.classList.toggle("is-menu-open", open);
    menuToggle?.setAttribute("aria-expanded", String(open));
    menuToggle?.setAttribute("aria-label", open ? "Menü schliessen" : "Menü öffnen");
    syncMenuAccessibility();
    if (open) {
      window.requestAnimationFrame(() => primaryNav?.querySelector<HTMLElement>("a")?.focus());
    } else if (restoreFocus) {
      menuToggle?.focus();
    }
  };

  const updatePageState = () => {
    if (destroyed) return;
    const marketingVisible = window.scrollY >= journeyMaximum() - 2;
    document.body.classList.toggle("is-marketing-view", marketingVisible);
    header?.classList.toggle(
      "is-condensed",
      window.scrollY > 48 || marketingVisible,
    );
  };

  const schedule = (callback: () => void, delay: number) => {
    const timer = window.setTimeout(() => {
      timers.delete(timer);
      callback();
    }, delay);
    timers.add(timer);
  };

  const runRouteTransition = (callback: () => void) => {
    transition?.classList.add("is-active");
    schedule(() => {
      callback();
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          transition?.classList.remove("is-active");
          updatePageState();
        });
      });
    }, 280);
  };

  const handleMarketingTarget = (event: Event) => {
    event.preventDefault();
    const trigger = event.currentTarget as HTMLElement;
    const selector = trigger.dataset.marketingTarget;
    const target = selector ? document.querySelector<HTMLElement>(selector) : null;
    if (!target) return;
    setMenuOpen(false);

    const jump = () => target.scrollIntoView({ behavior: "auto", block: "start" });
    if (window.scrollY < journeyMaximum() - 2) runRouteTransition(jump);
    else target.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleExperienceStart = (event: Event) => {
    event.preventDefault();
    const trigger = event.currentTarget as HTMLElement;
    const journey = Number(trigger.dataset.experienceStart ?? "0.08");
    const stationCount = Math.max(
      1,
      document.querySelectorAll(".station").length,
    );
    const targetTop = Math.max(0, journey / stationCount * journeyMaximum());
    setMenuOpen(false);

    const jump = () => window.scrollTo({ top: targetTop, behavior: "auto" });
    if (window.scrollY >= journeyMaximum() - 2) runRouteTransition(jump);
    else window.scrollTo({ top: targetTop, behavior: "smooth" });
  };

  const handleMenuToggle = () => setMenuOpen(!menuOpen, menuOpen);
  const handleKeydown = (event: KeyboardEvent) => {
    if (event.key === "Escape" && menuOpen) setMenuOpen(false, true);
  };
  const handleMenuBreakpoint = () => {
    if (!mobileMenu.matches && menuOpen) setMenuOpen(false);
    else syncMenuAccessibility();
  };

  marketingTargets.forEach((target) => {
    target.addEventListener("click", handleMarketingTarget);
    cleanupListeners.push(() => target.removeEventListener("click", handleMarketingTarget));
  });
  experienceStarts.forEach((target) => {
    target.addEventListener("click", handleExperienceStart);
    cleanupListeners.push(() => target.removeEventListener("click", handleExperienceStart));
  });
  menuToggle?.addEventListener("click", handleMenuToggle);
  cleanupListeners.push(() => menuToggle?.removeEventListener("click", handleMenuToggle));
  window.addEventListener("scroll", updatePageState, { passive: true });
  window.addEventListener("resize", updatePageState, { passive: true });
  window.addEventListener("keydown", handleKeydown);
  mobileMenu.addEventListener("change", handleMenuBreakpoint);
  cleanupListeners.push(
    () => window.removeEventListener("scroll", updatePageState),
    () => window.removeEventListener("resize", updatePageState),
    () => window.removeEventListener("keydown", handleKeydown),
    () => mobileMenu.removeEventListener("change", handleMenuBreakpoint),
  );

  solutionTabs.forEach((tab) => {
    tab.tabIndex = tab.getAttribute("aria-selected") === "true" ? 0 : -1;
    const handleSolution = () => {
      const key = tab.dataset.solutionGoal ?? "";
      const solution = solutions[key];
      if (!solution || !solutionResult) return;

      solutionTabs.forEach((item) => {
        item.setAttribute("aria-selected", String(item === tab));
        item.tabIndex = item === tab ? 0 : -1;
      });
      solutionResult.dataset.activeSolution = key;
      const number = solutionResult.querySelector<HTMLElement>("[data-solution-number]");
      const label = solutionResult.querySelector<HTMLElement>("[data-solution-label]");
      const title = solutionResult.querySelector<HTMLElement>("[data-solution-title]");
      const description = solutionResult.querySelector<HTMLElement>(
        "[data-solution-description]",
      );
      const tags = solutionResult.querySelector<HTMLElement>("[data-solution-tags]");
      if (number) number.textContent = solution.number;
      if (label) label.textContent = solution.label;
      if (title) title.textContent = solution.title;
      if (description) description.textContent = solution.description;
      if (tags) {
        tags.replaceChildren(
          ...solution.tags.map((tag) => {
            const element = document.createElement("span");
            element.textContent = tag;
            return element;
          }),
        );
      }
      const copy = solutionResult.querySelector<HTMLElement>("[data-solution-copy]");
      copy?.animate(
        [
          {
            opacity: 0.18,
            filter: "blur(4px) contrast(1.7)",
            transform: "translateY(12px)",
          },
          {
            opacity: 0.72,
            filter: "blur(1.5px) contrast(1.3)",
            transform: "translateY(3px)",
            offset: 0.56,
          },
          {
            opacity: 1,
            filter: "none",
            transform: "translateY(0)",
          },
        ],
        {
          duration: 520,
          easing: "steps(6, end)",
        },
      );
      tab.parentElement?.scrollTo({
        left: Math.max(0, tab.offsetLeft - 16),
        behavior: "smooth",
      });
    };
    tab.addEventListener("click", handleSolution);
    cleanupListeners.push(() => tab.removeEventListener("click", handleSolution));
  });

  syncMenuAccessibility();
  updatePageState();

  return {
    destroy() {
      destroyed = true;
      timers.forEach((timer) => window.clearTimeout(timer));
      cleanupListeners.forEach((cleanup) => cleanup());
    },
  };
}

export interface ScrollReveal {
  destroy(): void;
}

const revealSelectors = [
  "#marketing-content .section-heading",
  "#marketing-content .solution-finder__intro",
  "#marketing-content .solution-result",
  "#marketing-content .impact-card",
  "#marketing-content .industry-card",
  "#marketing-content .project-steps article",
  "#marketing-content .media-studio__copy",
  "#marketing-content .media-tile",
  "#marketing-content .company-statement",
  "#marketing-content .company-copy",
  "#marketing-content .project-cta > div",
  "#marketing-content .project-cta__actions",
  ".site-footer > *",
].join(",");

const staggerGroups = [
  ".impact-grid",
  ".industry-row",
  ".project-steps",
  ".media-wall",
  ".site-footer",
];

const textRevealSelectors = [
  "#marketing-content .eyebrow",
  "#marketing-content h2",
  "#marketing-content h3",
  "#marketing-content p",
  "#marketing-content .impact-card > span",
  "#marketing-content .industry-card > span",
  "#marketing-content .project-steps span",
  "#marketing-content .project-steps strong",
  "#marketing-content .solution-tabs button",
  "#marketing-content .solution-result__number",
  "#marketing-content .solution-result__label",
  "#marketing-content .solution-result__tags span",
  "#marketing-content .media-tile span",
  "#marketing-content .company-copy li",
  "#marketing-content a",
  "#marketing-content button",
  ".site-footer > *",
].join(",");

function markFragments(element: HTMLElement): void {
  const fragments = Array.from(element.children).filter(
    (child): child is HTMLElement =>
      child instanceof HTMLElement
      && !child.matches(
        ".industry-card__screen, .industry-card__media, .impact-card__scene",
      ),
  );

  fragments.forEach((fragment, index) => {
    fragment.classList.add("reveal-fragment");
    fragment.style.setProperty("--fragment-delay", `${index * 72}ms`);
  });
}

export function mountScrollReveal(): ScrollReveal {
  const root = document.documentElement;
  const elements = Array.from(
    document.querySelectorAll<HTMLElement>(revealSelectors),
  );
  const textElements = Array.from(
    document.querySelectorAll<HTMLElement>(textRevealSelectors),
  );
  const reducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;

  root.classList.add("has-scroll-reveal");
  textElements.forEach((element) => {
    element.classList.add("pixel-reveal-text");
  });
  elements.forEach((element) => {
    element.dataset.reveal = "";
    markFragments(element);
  });

  staggerGroups.forEach((selector) => {
    const groups = document.querySelectorAll<HTMLElement>(selector);
    groups.forEach((group) => {
      Array.from(group.children).forEach((child, index) => {
        if (!(child instanceof HTMLElement) || !child.hasAttribute("data-reveal")) {
          return;
        }
        child.style.setProperty(
          "--reveal-delay",
          `${Math.min(index * 75, 260)}ms`,
        );
      });
    });
  });

  if (reducedMotion || !("IntersectionObserver" in window)) {
    elements.forEach((element) => element.classList.add("is-revealed"));
    textElements.forEach((element) => element.classList.add("is-text-sharp"));
    return {
      destroy() {
        root.classList.remove("has-scroll-reveal");
      },
    };
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const element = entry.target as HTMLElement;
        element.classList.add("is-revealed");
        observer.unobserve(element);
      });
    },
    {
      rootMargin: "0px 0px -9% 0px",
      threshold: 0.1,
    },
  );

  elements.forEach((element) => observer.observe(element));

  const activeText = new Set<HTMLElement>();
  const settledText = new WeakSet<HTMLElement>();
  const enteredAt = new WeakMap<HTMLElement, number>();
  let lastScrollAt = performance.now();
  let settleTimer = 0;

  const sharpenText = (element: HTMLElement) => {
    element.classList.remove("is-text-pixelated");
    element.classList.add("is-text-sharp");
    settledText.add(element);
    activeText.delete(element);
    textObserver.unobserve(element);
  };

  const settleActiveText = () => {
    settleTimer = 0;
    const now = performance.now();
    const scrollRemaining = Math.max(0, 170 - (now - lastScrollAt));
    let nextDelay = Number.POSITIVE_INFINITY;

    activeText.forEach((element) => {
      if (settledText.has(element)) return;
      const visibleFor = now - (enteredAt.get(element) ?? now);
      const dwellRemaining = Math.max(0, 320 - visibleFor);
      const delay = Math.max(scrollRemaining, dwellRemaining);
      if (delay <= 0) sharpenText(element);
      else nextDelay = Math.min(nextDelay, delay);
    });

    if (Number.isFinite(nextDelay) && activeText.size > 0) {
      settleTimer = window.setTimeout(
        settleActiveText,
        Math.max(16, nextDelay),
      );
    }
  };

  const scheduleTextSettle = () => {
    if (settleTimer) window.clearTimeout(settleTimer);
    settleTimer = window.setTimeout(settleActiveText, 170);
  };

  const textObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        const element = entry.target as HTMLElement;
        if (!entry.isIntersecting) {
          activeText.delete(element);
          return;
        }
        if (settledText.has(element)) return;

        activeText.add(element);
        enteredAt.set(element, performance.now());
        element.classList.remove("is-text-sharp");
        element.classList.add("is-text-pixelated");
        scheduleTextSettle();
      });
    },
    {
      rootMargin: "0px 0px -7% 0px",
      threshold: 0.08,
    },
  );

  const handleScroll = () => {
    lastScrollAt = performance.now();
    if (activeText.size > 0) scheduleTextSettle();
  };

  textElements.forEach((element) => textObserver.observe(element));
  window.addEventListener("scroll", handleScroll, { passive: true });

  return {
    destroy() {
      observer.disconnect();
      textObserver.disconnect();
      window.removeEventListener("scroll", handleScroll);
      if (settleTimer) window.clearTimeout(settleTimer);
      root.classList.remove("has-scroll-reveal");
    },
  };
}

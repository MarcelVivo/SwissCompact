export interface ScrollReveal {
  destroy(): void;
}

const revealSelectors = [
  "#marketing-content .section-heading",
  "#marketing-content .solution-finder__intro",
  "#marketing-content .solution-result",
  "#marketing-content .business-platform__intro",
  "#marketing-content .business-platform__card",
  "#marketing-content .business-platform__service",
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
  ".business-platform__grid",
  ".industry-row",
  ".project-steps",
  ".media-wall",
  ".site-footer",
];

function markFragments(element: HTMLElement): void {
  const fragments = Array.from(element.children).filter(
    (child): child is HTMLElement =>
      child instanceof HTMLElement
      && !child.matches(
        ".industry-card__screen, .industry-card__media, .impact-card__photo, .impact-card__scene",
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
  const reducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;

  root.classList.add("has-scroll-reveal");
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

  return {
    destroy() {
      observer.disconnect();
      root.classList.remove("has-scroll-reveal");
    },
  };
}

export interface CardLinksController {
  destroy: () => void;
}

// Makes cards that carry a single "Mehr erfahren"-style link fully
// clickable, not just that short line of text — while keeping the real
// <a> as the sole focusable/accessible element (no role="button" needed,
// no duplicate tab stop). A CSS-only stretched-link (::after covering the
// card) can't be used here: the site's pixel-reveal-text animation
// (see scrollReveal.ts) applies its own `transform` to every enhanced
// link, and a non-none transform makes that element its own containing
// block for absolutely-positioned children — trapping the stretched
// hitbox to the link's tiny box instead of the ancestor card.
export function mountCardLinks(cardSelector: string, linkSelector: string): CardLinksController {
  const cards = [...document.querySelectorAll<HTMLElement>(cardSelector)];
  const cleanupListeners: Array<() => void> = [];

  cards.forEach((card) => {
    const link = card.querySelector<HTMLAnchorElement>(linkSelector);
    if (!link) return;

    const navigate = (event: MouseEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest("a, button")) return;
      if (event.button === 1 || event.metaKey || event.ctrlKey || event.shiftKey) {
        window.open(link.href, "_blank", "noopener");
      } else {
        window.location.href = link.href;
      }
    };

    card.addEventListener("click", navigate);
    card.addEventListener("auxclick", navigate);
    cleanupListeners.push(() => {
      card.removeEventListener("click", navigate);
      card.removeEventListener("auxclick", navigate);
    });
  });

  return {
    destroy() {
      cleanupListeners.forEach((cleanup) => cleanup());
    },
  };
}

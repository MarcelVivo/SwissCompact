export interface CardLinksController {
  destroy: () => void;
}

// Makes cards that carry a single "Mehr erfahren"-style link fully
// clickable, not just that short line of text — while keeping the real
// <a> as the sole focusable/accessible element (no role="button" needed,
// no duplicate tab stop). A CSS-only stretched-link (::after covering the
// card) doesn't work here either: `.business-platform__card-link`'s own
// `display: inline-flex` makes it a containing block for absolutely-
// positioned children regardless of `position`, trapping the stretched
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

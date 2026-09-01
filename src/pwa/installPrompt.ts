interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

// iOS (every browser there, not just Safari — all are WebKit under the hood)
// never fires beforeinstallprompt and has no programmatic install trigger.
// The only path is the manual Share-sheet → "Zum Home-Bildschirm" flow, so
// the button has to explain that instead of waiting for an event that will
// never come.
function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) && !("MSStream" in window);
}

export function mountInstallPrompt(buttonSelector: string, onIosInstall?: () => void): void {
  const button = document.querySelector<HTMLButtonElement>(buttonSelector);
  if (!button) return;

  // Callers that gate the button behind an async load (the button doesn't
  // exist in the DOM until data has loaded) re-run this on every relevant
  // state change so it can find the button once it actually appears. Guard
  // against wiring up the same button twice once it does.
  if (button.dataset.installPromptMounted) return;
  button.dataset.installPromptMounted = "true";

  // The button must start hidden, but not via a `hidden` attribute written in
  // JSX — React reasserts JSX-declared attributes on every re-render of the
  // host component, silently flipping this back to hidden the moment
  // anything else in that component causes a re-render (which killed the
  // button before a user could ever tap it). Setting it here, once, outside
  // React's reconciliation, is the only way the later `button.hidden = false`
  // sticks.
  button.hidden = true;

  const isStandalone = window.matchMedia("(display-mode: standalone)").matches
    || (navigator as { standalone?: boolean }).standalone === true;
  if (isStandalone) return;

  // Desktop already has bookmarks/tabs — an installable "app" only earns its
  // keep on touch devices, where a home-screen icon is the point of a PWA.
  const isTouchDevice = window.matchMedia("(pointer: coarse)").matches;
  if (!isTouchDevice) return;

  if (isIos()) {
    button.hidden = false;
    button.addEventListener("click", () => {
      if (onIosInstall) onIosInstall();
      else alert("Tippen Sie unten auf „Teilen“ und dann auf „Zum Home-Bildschirm“.");
    });
    return;
  }

  let deferredEvent: BeforeInstallPromptEvent | null = null;

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredEvent = event as BeforeInstallPromptEvent;
    button.hidden = false;
  });

  button.addEventListener("click", () => {
    if (!deferredEvent) return;
    deferredEvent.prompt();
    deferredEvent.userChoice.finally(() => {
      deferredEvent = null;
      button.hidden = true;
    });
  });

  window.addEventListener("appinstalled", () => {
    button.hidden = true;
    deferredEvent = null;
  });
}

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function mountInstallPrompt(buttonSelector: string): void {
  const button = document.querySelector<HTMLButtonElement>(buttonSelector);
  if (!button) return;

  const isStandalone = window.matchMedia("(display-mode: standalone)").matches
    || (navigator as { standalone?: boolean }).standalone === true;
  if (isStandalone) return;

  // Desktop already has bookmarks/tabs — an installable "app" only earns its
  // keep on touch devices, where a home-screen icon is the point of a PWA.
  const isTouchDevice = window.matchMedia("(pointer: coarse)").matches;
  if (!isTouchDevice) return;

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

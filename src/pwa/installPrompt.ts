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

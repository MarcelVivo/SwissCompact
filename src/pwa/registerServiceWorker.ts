export interface RegisterServiceWorkerOptions {
  scope: string;
}

export function registerServiceWorker({ scope }: RegisterServiceWorkerOptions): void {
  if (!import.meta.env.PROD) return;
  if (!("serviceWorker" in navigator)) return;

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js", { scope }).catch(() => undefined);
  });
}

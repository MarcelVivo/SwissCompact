import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

export default defineConfig({
  // Fotoquellen in public/3DPictures bleiben für spätere Raumgestaltungen erhalten,
  // werden aber nicht in das aktuelle Hallen-Build kopiert.
  publicDir: "public/site",
  build: {
    // Grosse MP4-Dateien werden nach dem Vite-Build mit dem nativen
    // Dateisystemwerkzeug kopiert. macOS kann Node copyFileSync bei mehreren
    // grossen Dateien sonst sporadisch mit ETIMEDOUT abbrechen.
    copyPublicDir: false,
    chunkSizeWarningLimit: 650,
    rollupOptions: {
      input: {
        website: fileURLToPath(new URL("index.html", import.meta.url)),
        dashboard: fileURLToPath(new URL("dashboard.html", import.meta.url)),
      },
    },
  },
});

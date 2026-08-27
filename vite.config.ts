import { defineConfig } from "vite";

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
  },
});

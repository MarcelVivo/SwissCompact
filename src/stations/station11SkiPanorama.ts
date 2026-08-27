import type { StationDefinition } from "./types";

export const station11SkiPanorama: StationDefinition = {
  id: "ski-panorama",
  kicker: "Bergbahnen · Pisteninformation",
  title: "Orientierung auf<br>einen Blick.",
  description:
    "Robuste Outdoor-Screens zeigen Pistenstatus, Wetter, Liftbetrieb, Orientierung und Angebote genau dort, wo Entscheidungen fallen.",
  benefit: "Mehr Sicherheit. Bessere Besucherlenkung. Relevante Werbung vor Ort.",
  detailUrl: "/einsatzbereiche/skipisten-info-werbescreens/",
  format: "large",
  canvas: { width: 1024, height: 576 },
  draw(context, time, width, height) {
    context.fillStyle = "#07101a";
    context.fillRect(0, 0, width, height);
    const glow = 0.62 + Math.sin(time * 1.4) * 0.12;
    context.fillStyle = `rgba(200,16,46,${glow})`;
    context.fillRect(0, 0, width, 10);
    context.textAlign = "center";
    context.fillStyle = "#fff";
    context.font = "800 68px Helvetica, Arial, sans-serif";
    context.fillText("PISTENPLAN LIVE", width / 2, 195);
    context.fillStyle = "#C8102E";
    context.font = "700 31px Helvetica, Arial, sans-serif";
    context.fillText("SICHER. AKTUELL. RELEVANT.", width / 2, 270);
    context.fillStyle = "#a6abb2";
    context.font = "600 24px Helvetica, Arial, sans-serif";
    context.fillText("PISTEN  ·  WETTER  ·  LIFTE  ·  GASTRONOMIE  ·  ANGEBOTE", width / 2, 392);
  },
};

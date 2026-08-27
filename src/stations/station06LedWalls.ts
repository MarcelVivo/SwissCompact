import type { StationDefinition } from "./types";

export const station06LedWalls: StationDefinition = {
  id: "led-film",
  kicker: "Transparente LED-Folien",
  title: "Glas wird<br>zur Medienfläche.",
  description:
    "Halbtransparente LED-Folien verwandeln bestehende Scheiben direkt in grossformatige Präsentations- und Werbeflächen.",
  benefit: "Maximale Wirkung. Freie Sicht. Ohne massiven Displaykorpus.",
  detailUrl: "/einsatzbereiche/transparente-led-folien/",
  format: "landscape",
  canvas: { width: 1024, height: 576 },
  draw(context, time, width, height) {
    context.fillStyle = "#050506";
    context.fillRect(0, 0, width, height);
    context.fillStyle = "#fff";
    context.font = "700 30px Helvetica, Arial, sans-serif";
    context.textAlign = "center";
    context.fillText("JETZT BEDIENT", width / 2, 105);
    context.fillStyle = "#C8102E";
    context.font = "800 190px Helvetica, Arial, sans-serif";
    context.fillText("47", width / 2, 320 + Math.sin(time * 2) * 3);
    context.fillStyle = "#fff";
    context.font = "800 42px Helvetica, Arial, sans-serif";
    context.fillText("SCHALTER 3", width / 2, 410);
    context.fillStyle = "#777";
    context.font = "600 22px Helvetica, Arial, sans-serif";
    context.fillText("GEMEINDEVERSAMMLUNG  ·  ABFALLKALENDER  ·  BAUPUBLIKATIONEN", width / 2, 500);
  },
};

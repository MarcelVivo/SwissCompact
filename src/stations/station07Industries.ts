import type { StationDefinition } from "./types";

export const station07Industries: StationDefinition = {
  id: "cinema",
  kicker: "Kino & Entertainment",
  title: "Jede Fläche wird<br>zum Erlebnis.",
  description:
    "Grossformatige Screens inszenieren Trailer, Programm, Events und Markenbotschaften bereits im Foyer in beeindruckender Grösse.",
  benefit: "Mehr Aufmerksamkeit. Flexible Inhalte. Ein stärkeres Kinoerlebnis.",
  detailUrl: "/einsatzbereiche/kino-digital-signage/",
  format: "large",
  canvas: { width: 1024, height: 576 },
  draw(context, time, width, height) {
    context.fillStyle = "#08090c";
    context.fillRect(0, 0, width, height);
    const glow = 0.55 + Math.sin(time * 1.6) * 0.1;
    context.fillStyle = `rgba(200,16,46,${glow})`;
    context.fillRect(0, 0, width, 10);
    context.textAlign = "center";
    context.fillStyle = "#fff";
    context.font = "800 66px Helvetica, Arial, sans-serif";
    context.fillText("BEYOND THE LIMIT", width / 2, 205);
    context.fillStyle = "#C8102E";
    context.font = "800 34px Helvetica, Arial, sans-serif";
    context.fillText("JETZT IM KINO", width / 2, 275);
    context.fillStyle = "#8a8a92";
    context.font = "600 24px Helvetica, Arial, sans-serif";
    context.fillText("TRAILER  ·  PROGRAMM  ·  EVENTS  ·  WERBUNG", width / 2, 390);
  },
};

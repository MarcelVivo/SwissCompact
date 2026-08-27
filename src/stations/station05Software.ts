import type { StationDefinition } from "./types";

export const station05Software: StationDefinition = {
  id: "hotel",
  kicker: "Retail · Beratung",
  title: "Beratung wird<br>zum Erlebnis.",
  description:
    "Interaktive Displays zeigen Produkte, Varianten und persönliche Empfehlungen in Lebensgrösse direkt im Raum.",
  benefit: "Mehr Inspiration. Längere Verweildauer. Ein echtes Wow-Erlebnis.",
  detailUrl: "/einsatzbereiche/retail-digital-styling/",
  format: "landscape",
  canvas: { width: 1024, height: 576 },
  draw(context, time, width, height) {
    context.fillStyle = "#0d0d11";
    context.fillRect(0, 0, width, height);
    context.fillStyle = "#fff";
    context.textAlign = "center";
    context.font = "800 58px Helvetica, Arial, sans-serif";
    context.fillText("GRÜEZI, FAMILIE WEBER", width / 2, 120);
    context.fillStyle = "#C8102E";
    context.font = "700 32px Helvetica, Arial, sans-serif";
    context.fillText("IHR ZIMMER IST BEREIT", width / 2, 188);
    context.fillStyle = "#8a8a92";
    context.font = "600 25px Helvetica, Arial, sans-serif";
    const languages = ["WETTER MORGEN", "MÉTÉO DEMAIN", "METEO DOMANI"];
    context.fillText(languages[Math.floor(time * 0.5) % 3], width / 2, 285);
    context.fillText("SPA  ·  RESTAURANT  ·  INFOS AUS DER GEMEINDE", width / 2, 390);
  },
};

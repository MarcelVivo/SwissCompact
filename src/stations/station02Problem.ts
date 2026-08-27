import { rotatedPortrait, type StationDefinition } from "./types";

export const station02Problem: StationDefinition = {
  id: "retail",
  kicker: "Retail · Schuhgeschäft",
  title: "Vom Wanderschuh<br>zum Rucksack.",
  description:
    "Digitale Beratung führt direkt zum passenden Produkt und macht Sortiment, Varianten, Verfügbarkeit und Preise sofort erlebbar.",
  benefit: "Mehr Aufmerksamkeit. Bessere Beratung. Stärkere Kaufimpulse.",
  detailUrl: "/einsatzbereiche/retail-interaktive-beratung/",
  format: "portrait",
  canvas: { width: 576, height: 1024 },
  draw: rotatedPortrait((context, time, width, height) => {
    context.fillStyle = "#0b0b0d";
    context.fillRect(0, 0, width, height);
    context.fillStyle = "#C8102E";
    context.fillRect(0, 0, width, 12);
    context.fillStyle = "#fff";
    context.font = "800 68px Helvetica, Arial, sans-serif";
    context.textAlign = "center";
    context.fillText("ALPINE RUNNER", width / 2, 155);
    context.fillStyle = "#C8102E";
    context.font = "800 54px Helvetica, Arial, sans-serif";
    context.fillText("CHF 179.–", width / 2, 245);
    context.fillStyle = "#9a9aa0";
    context.font = "600 25px Helvetica, Arial, sans-serif";
    context.fillText("GRÖSSEN  39  40  41  42  43  44", width / 2, 340);
    context.fillStyle = Math.sin(time * 2) > 0 ? "#fff" : "#777";
    context.fillText("LAGERBESTAND LIVE · 12 PAAR", width / 2, 410);
  }),
};

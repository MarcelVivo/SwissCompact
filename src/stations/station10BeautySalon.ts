import type { StationDefinition } from "./types";

export const station10BeautySalon: StationDefinition = {
  id: "beauty-salon",
  kicker: "Beauty · Beratung & Inspiration",
  title: "Schönheit wird<br>sichtbar.",
  description:
    "Info- und Werbescreens präsentieren Behandlungen, Produkte, Pflegetipps und aktuelle Angebote direkt im Salon.",
  benefit: "Mehr Aufmerksamkeit. Bessere Beratung. Mehr Zusatzverkäufe.",
  detailUrl: "/einsatzbereiche/beauty-salon-info-werbescreens/",
  format: "large",
  canvas: { width: 1024, height: 576 },
  draw(context, time, width, height) {
    context.fillStyle = "#100b11";
    context.fillRect(0, 0, width, height);
    const glow = 0.6 + Math.sin(time * 1.5) * 0.12;
    context.fillStyle = `rgba(200,16,46,${glow})`;
    context.fillRect(0, 0, width, 10);
    context.textAlign = "center";
    context.fillStyle = "#fff";
    context.font = "800 66px Helvetica, Arial, sans-serif";
    context.fillText("BEAUTY. CARE. INSPIRATION.", width / 2, 205);
    context.fillStyle = "#C8102E";
    context.font = "700 31px Helvetica, Arial, sans-serif";
    context.fillText("ANGEBOTE IM RICHTIGEN MOMENT", width / 2, 278);
    context.fillStyle = "#9a9aa0";
    context.font = "600 24px Helvetica, Arial, sans-serif";
    context.fillText("BEHANDLUNGEN  ·  PRODUKTE  ·  TIPPS  ·  AKTIONEN", width / 2, 395);
  },
};

import type { StationDefinition } from "./types";

export const station09Hotel: StationDefinition = {
  id: "hotel",
  kicker: "Hotel · Welcome & Guest Experience",
  title: "Willkommen wird<br>zum Erlebnis.",
  description:
    "Welcome-Screens, Gästeinformationen und digitale Verkaufsflächen begleiten den Aufenthalt vom Check-in bis zum Spa.",
  benefit: "Bessere Orientierung. Persönlicher Service. Mehr Zusatzbuchungen.",
  detailUrl: "/einsatzbereiche/hotel-welcome-info-sales-screens/",
  format: "large",
  canvas: { width: 1024, height: 576 },
  draw(context, time, width, height) {
    context.fillStyle = "#0d0b09";
    context.fillRect(0, 0, width, height);
    const glow = 0.68 + Math.sin(time * 1.5) * 0.12;
    context.fillStyle = `rgba(200,16,46,${glow})`;
    context.fillRect(0, 0, width, 10);
    context.textAlign = "center";
    context.fillStyle = "#fff";
    context.font = "800 68px Helvetica, Arial, sans-serif";
    context.fillText("WELCOME", width / 2, 190);
    context.fillStyle = "#C8102E";
    context.font = "700 30px Helvetica, Arial, sans-serif";
    context.fillText("YOUR STAY. YOUR EXPERIENCE.", width / 2, 258);
    context.fillStyle = "#9a9aa0";
    context.font = "600 24px Helvetica, Arial, sans-serif";
    context.fillText("CHECK-IN  ·  HOTELINFOS  ·  SPA  ·  ANGEBOTE", width / 2, 385);
  },
};

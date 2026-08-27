import type { StationDefinition } from "./types";

export const station03Solution: StationDefinition = {
  id: "restaurant",
  kicker: "Gastronomie",
  title: "Ankommen. Auswählen.<br>Geniessen.",
  description:
    "Digitale Menüboards machen Menüs, Aktionen und Verfügbarkeiten sichtbar – zentral gesteuert und in Sekunden aktualisiert.",
  benefit: "Weniger Drucksachen. Kürzere Wartezeiten. Mehr Umsatz.",
  detailUrl: "/einsatzbereiche/gastronomie-digitale-menuboards/",
  format: "landscape",
  canvas: { width: 1024, height: 576 },
  draw(context, time, width, height) {
    context.fillStyle = "#101014";
    context.fillRect(0, 0, width, height);
    context.fillStyle = "#C8102E";
    context.fillRect(0, 0, width, 84);
    context.fillStyle = "#fff";
    context.font = "800 40px Helvetica, Arial, sans-serif";
    context.textAlign = "center";
    context.fillText("MENU DES TAGES", width / 2, 58);
    const items = [["Züri Geschnetzeltes", "24.50"], ["Rösti Deluxe", "18.90"], ["Tagessuppe", "8.50"], ["Kaffee & Kuchen", "9.50"]];
    const active = Math.floor(time * 0.7) % items.length;
    items.forEach((item, index) => {
      const y = 160 + index * 92;
      if (index === active) {
        context.fillStyle = "rgba(200,16,46,.22)";
        context.fillRect(50, y - 44, width - 100, 66);
      }
      context.fillStyle = index === active ? "#fff" : "#aaa";
      context.font = "600 27px Helvetica, Arial, sans-serif";
      context.textAlign = "left";
      context.fillText(item[0], 72, y);
      context.textAlign = "right";
      context.fillStyle = index === active ? "#C8102E" : "#777";
      context.fillText(item[1], width - 72, y);
    });
  },
};

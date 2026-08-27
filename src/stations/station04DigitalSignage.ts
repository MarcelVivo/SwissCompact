import type { StationDefinition } from "./types";

export const station04DigitalSignage: StationDefinition = {
  id: "office",
  kicker: "Büro · Konferenz",
  title: "Menschen verbinden.<br>Überall.",
  description:
    "Videokonferenzen, Präsentationen und Rauminformationen verbinden Teams ohne Medienbruch – im Raum und über Standorte hinweg.",
  benefit: "Klarere Meetings. Weniger Technikaufwand. Mehr Nähe.",
  detailUrl: "/einsatzbereiche/buero-videokonferenz/",
  format: "landscape",
  canvas: { width: 1024, height: 576 },
  draw(context, time, width, height) {
    context.fillStyle = "#0c0c10";
    context.fillRect(0, 0, width, height);
    const labels = ["REMOTE 01", "REMOTE 02", "REMOTE 03", "HOTEL LOBBY"];
    labels.forEach((label, index) => {
      const x = 50 + (index % 2) * 470;
      const y = 50 + Math.floor(index / 2) * 235;
      context.fillStyle = index === 3 ? "#320914" : "#19191e";
      context.fillRect(x, y, 420, 195);
      context.fillStyle = index === 3 ? "#C8102E" : "#aaa";
      context.font = "700 22px Helvetica, Arial, sans-serif";
      context.textAlign = "left";
      context.fillText(label, x + 25, y + 42);
      context.fillStyle = "#444";
      context.beginPath();
      context.arc(x + 210, y + 105 + Math.sin(time + index) * 3, 35, 0, Math.PI * 2);
      context.fill();
    });
  },
};

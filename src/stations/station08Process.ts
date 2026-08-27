import type { StationDefinition } from "./types";

export const station08Process: StationDefinition = {
  id: "museum",
  kicker: "Museum · Interaktive Information",
  title: "Geschichte wird<br>zum Erlebnis.",
  description:
    "Interaktive Screens vertiefen Exponate mit Bildern, Filmen, Sprachen und individuell abrufbaren Informationen.",
  benefit: "Mehr Kontext. Barrierefreier Zugang. Nachhaltig aktualisierbare Inhalte.",
  detailUrl: "/einsatzbereiche/museum-interaktive-infoscreens/",
  format: "large",
  canvas: { width: 1024, height: 576 },
  draw(context, time, width, height) {
    context.fillStyle = "#07100c";
    context.fillRect(0, 0, width, height);
    const pulse = 0.72 + Math.sin(time * 1.4) * 0.1;
    context.fillStyle = "#fff";
    context.font = "800 34px Helvetica, Arial, sans-serif";
    context.textAlign = "center";
    context.fillText("PFLANZEN DER URZEIT", width / 2, 92);
    context.fillStyle = `rgba(200,16,46,${pulse})`;
    context.fillRect(84, 132, width - 168, 4);
    context.fillStyle = "#fff";
    context.font = "800 66px Helvetica, Arial, sans-serif";
    context.fillText("ENTDECKEN. BERÜHREN. VERSTEHEN.", width / 2, 265);
    context.fillStyle = "#8a8a92";
    context.font = "600 24px Helvetica, Arial, sans-serif";
    context.fillText("EXPONATE  ·  HINTERGRÜNDE  ·  SPRACHEN  ·  MEDIEN", width / 2, 390);
  },
};

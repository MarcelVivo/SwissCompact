import type { StationDefinition } from "./types";

export const station01Intro: StationDefinition = {
  id: "intro",
  kicker: "SwissCompact · Digital Experience Partner",
  title: "Die Schweiz.<br>Digital verbunden.",
  description:
    "Displays, Content und Technologie für Räume, die Menschen bewegen.",
  format: "large",
  canvas: { width: 1024, height: 576 },
  draw(context, time, width, height) {
    context.fillStyle = "#000";
    context.fillRect(0, 0, width, height);

    if (time < 0.9) {
      if (Math.random() > 0.8) {
        context.fillStyle = "rgba(200,16,46,.12)";
        context.fillRect(0, Math.random() * height, width, 20);
      }
      return;
    }

    const power = Math.min(1, (time - 0.9) / 1.4);
    context.fillStyle = `rgba(200,16,46,${0.05 * power})`;
    for (let y = 0; y < height; y += 6) context.fillRect(0, y, width, 2);

    context.globalAlpha = power;
    context.textAlign = "center";
    context.fillStyle = "#9a9aa0";
    context.font = "600 30px Helvetica, Arial, sans-serif";
    context.fillText("D I G I T A L E   L Ö S U N G E N", width / 2, height / 2 - 80);

    context.font = "800 110px Helvetica, Arial, sans-serif";
    context.textAlign = "left";
    const swissWidth = context.measureText("Swiss").width;
    const compactWidth = context.measureText("Compact").width;
    const startX = width / 2 - (swissWidth + compactWidth) / 2;
    context.fillStyle = "#fff";
    context.fillText("Swiss", startX, height / 2 + 40);
    context.fillStyle = "#C8102E";
    context.fillText("Compact", startX + swissWidth, height / 2 + 40);

    const size = 30;
    const x = width / 2;
    const y = height / 2 + 130;
    context.fillRect(x - size / 6, y - size / 2, size / 3, size);
    context.fillRect(x - size / 2, y - size / 6, size, size / 3);
    context.globalAlpha = 1;
  },
};

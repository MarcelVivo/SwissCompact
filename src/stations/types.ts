export type DisplayFormat = "landscape" | "portrait" | "large";

export type StationDraw = (
  context: CanvasRenderingContext2D,
  time: number,
  width: number,
  height: number,
) => void;

export interface StationDefinition {
  id: string;
  kicker: string;
  title: string;
  description?: string;
  benefit?: string;
  detailUrl?: string;
  format: DisplayFormat;
  canvas?: { width: number; height: number };
  draw?: StationDraw;
}

export function rotatedPortrait(drawLandscape: StationDraw): StationDraw {
  return (context, time, width, height) => {
    context.save();
    context.translate(0, height);
    context.rotate(-Math.PI / 2);
    drawLandscape(context, time, height, width);
    context.restore();
  };
}

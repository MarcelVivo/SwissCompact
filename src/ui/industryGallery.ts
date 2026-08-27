export interface IndustryGallery {
  destroy(): void;
}

type IndustryScene = "retail" | "hospitality" | "corporate" | "experience";
type VariantIndex = 0 | 1;

interface Point {
  x: number;
  y: number;
}

interface Bounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

type Quad = [Point, Point, Point, Point];

interface SurfaceBuffer {
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
}

interface ImageState {
  element: HTMLImageElement;
  label: string;
  pixelCanvas: HTMLCanvasElement;
  pixelContext: CanvasRenderingContext2D;
  ready: boolean;
}

interface IndustryState {
  card: HTMLElement;
  images: [ImageState, ImageState];
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
  label: HTMLElement;
  toggle: HTMLButtonElement;
  scene: IndustryScene;
  width: number;
  height: number;
  ratio: number;
  visible: boolean;
  centered: boolean;
  revealed: boolean;
  revealStarted: number;
  interaction: number;
  targetInteraction: number;
  currentIndex: VariantIndex;
  desiredIndex: VariantIndex;
  morphFrom: VariantIndex;
  morphTo: VariantIndex;
  morphStarted: number;
  morphing: boolean;
  pointerX: number;
  pointerY: number;
  autoTimer: number;
  touchTimer: number;
  surfaces: Map<string, SurfaceBuffer>;
}

const RED = "#e30b35";
const WHITE = "#f7f7f4";
const FONT = '"Arial", "Helvetica Neue", sans-serif';
const morphDuration = 880;

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function mix(from: number, to: number, amount: number): number {
  return from + (to - from) * amount;
}

function smoothstep(value: number): number {
  const clamped = clamp01(value);
  return clamped * clamped * (3 - 2 * clamped);
}

function seededNoise(column: number, row: number): number {
  const value = Math.sin(column * 91.73 + row * 47.21) * 43758.5453;
  return value - Math.floor(value);
}

function drawCover(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  width: number,
  height: number,
): void {
  const imageRatio = image.naturalWidth / image.naturalHeight;
  const targetRatio = width / height;
  let sourceX = 0;
  let sourceY = 0;
  let sourceWidth = image.naturalWidth;
  let sourceHeight = image.naturalHeight;
  if (imageRatio > targetRatio) {
    sourceWidth = image.naturalHeight * targetRatio;
    sourceX = (image.naturalWidth - sourceWidth) / 2;
  } else {
    sourceHeight = image.naturalWidth / targetRatio;
    sourceY = (image.naturalHeight - sourceHeight) / 2;
  }
  context.drawImage(
    image,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    0,
    0,
    width,
    height,
  );
}

function coverPoint(
  state: IndustryState,
  image: HTMLImageElement,
  point: Point,
): Point {
  const scale = Math.max(
    state.width / image.naturalWidth,
    state.height / image.naturalHeight,
  );
  const renderedWidth = image.naturalWidth * scale;
  const renderedHeight = image.naturalHeight * scale;
  return {
    x: (state.width - renderedWidth) / 2 + point.x * renderedWidth,
    y: (state.height - renderedHeight) / 2 + point.y * renderedHeight,
  };
}

function screenPath(
  state: IndustryState,
  image: HTMLImageElement,
  points: Quad,
): { path: Path2D; bounds: Bounds; points: Quad } {
  const mapped = points.map(
    (point) => coverPoint(state, image, point),
  ) as Quad;
  const path = new Path2D();
  mapped.forEach((point, index) => {
    if (index === 0) path.moveTo(point.x, point.y);
    else path.lineTo(point.x, point.y);
  });
  path.closePath();
  const xs = mapped.map(({ x }) => x);
  const ys = mapped.map(({ y }) => y);
  const left = Math.min(...xs);
  const right = Math.max(...xs);
  const top = Math.min(...ys);
  const bottom = Math.max(...ys);
  return {
    path,
    points: mapped,
    bounds: {
      left,
      top,
      right,
      bottom,
      width: right - left,
      height: bottom - top,
    },
  };
}

function pointOnQuad(quad: Quad, u: number, v: number): Point {
  const topX = mix(quad[0].x, quad[1].x, u);
  const topY = mix(quad[0].y, quad[1].y, u);
  const bottomX = mix(quad[3].x, quad[2].x, u);
  const bottomY = mix(quad[3].y, quad[2].y, u);
  return {
    x: mix(topX, bottomX, v),
    y: mix(topY, bottomY, v),
  };
}

function drawWarpTriangle(
  context: CanvasRenderingContext2D,
  source: HTMLCanvasElement,
  sourcePoints: [Point, Point, Point],
  destinationPoints: [Point, Point, Point],
): void {
  const [sourceA, sourceB, sourceC] = sourcePoints;
  const [destinationA, destinationB, destinationC] = destinationPoints;
  const denominator =
    sourceA.x * (sourceB.y - sourceC.y)
    + sourceB.x * (sourceC.y - sourceA.y)
    + sourceC.x * (sourceA.y - sourceB.y);
  if (Math.abs(denominator) < 0.0001) return;
  const a = (
    destinationA.x * (sourceB.y - sourceC.y)
    + destinationB.x * (sourceC.y - sourceA.y)
    + destinationC.x * (sourceA.y - sourceB.y)
  ) / denominator;
  const c = (
    destinationA.x * (sourceC.x - sourceB.x)
    + destinationB.x * (sourceA.x - sourceC.x)
    + destinationC.x * (sourceB.x - sourceA.x)
  ) / denominator;
  const e = (
    destinationA.x * (sourceB.x * sourceC.y - sourceC.x * sourceB.y)
    + destinationB.x * (sourceC.x * sourceA.y - sourceA.x * sourceC.y)
    + destinationC.x * (sourceA.x * sourceB.y - sourceB.x * sourceA.y)
  ) / denominator;
  const b = (
    destinationA.y * (sourceB.y - sourceC.y)
    + destinationB.y * (sourceC.y - sourceA.y)
    + destinationC.y * (sourceA.y - sourceB.y)
  ) / denominator;
  const d = (
    destinationA.y * (sourceC.x - sourceB.x)
    + destinationB.y * (sourceA.x - sourceC.x)
    + destinationC.y * (sourceB.x - sourceA.x)
  ) / denominator;
  const f = (
    destinationA.y * (sourceB.x * sourceC.y - sourceC.x * sourceB.y)
    + destinationB.y * (sourceC.x * sourceA.y - sourceA.x * sourceC.y)
    + destinationC.y * (sourceA.x * sourceB.y - sourceB.x * sourceA.y)
  ) / denominator;

  context.save();
  context.beginPath();
  context.moveTo(destinationA.x, destinationA.y);
  context.lineTo(destinationB.x, destinationB.y);
  context.lineTo(destinationC.x, destinationC.y);
  context.closePath();
  context.clip();
  context.transform(a, b, c, d, e, f);
  context.drawImage(source, 0, 0);
  context.restore();
}

function warpCanvasToQuad(
  context: CanvasRenderingContext2D,
  source: HTMLCanvasElement,
  quad: Quad,
): void {
  const columns = 4;
  const rows = 4;
  for (let row = 0; row < rows; row += 1) {
    const v0 = row / rows;
    const v1 = (row + 1) / rows;
    const sourceY0 = v0 * source.height;
    const sourceY1 = v1 * source.height;
    for (let column = 0; column < columns; column += 1) {
      const u0 = column / columns;
      const u1 = (column + 1) / columns;
      const sourceX0 = u0 * source.width;
      const sourceX1 = u1 * source.width;
      const destination00 = pointOnQuad(quad, u0, v0);
      const destination10 = pointOnQuad(quad, u1, v0);
      const destination11 = pointOnQuad(quad, u1, v1);
      const destination01 = pointOnQuad(quad, u0, v1);
      drawWarpTriangle(
        context,
        source,
        [
          { x: sourceX0, y: sourceY0 },
          { x: sourceX1, y: sourceY0 },
          { x: sourceX1, y: sourceY1 },
        ],
        [destination00, destination10, destination11],
      );
      drawWarpTriangle(
        context,
        source,
        [
          { x: sourceX0, y: sourceY0 },
          { x: sourceX1, y: sourceY1 },
          { x: sourceX0, y: sourceY1 },
        ],
        [destination00, destination11, destination01],
      );
    }
  }
}

function fitText(
  context: CanvasRenderingContext2D,
  text: string,
  maximumWidth: number,
  size: number,
  weight = 800,
): number {
  let fontSize = size;
  do {
    context.font = `${weight} ${fontSize}px ${FONT}`;
    if (context.measureText(text).width <= maximumWidth) return fontSize;
    fontSize -= 0.5;
  } while (fontSize > 7);
  return fontSize;
}

function withScreen(
  state: IndustryState,
  image: HTMLImageElement,
  key: string,
  polygon: Quad,
  draw: (context: CanvasRenderingContext2D, bounds: Bounds) => void,
): void {
  const { bounds: mappedBounds, points } = screenPath(state, image, polygon);
  if (
    mappedBounds.right <= 0
    || mappedBounds.left >= state.width
    || mappedBounds.bottom <= 0
    || mappedBounds.top >= state.height
  ) {
    return;
  }
  const topWidth = Math.hypot(
    points[1].x - points[0].x,
    points[1].y - points[0].y,
  );
  const bottomWidth = Math.hypot(
    points[2].x - points[3].x,
    points[2].y - points[3].y,
  );
  const leftHeight = Math.hypot(
    points[3].x - points[0].x,
    points[3].y - points[0].y,
  );
  const rightHeight = Math.hypot(
    points[2].x - points[1].x,
    points[2].y - points[1].y,
  );
  const aspect = Math.max(
    0.25,
    (topWidth + bottomWidth) / Math.max(1, leftHeight + rightHeight),
  );
  const targetWidth = aspect >= 1
    ? Math.min(720, Math.max(320, Math.round(440 * aspect)))
    : Math.min(480, Math.max(180, Math.round(560 * aspect)));
  const targetHeight = aspect >= 1
    ? Math.max(220, Math.round(targetWidth / aspect))
    : 560;
  let surface = state.surfaces.get(key);
  if (!surface) {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { alpha: true });
    if (!context) return;
    surface = { canvas, context };
    state.surfaces.set(key, surface);
  }
  if (
    surface.canvas.width !== targetWidth
    || surface.canvas.height !== targetHeight
  ) {
    surface.canvas.width = targetWidth;
    surface.canvas.height = targetHeight;
  }
  surface.context.clearRect(0, 0, targetWidth, targetHeight);
  draw(surface.context, {
    left: 0,
    top: 0,
    right: targetWidth,
    bottom: targetHeight,
    width: targetWidth,
    height: targetHeight,
  });
  warpCanvasToQuad(state.context, surface.canvas, points);
}

function drawRetail(
  state: IndustryState,
  image: HTMLImageElement,
  time: number,
  strength: number,
): void {
  withScreen(state, image, "retail", [
    { x: 0.589, y: 0.03 },
    { x: 0.738, y: 0.028 },
    { x: 0.739, y: 0.675 },
    { x: 0.587, y: 0.675 },
  ], (context, bounds) => {
    const padding = bounds.width * 0.09;
    const pulse = 0.78 + Math.sin(time * 1.2) * 0.12;
    context.fillStyle = `rgba(227, 11, 53, ${0.7 + strength * 0.25})`;
    context.fillRect(
      bounds.left + padding,
      bounds.top + padding,
      bounds.width * (0.18 + strength * 0.08),
      Math.max(2, bounds.width * 0.018),
    );
    context.fillStyle = "rgba(255,255,255,0.62)";
    fitText(context, "NEW SEASON", bounds.width - padding * 2, bounds.width * 0.07);
    context.fillText(
      "NEW SEASON",
      bounds.left + padding,
      bounds.top + bounds.height * 0.13,
    );

    const productX = bounds.left + bounds.width * 0.5;
    const productY = bounds.top + bounds.height * 0.43;
    const productWidth = bounds.width * 0.52;
    const productHeight = bounds.height * 0.24;
    const productGlow = context.createRadialGradient(
      productX,
      productY,
      0,
      productX,
      productY,
      productWidth,
    );
    productGlow.addColorStop(
      0,
      `rgba(227, 11, 53, ${0.22 + strength * 0.12})`,
    );
    productGlow.addColorStop(1, "rgba(227, 11, 53, 0)");
    context.fillStyle = productGlow;
    context.fillRect(
      productX - productWidth,
      productY - productHeight,
      productWidth * 2,
      productHeight * 2,
    );
    context.save();
    context.translate(productX, productY);
    context.rotate(-0.1 + Math.sin(time * 0.42) * 0.025);
    context.fillStyle = `rgba(242, 242, 238, ${pulse})`;
    context.beginPath();
    context.roundRect(
      -productWidth * 0.47,
      -productHeight * 0.2,
      productWidth * 0.94,
      productHeight * 0.42,
      productHeight * 0.18,
    );
    context.fill();
    context.fillStyle = `rgba(227, 11, 53, ${0.72 + strength * 0.2})`;
    context.fillRect(
      -productWidth * 0.17,
      productHeight * 0.12,
      productWidth * 0.42,
      productHeight * 0.08,
    );
    context.restore();

    context.fillStyle = WHITE;
    fitText(context, "CHF 129.–", bounds.width - padding * 2, bounds.width * 0.105);
    context.fillText(
      "CHF 129.–",
      bounds.left + padding,
      bounds.top + bounds.height * 0.75,
    );
    context.fillStyle = "rgba(255,255,255,0.55)";
    fitText(
      context,
      "4 FARBEN · SOFORT VERFÜGBAR",
      bounds.width - padding * 2,
      bounds.width * 0.045,
      700,
    );
    context.fillText(
      "4 FARBEN · SOFORT VERFÜGBAR",
      bounds.left + padding,
      bounds.top + bounds.height * 0.84,
    );
    const scanY = bounds.top + ((time * 42) % bounds.height);
    context.fillStyle = `rgba(255, 49, 86, ${0.14 + strength * 0.12})`;
    context.fillRect(bounds.left, scanY, bounds.width, 2);
  });
}

function drawGastronomy(
  state: IndustryState,
  image: HTMLImageElement,
  time: number,
  strength: number,
): void {
  withScreen(state, image, "gastronomy", [
    { x: 0.527, y: 0.147 },
    { x: 0.697, y: 0.145 },
    { x: 0.699, y: 0.668 },
    { x: 0.527, y: 0.67 },
  ], (context, bounds) => {
    const padding = bounds.width * 0.09;
    context.fillStyle = `rgba(228, 173, 120, ${0.74 + strength * 0.2})`;
    context.fillRect(
      bounds.left + padding,
      bounds.top + padding,
      bounds.width * 0.24,
      Math.max(2, bounds.width * 0.016),
    );
    context.fillStyle = "rgba(255,255,255,0.58)";
    fitText(context, "MITTAGSMENÜ", bounds.width - padding * 2, bounds.width * 0.063);
    context.fillText(
      "MITTAGSMENÜ",
      bounds.left + padding,
      bounds.top + bounds.height * 0.13,
    );

    const centerX = bounds.left + bounds.width * 0.5;
    const centerY = bounds.top + bounds.height * 0.42;
    const radius = bounds.width * 0.26;
    context.strokeStyle = `rgba(255, 255, 255, ${0.46 + strength * 0.16})`;
    context.lineWidth = Math.max(1, bounds.width * 0.009);
    context.beginPath();
    context.arc(centerX, centerY, radius, 0, Math.PI * 2);
    context.stroke();
    context.strokeStyle = `rgba(228, 173, 120, ${0.64 + strength * 0.22})`;
    context.beginPath();
    context.arc(
      centerX,
      centerY,
      radius * (0.54 + Math.sin(time * 0.7) * 0.025),
      -0.35,
      Math.PI * 1.3,
    );
    context.stroke();
    for (let index = 0; index < 5; index += 1) {
      const angle = index / 5 * Math.PI * 2 + time * 0.08;
      context.fillStyle = index % 2 === 0 ? "#e4ad78" : "#f5f2ea";
      context.beginPath();
      context.arc(
        centerX + Math.cos(angle) * radius * 0.44,
        centerY + Math.sin(angle) * radius * 0.44,
        Math.max(1.5, bounds.width * 0.015),
        0,
        Math.PI * 2,
      );
      context.fill();
    }

    context.fillStyle = WHITE;
    fitText(context, "CHF 24.–", bounds.width - padding * 2, bounds.width * 0.11);
    context.fillText(
      "CHF 24.–",
      bounds.left + padding,
      bounds.top + bounds.height * 0.76,
    );
    context.fillStyle = "rgba(255,255,255,0.52)";
    fitText(
      context,
      "FRISCH · REGIONAL · BIS 14 UHR",
      bounds.width - padding * 2,
      bounds.width * 0.043,
      700,
    );
    context.fillText(
      "FRISCH · REGIONAL · BIS 14 UHR",
      bounds.left + padding,
      bounds.top + bounds.height * 0.85,
    );
  });
}

function drawHospitality(
  state: IndustryState,
  image: HTMLImageElement,
  time: number,
  strength: number,
): void {
  withScreen(state, image, "hospitality", [
    { x: 0.555, y: 0.058 },
    { x: 0.998, y: 0.028 },
    { x: 0.998, y: 0.452 },
    { x: 0.555, y: 0.452 },
  ], (context, bounds) => {
    const left = bounds.left + bounds.width * 0.07;
    const available = bounds.width * 0.34;
    const top = bounds.top + bounds.height * 0.16;
    context.fillStyle = `rgba(228, 173, 120, ${0.7 + strength * 0.24})`;
    context.fillRect(
      left,
      top,
      available * (0.22 + strength * 0.08),
      Math.max(2, bounds.height * 0.012),
    );
    context.fillStyle = "rgba(255,255,255,0.62)";
    fitText(context, "GUTEN ABEND", available, bounds.height * 0.08);
    context.fillText("GUTEN ABEND", left, top + bounds.height * 0.13);
    context.fillStyle = WHITE;
    fitText(context, "Willkommen.", available, bounds.height * 0.15);
    context.fillText("Willkommen.", left, top + bounds.height * 0.29);
    context.fillStyle = "rgba(255,255,255,0.58)";
    fitText(context, "CHECK-IN BEREIT", available, bounds.height * 0.06, 700);
    context.fillText("CHECK-IN BEREIT", left, top + bounds.height * 0.41);
    const routeWidth = available * 0.92;
    const routeY = top + bounds.height * 0.34;
    context.strokeStyle = `rgba(228, 173, 120, ${0.5 + strength * 0.3})`;
    context.lineWidth = Math.max(1, bounds.height * 0.008);
    context.setLineDash([3, 5]);
    context.beginPath();
    context.moveTo(left, routeY);
    context.lineTo(left + routeWidth * 0.45, routeY);
    context.lineTo(left + routeWidth * 0.58, routeY + bounds.height * 0.08);
    context.lineTo(left + routeWidth, routeY + bounds.height * 0.08);
    context.stroke();
    context.setLineDash([]);
    const markerX = left + ((time * 28) % Math.max(1, routeWidth));
    context.fillStyle = "#e4ad78";
    context.beginPath();
    context.arc(markerX, routeY, Math.max(2, bounds.height * 0.015), 0, Math.PI * 2);
    context.fill();
  });
}

function drawHealth(
  state: IndustryState,
  image: HTMLImageElement,
  time: number,
  strength: number,
): void {
  withScreen(state, image, "health", [
    { x: 0.647, y: 0.08 },
    { x: 0.858, y: 0.08 },
    { x: 0.858, y: 0.668 },
    { x: 0.647, y: 0.668 },
  ], (context, bounds) => {
    const padding = bounds.width * 0.09;
    context.fillStyle = `rgba(182, 212, 229, ${0.62 + strength * 0.2})`;
    context.fillRect(
      bounds.left + padding,
      bounds.top + padding,
      bounds.width * 0.2,
      Math.max(2, bounds.width * 0.014),
    );
    context.fillStyle = "rgba(255,255,255,0.55)";
    fitText(context, "IHR TERMIN", bounds.width - padding * 2, bounds.width * 0.06);
    context.fillText(
      "IHR TERMIN",
      bounds.left + padding,
      bounds.top + bounds.height * 0.13,
    );
    context.fillStyle = WHITE;
    fitText(context, "09:30", bounds.width - padding * 2, bounds.width * 0.18);
    context.fillText(
      "09:30",
      bounds.left + padding,
      bounds.top + bounds.height * 0.32,
    );
    context.fillStyle = "#b6d4e5";
    fitText(context, "RAUM 2.14", bounds.width - padding * 2, bounds.width * 0.08);
    context.fillText(
      "RAUM 2.14",
      bounds.left + padding,
      bounds.top + bounds.height * 0.43,
    );
    const startX = bounds.left + padding;
    const startY = bounds.top + bounds.height * 0.62;
    const endX = bounds.right - padding;
    const endY = bounds.top + bounds.height * 0.76;
    context.strokeStyle = "rgba(255,255,255,0.2)";
    context.lineWidth = Math.max(1, bounds.width * 0.008);
    context.beginPath();
    for (let line = 0; line < 4; line += 1) {
      const y = startY + line * bounds.height * 0.065;
      context.moveTo(startX, y);
      context.lineTo(endX, y + (line % 2 ? -5 : 5));
    }
    context.stroke();
    const routeProgress = (time * 0.18) % 1;
    context.strokeStyle = `rgba(227, 11, 53, ${0.7 + strength * 0.25})`;
    context.lineWidth = Math.max(2, bounds.width * 0.018);
    context.beginPath();
    context.moveTo(startX, startY + bounds.height * 0.05);
    context.lineTo(
      mix(startX, endX, routeProgress),
      mix(startY + bounds.height * 0.05, endY, routeProgress),
    );
    context.stroke();
    context.fillStyle = RED;
    context.fillRect(endX - 4, endY - 4, 8, 8);
  });
}

function drawCorporate(
  state: IndustryState,
  image: HTMLImageElement,
  time: number,
  strength: number,
): void {
  withScreen(state, image, "corporate", [
    { x: 0.595, y: 0.129 },
    { x: 0.978, y: 0.13 },
    { x: 0.978, y: 0.548 },
    { x: 0.595, y: 0.548 },
  ], (context, bounds) => {
    const left = bounds.left + bounds.width * 0.04;
    const top = bounds.top + bounds.height * 0.11;
    const contentWidth = bounds.width * 0.43;
    context.fillStyle = `rgba(182, 212, 229, ${0.58 + strength * 0.22})`;
    context.fillRect(
      left,
      top,
      contentWidth * (0.14 + strength * 0.08),
      Math.max(2, bounds.height * 0.012),
    );
    context.fillStyle = "rgba(255,255,255,0.58)";
    fitText(context, "LIVE ÜBERSICHT", contentWidth, bounds.height * 0.07);
    context.fillText("LIVE ÜBERSICHT", left, top + bounds.height * 0.11);
    const chartTop = top + bounds.height * 0.2;
    const chartHeight = bounds.height * 0.29;
    context.strokeStyle = "rgba(255,255,255,0.12)";
    context.lineWidth = 1;
    for (let row = 0; row < 4; row += 1) {
      const y = chartTop + row / 3 * chartHeight;
      context.beginPath();
      context.moveTo(left, y);
      context.lineTo(left + contentWidth, y);
      context.stroke();
    }
    context.strokeStyle = `rgba(182, 212, 229, ${0.65 + strength * 0.22})`;
    context.lineWidth = Math.max(1.5, bounds.height * 0.012);
    context.beginPath();
    for (let step = 0; step <= 18; step += 1) {
      const x = left + step / 18 * contentWidth;
      const y = chartTop + chartHeight * (
        0.62
        - step / 18 * 0.26
        + Math.sin(step * 0.7 + time * 0.7) * 0.08
      );
      if (step === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    }
    context.stroke();
    context.fillStyle = WHITE;
    fitText(context, "84%", contentWidth * 0.42, bounds.height * 0.14);
    context.fillText("84%", left, top + bounds.height * 0.67);
    context.fillStyle = RED;
    fitText(context, "+12%", contentWidth * 0.34, bounds.height * 0.1);
    context.fillText(
      "+12%",
      left + contentWidth * 0.46,
      top + bounds.height * 0.67,
    );
  });
}

function drawPublic(
  state: IndustryState,
  image: HTMLImageElement,
  time: number,
  strength: number,
): void {
  withScreen(state, image, "public", [
    { x: 0.645, y: 0.026 },
    { x: 0.814, y: 0.026 },
    { x: 0.814, y: 0.75 },
    { x: 0.645, y: 0.75 },
  ], (context, bounds) => {
    const padding = bounds.width * 0.09;
    context.fillStyle = "rgba(255,255,255,0.58)";
    fitText(context, "NÄCHSTE VERBINDUNG", bounds.width - padding * 2, bounds.width * 0.052);
    context.fillText(
      "NÄCHSTE VERBINDUNG",
      bounds.left + padding,
      bounds.top + bounds.height * 0.1,
    );
    context.fillStyle = WHITE;
    fitText(context, "ZÜRICH HB", bounds.width - padding * 2, bounds.width * 0.1);
    context.fillText(
      "ZÜRICH HB",
      bounds.left + padding,
      bounds.top + bounds.height * 0.22,
    );
    context.fillStyle = RED;
    fitText(context, "12:41", bounds.width * 0.5, bounds.width * 0.13);
    context.fillText(
      "12:41",
      bounds.left + padding,
      bounds.top + bounds.height * 0.34,
    );
    context.fillStyle = "rgba(255,255,255,0.6)";
    fitText(context, "GLEIS 4", bounds.width * 0.36, bounds.width * 0.065);
    context.fillText(
      "GLEIS 4",
      bounds.left + bounds.width * 0.58,
      bounds.top + bounds.height * 0.33,
    );
    const mapLeft = bounds.left + padding;
    const mapTop = bounds.top + bounds.height * 0.46;
    const mapWidth = bounds.width - padding * 2;
    const mapHeight = bounds.height * 0.38;
    context.strokeStyle = "rgba(255,255,255,0.13)";
    context.lineWidth = 1;
    for (let line = 0; line < 5; line += 1) {
      context.beginPath();
      context.moveTo(
        mapLeft + line / 5 * mapWidth,
        mapTop,
      );
      context.bezierCurveTo(
        mapLeft + (line + 1) / 6 * mapWidth,
        mapTop + mapHeight * 0.35,
        mapLeft + line / 4 * mapWidth,
        mapTop + mapHeight * 0.72,
        mapLeft + (line + 1) / 5 * mapWidth,
        mapTop + mapHeight,
      );
      context.stroke();
    }
    const routeProgress = (time * 0.16) % 1;
    context.strokeStyle = `rgba(227, 11, 53, ${0.68 + strength * 0.26})`;
    context.lineWidth = Math.max(2, bounds.width * 0.015);
    context.beginPath();
    context.moveTo(mapLeft, mapTop + mapHeight * 0.8);
    context.bezierCurveTo(
      mapLeft + mapWidth * 0.25,
      mapTop + mapHeight * 0.2,
      mapLeft + mapWidth * 0.52,
      mapTop + mapHeight * 0.65,
      mapLeft + mapWidth * routeProgress,
      mapTop + mapHeight * (0.18 + routeProgress * 0.2),
    );
    context.stroke();
  });
}

function drawEvents(
  state: IndustryState,
  image: HTMLImageElement,
  time: number,
  strength: number,
): void {
  const panels: Quad[] = [
    [
      { x: 0.235, y: 0.335 },
      { x: 0.455, y: 0.25 },
      { x: 0.455, y: 0.57 },
      { x: 0.235, y: 0.57 },
    ],
    [
      { x: 0.51, y: 0.0 },
      { x: 0.635, y: 0.0 },
      { x: 0.635, y: 0.565 },
      { x: 0.51, y: 0.565 },
    ],
    [
      { x: 0.63, y: 0.13 },
      { x: 1, y: 0.09 },
      { x: 1, y: 0.58 },
      { x: 0.63, y: 0.565 },
    ],
  ];
  panels.forEach((panel, panelIndex) => {
    withScreen(state, image, `events-${panelIndex}`, panel, (context, bounds) => {
      const cell = Math.max(5, Math.min(10, bounds.width / 50));
      for (let y = bounds.top; y < bounds.bottom; y += cell) {
        for (let x = bounds.left; x < bounds.right; x += cell) {
          const wave = Math.sin(x * 0.025 + y * 0.018 - time * 2.1);
          if (wave < 0.42) continue;
          context.fillStyle = panelIndex === 2
            ? `rgba(255, 42, 79, ${(wave - 0.4) * (0.36 + strength * 0.35)})`
            : `rgba(255, 255, 255, ${(wave - 0.4) * (0.24 + strength * 0.26)})`;
          context.fillRect(x, y, 1.4 + strength, 1.4 + strength);
        }
      }
      if (panelIndex === 2) {
        const textWidth = bounds.width * 0.36;
        const textX = bounds.left + bounds.width * 0.05;
        context.fillStyle = WHITE;
        fitText(context, "IDEEN", textWidth, bounds.height * 0.13);
        context.fillText(
          "IDEEN",
          textX,
          bounds.top + bounds.height * 0.3,
        );
        context.fillStyle = `rgba(255,255,255,${0.48 + strength * 0.28})`;
        fitText(context, "BEWEGEN RÄUME", textWidth, bounds.height * 0.065);
        context.fillText(
          "BEWEGEN RÄUME",
          textX,
          bounds.top + bounds.height * 0.4,
        );
      }
    });
  });
}

function drawExperience(
  state: IndustryState,
  image: HTMLImageElement,
  time: number,
  strength: number,
): void {
  const { context, width, height } = state;
  const panels: Quad[] = [
    [
      { x: 0.0, y: 0.075 },
      { x: 0.405, y: 0.195 },
      { x: 0.405, y: 0.605 },
      { x: 0.0, y: 0.665 },
    ],
    [
      { x: 0.415, y: 0.205 },
      { x: 0.61, y: 0.235 },
      { x: 0.61, y: 0.585 },
      { x: 0.415, y: 0.605 },
    ],
    [
      { x: 0.61, y: 0.205 },
      { x: 1.0, y: 0.02 },
      { x: 1.0, y: 0.625 },
      { x: 0.61, y: 0.585 },
    ],
  ];
  panels.forEach((panel, panelIndex) => {
    withScreen(
      state,
      image,
      `experience-${panelIndex}`,
      panel,
      (surfaceContext, bounds) => {
        const glow = surfaceContext.createRadialGradient(
          bounds.width * (0.45 + Math.sin(time * 0.2 + panelIndex) * 0.08),
          bounds.height * 0.42,
          0,
          bounds.width * 0.5,
          bounds.height * 0.42,
          bounds.width * 0.55,
        );
        glow.addColorStop(
          0,
          `rgba(236, 242, 247, ${0.07 + strength * 0.12})`,
        );
        glow.addColorStop(1, "rgba(236, 242, 247, 0)");
        surfaceContext.fillStyle = glow;
        surfaceContext.fillRect(0, 0, bounds.width, bounds.height);
        surfaceContext.lineWidth = Math.max(0.7, bounds.width * 0.0015);
        for (let line = 0; line < 18; line += 1) {
          const baseline = bounds.height * (0.19 + line * 0.031);
          surfaceContext.strokeStyle = line % 5 === 0
            ? `rgba(227, 11, 53, ${0.12 + strength * 0.16})`
            : `rgba(225, 235, 242, ${0.08 + strength * 0.1})`;
          surfaceContext.beginPath();
          for (let step = 0; step <= 42; step += 1) {
            const x = step / 42 * bounds.width;
            const y = baseline
              + Math.sin(
                step * 0.29
                + line * 0.42
                + time * 0.44
                + panelIndex * 1.7,
              ) * bounds.height * (0.025 + line * 0.0009)
              + Math.sin(step * 0.08 - time * 0.22)
                * bounds.height * 0.035;
            if (step === 0) surfaceContext.moveTo(x, y);
            else surfaceContext.lineTo(x, y);
          }
          surfaceContext.stroke();
        }
        for (let index = 0; index < 18; index += 1) {
          const x = (
            index * 83.7
            + time * (4 + strength * 10)
            + panelIndex * 61
          ) % bounds.width;
          const y = bounds.height * (
            0.09 + ((index * 47.3 + panelIndex * 7) % 72) / 100
          );
          const flicker = Math.max(
            0.1,
            Math.sin(time * 1.2 + index + panelIndex) * 0.5 + 0.5,
          );
          surfaceContext.fillStyle = index % 6 === 0
            ? `rgba(227, 11, 53, ${flicker * (0.4 + strength * 0.35)})`
            : `rgba(255, 255, 255, ${flicker * (0.18 + strength * 0.22)})`;
          surfaceContext.fillRect(
            x,
            y,
            1.5 + strength * 1.5,
            1.5 + strength * 1.5,
          );
        }
      },
    );
  });

  context.strokeStyle = `rgba(227, 11, 53, ${0.25 + strength * 0.42})`;
  context.lineWidth = Math.max(2, width * 0.004);
  context.shadowColor = "rgba(227, 11, 53, 0.5)";
  context.shadowBlur = 12 + strength * 18;
  context.beginPath();
  context.moveTo(-20, height * 0.83);
  context.bezierCurveTo(
    width * 0.22,
    height * 0.73,
    width * 0.43,
    height * 0.71,
    width * 0.55,
    height * 0.62,
  );
  context.bezierCurveTo(
    width * 0.66,
    height * 0.54,
    width * 0.58,
    height * 0.49,
    width * 0.72,
    height * 0.48,
  );
  context.stroke();
  context.shadowBlur = 0;
}

function drawDisplayContent(
  state: IndustryState,
  index: VariantIndex,
  time: number,
  strength: number,
): void {
  const image = state.images[index].element;
  if (!state.images[index].ready) return;
  if (state.scene === "retail") {
    if (index === 0) drawRetail(state, image, time, strength);
    else drawGastronomy(state, image, time, strength);
  } else if (state.scene === "hospitality") {
    if (index === 0) drawHospitality(state, image, time, strength);
    else drawHealth(state, image, time, strength);
  } else if (state.scene === "corporate") {
    if (index === 0) drawCorporate(state, image, time, strength);
    else drawPublic(state, image, time, strength);
  } else if (index === 0) {
    drawEvents(state, image, time, strength);
  } else {
    drawExperience(state, image, time, strength);
  }
}

function drawPixelMorph(
  state: IndustryState,
  target: ImageState,
  progress: number,
): void {
  const columns = target.pixelCanvas.width;
  const rows = target.pixelCanvas.height;
  if (!target.ready || columns <= 0 || rows <= 0) return;
  const cellWidth = state.width / columns;
  const cellHeight = state.height / rows;
  const direction = state.morphTo > state.morphFrom ? 1 : -1;
  state.context.save();
  state.context.imageSmoothingEnabled = false;
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const directional = direction > 0
        ? column / Math.max(1, columns - 1)
        : 1 - column / Math.max(1, columns - 1);
      const threshold = clamp01(
        directional * 0.58
        + seededNoise(column, row) * 0.34
        + row / Math.max(1, rows - 1) * 0.08,
      );
      if (progress < threshold) continue;
      const local = clamp01((progress - threshold) / 0.16);
      state.context.globalAlpha = smoothstep(local);
      state.context.drawImage(
        target.pixelCanvas,
        column,
        row,
        1,
        1,
        column * cellWidth,
        row * cellHeight,
        cellWidth + 0.7,
        cellHeight + 0.7,
      );
    }
  }
  state.context.restore();
}

export function mountIndustryGallery(): IndustryGallery {
  const cards = Array.from(
    document.querySelectorAll<HTMLElement>("[data-industry-scene]"),
  );
  const reducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;
  const finePointer = window.matchMedia(
    "(hover: hover) and (pointer: fine)",
  ).matches;
  const states: IndustryState[] = [];
  let frame = 0;
  let destroyed = false;
  const startedAt = performance.now();

  const updatePixelSource = (
    state: IndustryState,
    imageState: ImageState,
  ) => {
    const image = imageState.element;
    if (!image.complete || image.naturalWidth === 0) return;
    const pixelWidth = Math.max(30, Math.ceil(state.width / 16));
    const pixelHeight = Math.max(24, Math.ceil(state.height / 16));
    imageState.pixelCanvas.width = pixelWidth;
    imageState.pixelCanvas.height = pixelHeight;
    imageState.pixelContext.clearRect(0, 0, pixelWidth, pixelHeight);
    drawCover(
      imageState.pixelContext,
      image,
      pixelWidth,
      pixelHeight,
    );
    imageState.ready = true;
  };

  const resize = (state: IndustryState) => {
    const rect = state.card.getBoundingClientRect();
    const nextWidth = Math.max(1, rect.width);
    const nextHeight = Math.max(1, rect.height);
    if (
      Math.abs(nextWidth - state.width) < 0.5
      && Math.abs(nextHeight - state.height) < 0.5
    ) {
      return;
    }
    state.ratio = Math.min(window.devicePixelRatio || 1, 1.5);
    state.width = nextWidth;
    state.height = nextHeight;
    state.canvas.width = Math.round(state.width * state.ratio);
    state.canvas.height = Math.round(state.height * state.ratio);
    state.context.setTransform(state.ratio, 0, 0, state.ratio, 0, 0);
    state.images.forEach((image) => updatePixelSource(state, image));
    requestRender();
  };

  const updateLabel = (state: IndustryState) => {
    const image = state.images[state.currentIndex];
    state.label.textContent = image.label;
    state.card.classList.toggle("is-secondary", state.currentIndex === 1);
    state.toggle.setAttribute(
      "aria-label",
      state.currentIndex === 0
        ? `${state.images[1].label} anzeigen`
        : `${state.images[0].label} anzeigen`,
    );
  };

  const beginMorph = (
    state: IndustryState,
    target: VariantIndex,
    now = performance.now(),
  ) => {
    if (target === state.currentIndex || !state.images[target].ready) return;
    if (reducedMotion) {
      state.currentIndex = target;
      state.desiredIndex = target;
      state.morphing = false;
      updateLabel(state);
      requestRender();
      return;
    }
    state.morphFrom = state.currentIndex;
    state.morphTo = target;
    state.morphStarted = now;
    state.morphing = true;
    state.card.classList.add("is-industry-morphing");
    requestRender();
  };

  const setDesired = (state: IndustryState, target: VariantIndex) => {
    state.desiredIndex = target;
    if (!state.morphing && state.currentIndex !== target) beginMorph(state, target);
  };

  const clearAutoTimer = (state: IndustryState) => {
    window.clearTimeout(state.autoTimer);
    state.autoTimer = 0;
  };

  const scheduleMobileToggle = (state: IndustryState) => {
    clearAutoTimer(state);
    if (
      finePointer
      || reducedMotion
      || !state.visible
      || !state.centered
      || destroyed
    ) {
      return;
    }
    state.autoTimer = window.setTimeout(() => {
      const next: VariantIndex = state.desiredIndex === 0 ? 1 : 0;
      setDesired(state, next);
      scheduleMobileToggle(state);
    }, state.desiredIndex === 0 ? 2_800 : 5_200);
  };

  const render = (now: number) => {
    frame = 0;
    if (destroyed) return;
    let continueAnimation = false;
    states.forEach((state) => {
      if (!state.visible) return;
      continueAnimation = true;
      state.interaction = mix(
        state.interaction,
        state.targetInteraction,
        state.targetInteraction > state.interaction ? 0.09 : 0.04,
      );
      const elapsed = state.revealStarted ? now - state.revealStarted : 0;
      const reveal = reducedMotion ? 1 : smoothstep((elapsed - 70) / 1_050);
      state.context.clearRect(0, 0, state.width, state.height);

      if (reveal < 0.995) {
        const current = state.images[state.currentIndex];
        if (current.ready) {
          state.context.save();
          state.context.globalAlpha = 1 - reveal;
          state.context.imageSmoothingEnabled = false;
          state.context.drawImage(
            current.pixelCanvas,
            0,
            0,
            state.width,
            state.height,
          );
          state.context.restore();
        }
      }

      let contentIndex = state.currentIndex;
      let contentAlpha = clamp01((reveal - 0.34) / 0.5);
      if (state.morphing) {
        const progress = smoothstep((now - state.morphStarted) / morphDuration);
        drawPixelMorph(state, state.images[state.morphTo], progress);
        if (progress > 0.68) {
          contentIndex = state.morphTo;
          contentAlpha *= clamp01((progress - 0.68) / 0.24);
        } else {
          contentAlpha *= 1 - clamp01(progress / 0.56);
        }
        if (progress >= 0.999) {
          state.currentIndex = state.morphTo;
          state.morphing = false;
          state.card.classList.remove("is-industry-morphing");
          updateLabel(state);
          if (state.desiredIndex !== state.currentIndex) {
            beginMorph(state, state.desiredIndex, now + 16);
          }
        }
      }

      if (contentAlpha > 0.01) {
        state.context.save();
        state.context.globalAlpha = contentAlpha;
        drawDisplayContent(
          state,
          contentIndex,
          Math.max(0, (now - startedAt) / 1_000),
          0.28 + state.interaction * 0.72,
        );
        state.context.restore();
      }
    });
    if (continueAnimation && !reducedMotion) {
      frame = window.requestAnimationFrame(render);
    }
  };

  function requestRender() {
    if (frame || destroyed) return;
    frame = window.requestAnimationFrame(render);
  }

  cards.forEach((card) => {
    const imageElements = Array.from(
      card.querySelectorAll<HTMLImageElement>("[data-industry-image]"),
    );
    const canvas = card.querySelector<HTMLCanvasElement>(".industry-card__canvas");
    const context = canvas?.getContext("2d", { alpha: true });
    const label = card.querySelector<HTMLElement>("[data-industry-active-label]");
    const toggle = card.querySelector<HTMLButtonElement>("[data-industry-toggle]");
    const scene = card.dataset.industryScene as IndustryScene | undefined;
    if (
      imageElements.length !== 2
      || !canvas
      || !context
      || !label
      || !toggle
      || !scene
    ) {
      return;
    }
    const imageStates = imageElements.map((element) => {
      const pixelCanvas = document.createElement("canvas");
      const pixelContext = pixelCanvas.getContext("2d", { alpha: false });
      if (!pixelContext) return null;
      return {
        element,
        label: element.dataset.industryLabel ?? "",
        pixelCanvas,
        pixelContext,
        ready: false,
      };
    });
    if (!imageStates[0] || !imageStates[1]) return;
    states.push({
      card,
      images: [imageStates[0], imageStates[1]],
      canvas,
      context,
      label,
      toggle,
      scene,
      width: 0,
      height: 0,
      ratio: 1,
      visible: reducedMotion,
      centered: reducedMotion,
      revealed: reducedMotion,
      revealStarted: reducedMotion ? performance.now() - 2_000 : 0,
      interaction: 0,
      targetInteraction: 0,
      currentIndex: 0,
      desiredIndex: 0,
      morphFrom: 0,
      morphTo: 0,
      morphStarted: 0,
      morphing: false,
      pointerX: 0.5,
      pointerY: 0.35,
      autoTimer: 0,
      touchTimer: 0,
      surfaces: new Map(),
    });
  });

  if (states.length === 0) return { destroy() {} };

  const intersectionObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        const state = states.find(({ card }) => card === entry.target);
        if (!state) return;
        state.visible = entry.isIntersecting;
        state.centered = entry.isIntersecting && entry.intersectionRatio >= 0.55;
        if (entry.isIntersecting && !state.revealed) {
          state.revealed = true;
          state.revealStarted = performance.now();
          state.card.classList.add("is-industry-visible");
        }
        scheduleMobileToggle(state);
      });
      requestRender();
    },
    {
      rootMargin: "8% 0px 8% 0px",
      threshold: [0.12, 0.55, 0.9],
    },
  );
  const resizeObserver = new ResizeObserver((entries) => {
    entries.forEach((entry) => {
      const state = states.find(({ card }) => card === entry.target);
      if (state) resize(state);
    });
  });
  const cleanups: Array<() => void> = [];

  states.forEach((state) => {
    const handleImage = (image: ImageState) => {
      updatePixelSource(state, image);
      if (
        image === state.images[state.desiredIndex]
        && state.desiredIndex !== state.currentIndex
        && !state.morphing
      ) {
        beginMorph(state, state.desiredIndex);
      }
      requestRender();
    };
    const imageHandlers = state.images.map((image) => {
      const handler = () => handleImage(image);
      image.element.addEventListener("load", handler);
      if (image.element.complete) handleImage(image);
      return handler;
    });
    const handlePointer = (event: PointerEvent) => {
      const rect = state.card.getBoundingClientRect();
      state.pointerX = clamp01((event.clientX - rect.left) / rect.width);
      state.pointerY = clamp01((event.clientY - rect.top) / rect.height);
      state.targetInteraction = 1;
      if (event.pointerType !== "touch") setDesired(state, 1);
      clearAutoTimer(state);
      requestRender();
    };
    const handleLeave = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      state.targetInteraction = 0;
      setDesired(state, 0);
    };
    const handleCardTouch = (event: PointerEvent) => {
      if (
        event.pointerType !== "touch"
        || (event.target instanceof Element && event.target.closest("[data-industry-toggle]"))
      ) {
        return;
      }
      const next: VariantIndex = state.desiredIndex === 0 ? 1 : 0;
      setDesired(state, next);
      state.targetInteraction = 1;
      window.clearTimeout(state.touchTimer);
      state.touchTimer = window.setTimeout(() => {
        state.targetInteraction = 0;
        scheduleMobileToggle(state);
      }, 1_400);
    };
    const handleToggle = (event: MouseEvent) => {
      event.stopPropagation();
      if (finePointer && event.detail > 0) {
        setDesired(state, 1);
        state.targetInteraction = 1;
        return;
      }
      const next: VariantIndex = state.desiredIndex === 0 ? 1 : 0;
      setDesired(state, next);
      state.targetInteraction = 1;
      window.clearTimeout(state.touchTimer);
      state.touchTimer = window.setTimeout(() => {
        state.targetInteraction = 0;
        scheduleMobileToggle(state);
      }, 1_400);
    };
    state.card.addEventListener("pointerenter", handlePointer);
    state.card.addEventListener("pointermove", handlePointer);
    state.card.addEventListener("pointerleave", handleLeave);
    state.card.addEventListener("pointerup", handleCardTouch);
    state.toggle.addEventListener("click", handleToggle);
    resizeObserver.observe(state.card);
    intersectionObserver.observe(state.card);
    resize(state);
    updateLabel(state);
    if (reducedMotion) {
      state.card.classList.add("is-industry-visible");
      requestRender();
    }
    cleanups.push(() => {
      imageHandlers.forEach((handler, index) => {
        state.images[index].element.removeEventListener("load", handler);
      });
      state.card.removeEventListener("pointerenter", handlePointer);
      state.card.removeEventListener("pointermove", handlePointer);
      state.card.removeEventListener("pointerleave", handleLeave);
      state.card.removeEventListener("pointerup", handleCardTouch);
      state.toggle.removeEventListener("click", handleToggle);
    });
  });

  return {
    destroy() {
      destroyed = true;
      window.cancelAnimationFrame(frame);
      intersectionObserver.disconnect();
      resizeObserver.disconnect();
      cleanups.forEach((cleanup) => cleanup());
      states.forEach((state) => {
        clearAutoTimer(state);
        window.clearTimeout(state.touchTimer);
        state.context.clearRect(0, 0, state.width, state.height);
      });
    },
  };
}

export interface SolutionFinderScenes {
  destroy(): void;
}

type SolutionKey =
  | "verkaufen"
  | "informieren"
  | "orientieren"
  | "begeistern"
  | "monetarisieren";

const RED = "#d30a2f";
const BRIGHT_RED = "#ff3156";
const WHITE = "rgba(255, 255, 255, 0.78)";
const MUTED = "rgba(255, 255, 255, 0.2)";
const keys: SolutionKey[] = [
  "verkaufen",
  "informieren",
  "orientieren",
  "begeistern",
  "monetarisieren",
];

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

interface ImageRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

function projectCoverRect(
  stageWidth: number,
  stageHeight: number,
  imageWidth: number,
  imageHeight: number,
  positionX: number,
  positionY: number,
  rect: ImageRect,
): ImageRect {
  const scale = Math.max(stageWidth / imageWidth, stageHeight / imageHeight);
  const renderedWidth = imageWidth * scale;
  const renderedHeight = imageHeight * scale;
  const offsetX = (stageWidth - renderedWidth) * positionX;
  const offsetY = (stageHeight - renderedHeight) * positionY;
  return {
    x: offsetX + rect.x * scale,
    y: offsetY + rect.y * scale,
    width: rect.width * scale,
    height: rect.height * scale,
  };
}

function noise(x: number, y: number): number {
  const value = Math.sin(x * 12.9898 + y * 78.233) * 43_758.5453;
  return value - Math.floor(value);
}

function line(
  context: CanvasRenderingContext2D,
  points: Array<[number, number]>,
  color: string,
  width = 1,
  dash: number[] = [],
): void {
  context.beginPath();
  points.forEach(([x, y], index) => {
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  });
  context.strokeStyle = color;
  context.lineWidth = width;
  context.setLineDash(dash);
  context.stroke();
  context.setLineDash([]);
}

function screen(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  active = false,
): void {
  context.fillStyle = active
    ? "rgba(211, 10, 47, 0.13)"
    : "rgba(255, 255, 255, 0.025)";
  context.fillRect(x, y, width, height);
  context.strokeStyle = active ? RED : "rgba(255, 255, 255, 0.34)";
  context.lineWidth = 1;
  context.strokeRect(x, y, width, height);
  context.fillStyle = active ? RED : "rgba(255, 255, 255, 0.38)";
  context.fillRect(x + width * 0.15, y + height * 0.35, width * 0.42, 2);
  context.fillRect(x + width * 0.15, y + height * 0.56, width * 0.66, 1);
}

function drawSell(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  time: number,
  pointerX: number,
): void {
  const display = projectCoverRect(
    width,
    height,
    1200,
    600,
    0.58,
    0.52,
    { x: 635, y: 10, width: 375, height: 565 },
  );
  const pulse = 0.5 + Math.sin(time * 2.1) * 0.5;
  const handX = display.x + display.width * 0.28;
  const handY = display.y + display.height * 0.58;
  const glow = context.createRadialGradient(
    handX,
    handY,
    0,
    handX,
    handY,
    Math.max(36, display.width * (0.22 + pointerX * 0.08)),
  );
  glow.addColorStop(0, `rgba(255, 49, 86, ${0.34 + pulse * 0.24})`);
  glow.addColorStop(0.42, "rgba(211, 10, 47, 0.14)");
  glow.addColorStop(1, "rgba(211, 10, 47, 0)");
  context.fillStyle = glow;
  context.fillRect(
    display.x - display.width * 0.2,
    display.y,
    display.width * 1.2,
    display.height,
  );

  context.save();
  context.beginPath();
  context.rect(display.x, display.y, display.width, display.height);
  context.clip();
  const scanProgress = (time * 0.16) % 1;
  const scanY = display.y + display.height * scanProgress;
  const scan = context.createLinearGradient(0, scanY - 28, 0, scanY + 28);
  scan.addColorStop(0, "rgba(255, 49, 86, 0)");
  scan.addColorStop(0.5, "rgba(255, 49, 86, 0.34)");
  scan.addColorStop(1, "rgba(255, 49, 86, 0)");
  context.fillStyle = scan;
  context.fillRect(display.x, scanY - 28, display.width, 56);

  const selections = [
    [0.3, 0.29],
    [0.72, 0.26],
    [0.3, 0.73],
    [0.72, 0.71],
  ];
  const activeSelection = Math.floor((time * 0.42) % selections.length);
  selections.forEach(([x, y], index) => {
    const active = index === activeSelection;
    const size = Math.min(display.width, display.height) * (active ? 0.12 : 0.08);
    const centerX = display.x + display.width * x;
    const centerY = display.y + display.height * y;
    context.strokeStyle = active
      ? `rgba(255, 49, 86, ${0.66 + pulse * 0.28})`
      : "rgba(255, 255, 255, 0.18)";
    context.lineWidth = active ? 1.6 : 1;
    context.strokeRect(centerX - size / 2, centerY - size / 2, size, size);
  });
  context.restore();

  context.strokeStyle = `rgba(211, 10, 47, ${0.34 + pulse * 0.3})`;
  context.lineWidth = 1.5;
  context.strokeRect(display.x, display.y, display.width, display.height);
}

function drawInform(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  time: number,
  pointerY: number,
): void {
  const hubX = width * 0.16;
  const centerY = height * 0.49;
  const targets = [
    { x: width * 0.48, y: height * 0.2 },
    { x: width * 0.75, y: height * 0.2 },
    { x: width * 0.48, y: height * 0.61 },
    { x: width * 0.75, y: height * 0.61 },
  ];
  context.fillStyle = "rgba(211, 10, 47, 0.12)";
  context.fillRect(hubX - 23, centerY - 28, 46, 56);
  context.strokeStyle = RED;
  context.strokeRect(hubX - 23, centerY - 28, 46, 56);
  context.fillStyle = RED;
  context.fillRect(hubX - 5, centerY - 5, 10, 10);

  targets.forEach((target, index) => {
    const active = index === Math.min(3, Math.floor(pointerY * 4));
    const targetWidth = width * 0.16;
    const targetHeight = height * 0.18;
    line(
      context,
      [
        [hubX + 23, centerY],
        [width * 0.34, centerY],
        [width * 0.38, target.y + targetHeight / 2],
        [target.x, target.y + targetHeight / 2],
      ],
      active ? "rgba(211, 10, 47, 0.74)" : MUTED,
      1,
      [3, 5],
    );
    screen(context, target.x, target.y, targetWidth, targetHeight, active);
    const travel = (time * 0.24 + index * 0.22) % 1;
    const pulseX = mix(hubX + 23, target.x, travel);
    const pulseY = mix(centerY, target.y + targetHeight / 2, travel);
    context.fillStyle = RED;
    context.fillRect(pulseX - 2.5, pulseY - 2.5, 5, 5);
  });
}

function drawOrient(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  time: number,
  pointerX: number,
): void {
  const left = width * 0.1;
  const top = height * 0.13;
  const roomWidth = width * 0.8;
  const roomHeight = height * 0.7;
  context.strokeStyle = "rgba(255, 255, 255, 0.28)";
  context.strokeRect(left, top, roomWidth, roomHeight);
  line(context, [[left + roomWidth * 0.28, top], [left + roomWidth * 0.28, top + roomHeight * 0.56]], MUTED);
  line(context, [[left + roomWidth * 0.57, top + roomHeight * 0.28], [left + roomWidth * 0.57, top + roomHeight]], MUTED);
  line(context, [[left, top + roomHeight * 0.58], [left + roomWidth * 0.28, top + roomHeight * 0.58]], MUTED);
  line(context, [[left + roomWidth * 0.57, top + roomHeight * 0.28], [left + roomWidth, top + roomHeight * 0.28]], MUTED);

  const destinationY = mix(top + roomHeight * 0.18, top + roomHeight * 0.46, pointerX);
  const path = [
    [left + 10, top + roomHeight - 12],
    [left + roomWidth * 0.42, top + roomHeight - 12],
    [left + roomWidth * 0.42, destinationY],
    [left + roomWidth - 14, destinationY],
  ] as Array<[number, number]>;
  line(context, path, RED, 2);
  const travel = (time * 0.23) % 1;
  const segment = Math.min(2, Math.floor(travel * 3));
  const local = travel * 3 - segment;
  context.fillStyle = BRIGHT_RED;
  context.fillRect(
    mix(path[segment][0], path[segment + 1][0], local) - 3,
    mix(path[segment][1], path[segment + 1][1], local) - 3,
    6,
    6,
  );
  context.fillStyle = WHITE;
  context.fillRect(path[0][0] - 4, path[0][1] - 4, 8, 8);
  context.strokeStyle = RED;
  context.strokeRect(path[3][0] - 8, path[3][1] - 8, 16, 16);
}

function drawInspire(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  time: number,
  pointerX: number,
  pointerY: number,
): void {
  const lightX = width * mix(0.5 + Math.sin(time * 0.3) * 0.06, pointerX, 0.65);
  const lightY = height * mix(0.72, Math.max(0.5, pointerY), 0.45);
  const glow = context.createRadialGradient(lightX, lightY, 0, lightX, lightY, width * 0.35);
  glow.addColorStop(0, "rgba(211, 10, 47, 0.42)");
  glow.addColorStop(1, "rgba(211, 10, 47, 0)");
  context.fillStyle = glow;
  context.fillRect(0, 0, width, height);
}

function drawMonetize(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  time: number,
  pointerX: number,
): void {
  const sourceScreens: ImageRect[] = [
    { x: 28, y: 32, width: 242, height: 514 },
    { x: 283, y: 148, width: 236, height: 112 },
    { x: 550, y: 255, width: 88, height: 238 },
    { x: 895, y: 220, width: 278, height: 224 },
  ];
  const screens = sourceScreens.map((rect) => projectCoverRect(
    width,
    height,
    1200,
    595,
    0.5,
    0.5,
    rect,
  ));
  const selected = Math.min(
    screens.length - 1,
    Math.floor(clamp01(pointerX) * screens.length),
  );

  screens.forEach((display, index) => {
    const phase = (time * 0.34 + index * 0.23) % 1;
    const pulse = Math.sin(phase * Math.PI);
    const active = index === selected;
    const centerX = display.x + display.width / 2;
    const centerY = display.y + display.height / 2;
    const radius = Math.max(28, Math.min(display.width, display.height) * 0.7);
    const glow = context.createRadialGradient(
      centerX,
      centerY,
      0,
      centerX,
      centerY,
      radius,
    );
    glow.addColorStop(0, `rgba(255, 49, 86, ${(active ? 0.2 : 0.08) + pulse * 0.12})`);
    glow.addColorStop(1, "rgba(211, 10, 47, 0)");
    context.fillStyle = glow;
    context.fillRect(
      centerX - radius,
      centerY - radius,
      radius * 2,
      radius * 2,
    );

    context.save();
    context.beginPath();
    context.rect(display.x, display.y, display.width, display.height);
    context.clip();
    const sweepX = display.x + display.width * phase;
    const sweep = context.createLinearGradient(sweepX - 22, 0, sweepX + 22, 0);
    sweep.addColorStop(0, "rgba(255, 255, 255, 0)");
    sweep.addColorStop(0.5, `rgba(255, 255, 255, ${active ? 0.26 : 0.13})`);
    sweep.addColorStop(1, "rgba(255, 255, 255, 0)");
    context.fillStyle = sweep;
    context.fillRect(sweepX - 22, display.y, 44, display.height);
    context.restore();

    context.strokeStyle = active
      ? `rgba(255, 49, 86, ${0.62 + pulse * 0.28})`
      : `rgba(211, 10, 47, ${0.18 + pulse * 0.2})`;
    context.lineWidth = active ? 1.7 : 1;
    context.strokeRect(display.x, display.y, display.width, display.height);
  });
}

function drawScene(
  context: CanvasRenderingContext2D,
  key: SolutionKey,
  width: number,
  height: number,
  time: number,
  pointerX: number,
  pointerY: number,
): void {
  context.clearRect(0, 0, width, height);
  if (key === "verkaufen") drawSell(context, width, height, time, pointerX);
  else if (key === "informieren") drawInform(context, width, height, time, pointerY);
  else if (key === "orientieren") drawOrient(context, width, height, time, pointerX);
  else if (key === "begeistern") {
    drawInspire(context, width, height, time, pointerX, pointerY);
  } else {
    drawMonetize(context, width, height, time, pointerX);
  }
}

export function mountSolutionFinderScenes(): SolutionFinderScenes {
  const result = document.querySelector<HTMLElement>("[data-solution-result]");
  const stage = result?.querySelector<HTMLElement>(".solution-result__stage");
  const canvas = result?.querySelector<HTMLCanvasElement>(".solution-result__canvas");
  const context = canvas?.getContext("2d", { alpha: true });
  const tabs = Array.from(
    document.querySelectorAll<HTMLButtonElement>("[data-solution-goal]"),
  );
  const reducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;
  if (!result || !stage || !canvas || !context || tabs.length === 0) {
    return { destroy() {} };
  }

  const currentBuffer = document.createElement("canvas");
  const previousBuffer = document.createElement("canvas");
  const currentContext = currentBuffer.getContext("2d", { alpha: true });
  const previousContext = previousBuffer.getContext("2d", { alpha: true });
  if (!currentContext || !previousContext) return { destroy() {} };

  let width = 1;
  let height = 1;
  let ratio = 1;
  let frame = 0;
  let visible = reducedMotion;
  let destroyed = false;
  let activeKey = (result.dataset.activeSolution ?? "verkaufen") as SolutionKey;
  let previousKey = activeKey;
  let transitionStarted = 0;
  let pointerX = 0.5;
  let pointerY = 0.5;
  let targetPointerX = 0.5;
  let targetPointerY = 0.5;
  const startedAt = performance.now();

  const resize = () => {
    const rect = stage.getBoundingClientRect();
    ratio = Math.min(window.devicePixelRatio || 1, 1.5);
    width = Math.max(1, rect.width);
    height = Math.max(1, rect.height);
    [canvas, currentBuffer, previousBuffer].forEach((item) => {
      item.width = Math.round(width * ratio);
      item.height = Math.round(height * ratio);
    });
    [context, currentContext, previousContext].forEach((item) => {
      item.setTransform(ratio, 0, 0, ratio, 0, 0);
    });
    requestRender();
  };

  const compositeTransition = (progress: number) => {
    const grid = width <= 520 ? 7 : 9;
    const oldPath = new Path2D();
    const newPath = new Path2D();
    const columns = Math.ceil(width / grid);
    const rows = Math.ceil(height / grid);
    const eased = smoothstep(progress);
    for (let row = 0; row <= rows; row += 1) {
      for (let column = 0; column <= columns; column += 1) {
        const threshold = noise(column, row);
        const size = grid * (0.76 + Math.abs(eased - 0.5) * 0.42);
        const x = column * grid + (threshold - 0.5) * (grid - size);
        const y = row * grid + (0.5 - threshold) * (grid - size);
        const path = threshold <= eased ? newPath : oldPath;
        path.rect(x, y, size, size);
      }
    }
    context.save();
    context.clip(oldPath);
    context.drawImage(previousBuffer, 0, 0, width, height);
    context.restore();
    context.save();
    context.clip(newPath);
    context.drawImage(currentBuffer, 0, 0, width, height);
    context.restore();
  };

  const render = (now: number) => {
    frame = 0;
    if (destroyed) return;
    pointerX = mix(pointerX, targetPointerX, 0.08);
    pointerY = mix(pointerY, targetPointerY, 0.08);
    stage.style.setProperty("--solution-light-x", `${(pointerX * 100).toFixed(1)}%`);
    stage.style.setProperty("--solution-light-y", `${(pointerY * 100).toFixed(1)}%`);
    const time = Math.max(0, (now - startedAt) / 1_000);
    drawScene(currentContext, activeKey, width, height, time, pointerX, pointerY);
    context.clearRect(0, 0, width, height);
    const transitionProgress = transitionStarted
      ? (now - transitionStarted) / 720
      : 1;
    if (transitionProgress < 1 && previousKey !== activeKey) {
      drawScene(previousContext, previousKey, width, height, time, pointerX, pointerY);
      compositeTransition(transitionProgress);
    } else {
      transitionStarted = 0;
      context.drawImage(currentBuffer, 0, 0, width, height);
    }
    if (visible && !reducedMotion) frame = window.requestAnimationFrame(render);
  };

  function requestRender() {
    if (frame || destroyed) return;
    frame = window.requestAnimationFrame(render);
  }

  const setScene = (key: SolutionKey) => {
    if (key === activeKey) return;
    previousKey = activeKey;
    activeKey = key;
    result.dataset.activeSolution = key;
    transitionStarted = reducedMotion ? 0 : performance.now();
    requestRender();
  };

  const cleanups: Array<() => void> = [];
  tabs.forEach((tab, index) => {
    const handleClick = () => {
      const key = tab.dataset.solutionGoal as SolutionKey | undefined;
      if (key && keys.includes(key)) setScene(key);
    };
    const handleKeydown = (event: KeyboardEvent) => {
      if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
        return;
      }
      event.preventDefault();
      const direction = event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 1;
      const next = tabs[(index + direction + tabs.length) % tabs.length];
      next.focus();
      next.click();
    };
    tab.addEventListener("click", handleClick);
    tab.addEventListener("keydown", handleKeydown);
    cleanups.push(() => {
      tab.removeEventListener("click", handleClick);
      tab.removeEventListener("keydown", handleKeydown);
    });
  });

  const handlePointerMove = (event: PointerEvent) => {
    const rect = stage.getBoundingClientRect();
    targetPointerX = clamp01((event.clientX - rect.left) / rect.width);
    targetPointerY = clamp01((event.clientY - rect.top) / rect.height);
    requestRender();
  };
  const handlePointerLeave = () => {
    targetPointerX = 0.5;
    targetPointerY = 0.5;
  };
  stage.addEventListener("pointermove", handlePointerMove, { passive: true });
  stage.addEventListener("pointerleave", handlePointerLeave);
  cleanups.push(() => {
    stage.removeEventListener("pointermove", handlePointerMove);
    stage.removeEventListener("pointerleave", handlePointerLeave);
  });

  const intersectionObserver = new IntersectionObserver((entries) => {
    visible = entries.some((entry) => entry.isIntersecting);
    if (visible) requestRender();
    else if (frame) {
      window.cancelAnimationFrame(frame);
      frame = 0;
    }
  }, { rootMargin: "10% 0px 10% 0px", threshold: 0.05 });
  const resizeObserver = new ResizeObserver(resize);
  intersectionObserver.observe(result);
  resizeObserver.observe(stage);
  resize();
  if (reducedMotion) render(performance.now());

  return {
    destroy() {
      destroyed = true;
      window.cancelAnimationFrame(frame);
      intersectionObserver.disconnect();
      resizeObserver.disconnect();
      cleanups.forEach((cleanup) => cleanup());
      context.clearRect(0, 0, width, height);
    },
  };
}

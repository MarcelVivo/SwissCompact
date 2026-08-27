export interface MarketingEntryDissolve {
  destroy(): void;
}

interface PixelCell {
  x: number;
  y: number;
  noise: number;
  secondaryNoise: number;
  threshold: number;
}

interface TextPixel {
  x: number;
  y: number;
  noise: number;
  threshold: number;
  color: string;
}

interface TextLayer {
  element: HTMLElement;
  pixels: TextPixel[];
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function smoothstep(value: number): number {
  const clamped = clamp01(value);
  return clamped * clamped * (3 - 2 * clamped);
}

function noise(x: number, y: number, seed: number): number {
  const value = Math.sin(
    x * 12.9898 + y * 78.233 + seed * 37.719,
  ) * 43_758.5453;
  return value - Math.floor(value);
}

export function mountMarketingEntryDissolve(): MarketingEntryDissolve {
  const canvas = document.querySelector<HTMLCanvasElement>(
    ".marketing-entry-dissolve",
  );
  const context = canvas?.getContext("2d", { alpha: true });
  const scroller = document.querySelector<HTMLElement>("#scroller");
  const impact = document.querySelector<HTMLElement>("#wirkung");
  const root = document.documentElement;
  const reducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;

  if (!canvas || !context || !scroller || !impact || reducedMotion) {
    return { destroy() {} };
  }

  const cells: PixelCell[] = [];
  const textLayers: TextLayer[] = [];
  const copyElements = Array.from(
    impact.querySelectorAll<HTMLElement>(".section-heading > .eyebrow, .section-heading > h2, .section-heading > p"),
  );
  let width = window.innerWidth;
  let height = window.innerHeight;
  let gridSize = 10;
  let animationFrame = 0;
  let destroyed = false;

  root.classList.add("has-marketing-entry-dissolve");

  const rebuildCells = () => {
    cells.length = 0;
    gridSize = width <= 640 ? 9 : 10;
    const columns = Math.ceil(width / gridSize);
    const rows = Math.ceil(height / gridSize);

    for (let row = 0; row <= rows; row += 1) {
      for (let column = 0; column <= columns; column += 1) {
        const primaryNoise = noise(column, row, 1);
        const secondaryNoise = noise(column, row, 2);
        const verticalPosition = row / Math.max(1, rows);
        cells.push({
          x: column * gridSize,
          y: row * gridSize,
          noise: primaryNoise,
          secondaryNoise,
          threshold: Math.min(
            0.79,
            (1 - verticalPosition) * 0.74
              + primaryNoise * 0.31
              - 0.035,
          ),
        });
      }
    }
  };

  const rebuildTextLayers = () => {
    textLayers.length = 0;
    const sampleSize = width <= 640 ? 4 : 5;

    copyElements.forEach((element, layerIndex) => {
      const elementRect = element.getBoundingClientRect();
      const layerWidth = Math.max(1, Math.ceil(elementRect.width));
      const layerHeight = Math.max(1, Math.ceil(elementRect.height));
      const mask = document.createElement("canvas");
      mask.width = layerWidth;
      mask.height = layerHeight;
      const maskContext = mask.getContext("2d", {
        alpha: true,
        willReadFrequently: true,
      });
      if (!maskContext) return;

      const walker = document.createTreeWalker(
        element,
        NodeFilter.SHOW_TEXT,
      );
      let currentNode = walker.nextNode();

      while (currentNode) {
        const textNode = currentNode as Text;
        const text = textNode.data;
        const parent = textNode.parentElement;
        if (parent && text.trim()) {
          const computed = getComputedStyle(parent);
          const fontSize = Number.parseFloat(computed.fontSize) || 16;
          const lineHeight = Number.parseFloat(computed.lineHeight) || fontSize;
          maskContext.font = [
            computed.fontStyle,
            computed.fontWeight,
            computed.fontSize,
            computed.fontFamily,
          ].join(" ");
          maskContext.fillStyle = computed.color;
          maskContext.textBaseline = "alphabetic";
          maskContext.fontKerning = "normal";

          const wordPattern = /\S+/g;
          let match = wordPattern.exec(text);
          while (match) {
            const range = document.createRange();
            range.setStart(textNode, match.index);
            range.setEnd(textNode, match.index + match[0].length);
            const rect = range.getBoundingClientRect();
            const transformedWord = computed.textTransform === "uppercase"
              ? match[0].toUpperCase()
              : match[0];
            const baseline =
              rect.bottom
              - elementRect.top
              - Math.max(0, (lineHeight - fontSize) / 2)
              - fontSize * 0.12;
            maskContext.fillText(
              transformedWord,
              rect.left - elementRect.left,
              baseline,
            );
            match = wordPattern.exec(text);
          }
        }
        currentNode = walker.nextNode();
      }

      const image = maskContext.getImageData(0, 0, layerWidth, layerHeight);
      const pixels: TextPixel[] = [];
      const start = layerIndex === 0 ? 0.2 : layerIndex === 1 ? 0.27 : 0.46;
      const spread = layerIndex === 0 ? 0.34 : layerIndex === 1 ? 0.48 : 0.36;

      for (let y = 0; y < layerHeight; y += sampleSize) {
        for (let x = 0; x < layerWidth; x += sampleSize) {
          const index = (y * layerWidth + x) * 4;
          if (image.data[index + 3] < 48) continue;
          const red = image.data[index];
          const green = image.data[index + 1];
          const blue = image.data[index + 2];
          const pixelNoise = noise(
            Math.floor(x / sampleSize),
            Math.floor(y / sampleSize),
            layerIndex + 11,
          );
          pixels.push({
            x,
            y,
            noise: pixelNoise,
            threshold: start + pixelNoise * spread,
            color: `rgb(${red} ${green} ${blue})`,
          });
        }
      }

      textLayers.push({ element, pixels });
    });
  };

  const resize = () => {
    const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    rebuildCells();
    rebuildTextLayers();
    scheduleRender();
  };

  const readProgress = (): number => {
    const journeyMaximum = Math.max(
      1,
      scroller.offsetHeight - window.innerHeight,
    );
    return clamp01(
      (window.scrollY - journeyMaximum) / Math.max(1, window.innerHeight),
    );
  };

  const drawSurface = (progress: number) => {
    context.clearRect(0, 0, width, height);
    const pixelPath = new Path2D();

    cells.forEach((cell) => {
      if (progress <= cell.threshold) return;
      const age = smoothstep((progress - cell.threshold) / 0.24);
      const size = 1.5 + age * (gridSize + 0.7);
      const jitter = (1 - age) * gridSize * 0.34;
      const x =
        cell.x
        + (cell.secondaryNoise - 0.5) * jitter
        - size / 2;
      const y =
        cell.y
        + (cell.noise - 0.5) * jitter
        - size / 2;
      pixelPath.rect(x, y, size, size);
    });

    context.save();
    context.clip(pixelPath);
    context.fillStyle = "#f1efe9";
    context.fillRect(0, 0, width, height);
    const glow = context.createRadialGradient(
      width * 0.84,
      height * 0.13,
      0,
      width * 0.84,
      height * 0.13,
      Math.max(width, height) * 0.42,
    );
    glow.addColorStop(0, "rgba(200, 16, 46, 0.085)");
    glow.addColorStop(1, "rgba(200, 16, 46, 0)");
    context.fillStyle = glow;
    context.fillRect(0, 0, width, height);
    context.restore();
  };

  const drawText = (progress: number) => {
    const sampleSize = width <= 640 ? 4 : 5;
    const paths = new Map<string, Path2D>();

    textLayers.forEach((layer) => {
      const rect = layer.element.getBoundingClientRect();
      if (rect.bottom < 0 || rect.top > height) return;

      layer.pixels.forEach((pixel) => {
        if (progress <= pixel.threshold) return;
        const age = smoothstep((progress - pixel.threshold) / 0.2);
        const size = 1.2 + age * (sampleSize + 0.45);
        const jitter = (1 - age) * sampleSize * 0.8;
        const x =
          rect.left
          + pixel.x
          + (pixel.noise - 0.5) * jitter
          - size / 2;
        const y =
          rect.top
          + pixel.y
          + (0.5 - pixel.noise) * jitter
          - size / 2;
        const path = paths.get(pixel.color) ?? new Path2D();
        path.rect(x, y, size, size);
        paths.set(pixel.color, path);
      });
    });

    paths.forEach((path, color) => {
      context.fillStyle = color;
      context.fill(path);
    });
  };

  const render = () => {
    animationFrame = 0;
    if (destroyed) return;
    const progress = readProgress();
    const complete = progress >= 0.985;
    const active = progress > 0.002 && !complete;
    document.body.classList.toggle("is-marketing-entry-active", active);
    document.body.classList.toggle("is-marketing-entry-complete", complete);

    const copyProgress = smoothstep((progress - 0.2) / 0.62);
    impact.style.setProperty(
      "--entry-copy-opacity",
      copyProgress.toFixed(4),
    );

    if (complete) {
      context.clearRect(0, 0, width, height);
      return;
    }
    if (!active) {
      context.clearRect(0, 0, width, height);
      return;
    }
    drawSurface(progress);
    drawText(progress);
  };

  const scheduleRender = () => {
    if (animationFrame || destroyed) return;
    animationFrame = window.requestAnimationFrame(render);
  };

  resize();
  render();
  document.fonts.ready.then(() => {
    if (destroyed) return;
    rebuildTextLayers();
    scheduleRender();
  });
  window.addEventListener("scroll", scheduleRender, { passive: true });
  window.addEventListener("resize", resize, { passive: true });

  return {
    destroy() {
      destroyed = true;
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener("scroll", scheduleRender);
      window.removeEventListener("resize", resize);
      root.classList.remove("has-marketing-entry-dissolve");
      document.body.classList.remove(
        "is-marketing-entry-active",
        "is-marketing-entry-complete",
      );
      impact.style.removeProperty("--entry-copy-opacity");
      context.clearRect(0, 0, width, height);
    },
  };
}

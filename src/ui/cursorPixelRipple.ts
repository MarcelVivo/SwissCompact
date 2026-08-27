export interface CursorPixelRipple {
  destroy(): void;
}

interface WakePoint {
  x: number;
  y: number;
  bornAt: number;
  directionX: number;
  directionY: number;
  energy: number;
  sequence: number;
}

interface RgbColor {
  red: number;
  green: number;
  blue: number;
}

interface TextColorRegion {
  left: number;
  top: number;
  right: number;
  bottom: number;
  color: RgbColor;
}

interface ColorPath {
  color: string;
  path: Path2D;
}

interface GradientStop {
  color: RgbColor;
  position: number;
}

interface LinearGradientSurface {
  angle: number;
  stops: GradientStop[];
}

interface ImageSample {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

const wakeLifetime = 740;
const maximumWakePoints = 32;
const pixelGrid = 3;
const textBucketSize = 32;
const surfaceSampleSize = 9;
const opacityLevels = [0.42, 0.62, 0.82];

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function easeOutCubic(value: number): number {
  return 1 - Math.pow(1 - value, 3);
}

function parseColor(value: string): RgbColor | null {
  const channels = value.match(/[\d.]+/g)?.map(Number);
  if (!channels || channels.length < 3) return null;
  if (channels.length > 3 && channels[3] <= 0.02) return null;
  return {
    red: Math.round(channels[0]),
    green: Math.round(channels[1]),
    blue: Math.round(channels[2]),
  };
}

function textBucketKey(x: number, y: number): string {
  return `${Math.floor(x / textBucketSize)}:${Math.floor(y / textBucketSize)}`;
}

export function mountCursorPixelRipple(): CursorPixelRipple {
  const canvas = document.querySelector<HTMLCanvasElement>(
    ".marketing-cursor-ripple",
  );
  const context = canvas?.getContext("2d", { alpha: true });
  const precisePointer = window.matchMedia(
    "(hover: hover) and (pointer: fine)",
  );
  const reducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  );

  if (!canvas || !context || !precisePointer.matches || reducedMotion.matches) {
    return { destroy() {} };
  }

  const wake: WakePoint[] = [];
  const textBuckets = new Map<string, TextColorRegion[]>();
  const surfaceColorCache = new Map<string, RgbColor>();
  const elementColorCache = new WeakMap<Element, RgbColor>();
  const gradientCache = new WeakMap<Element, LinearGradientSurface | null>();
  const imageSampleCache = new WeakMap<HTMLImageElement, ImageSample>();
  const toneColorCache = new Map<string, string>();
  let animationFrame = 0;
  let lastPointerX = Number.NaN;
  let lastPointerY = Number.NaN;
  let lastPointerAt = 0;
  let lastSampleX = Number.NaN;
  let lastSampleY = Number.NaN;
  let lastSampleAt = 0;
  let previousDirectionX = 1;
  let previousDirectionY = 0;
  let sequence = 0;
  let width = window.innerWidth;
  let height = window.innerHeight;
  let colorMapDirty = true;

  const markColorMapDirty = () => {
    colorMapDirty = true;
    surfaceColorCache.clear();
  };

  const resize = () => {
    const ratio = Math.min(window.devicePixelRatio || 1, 1.75);
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    markColorMapDirty();
  };

  const addTextRegion = (region: TextColorRegion) => {
    const minimumX = Math.floor(region.left / textBucketSize);
    const maximumX = Math.floor(region.right / textBucketSize);
    const minimumY = Math.floor(region.top / textBucketSize);
    const maximumY = Math.floor(region.bottom / textBucketSize);

    for (let bucketX = minimumX; bucketX <= maximumX; bucketX += 1) {
      for (let bucketY = minimumY; bucketY <= maximumY; bucketY += 1) {
        const key = `${bucketX}:${bucketY}`;
        const regions = textBuckets.get(key) ?? [];
        regions.push(region);
        textBuckets.set(key, regions);
      }
    }
  };

  const rebuildTextColorMap = () => {
    colorMapDirty = false;
    textBuckets.clear();
    surfaceColorCache.clear();
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
    );
    const range = document.createRange();

    let node = walker.nextNode();
    while (node) {
      const text = node.nodeValue ?? "";
      const parent = node.parentElement;

      if (
        parent
        && text.trim()
        && !parent.closest("script, style, noscript")
        && parent.checkVisibility({
          checkOpacity: true,
          checkVisibilityCSS: true,
        })
      ) {
        range.selectNodeContents(node);
        const bounds = range.getBoundingClientRect();
        if (
          bounds.bottom >= 0
          && bounds.top <= height
          && bounds.right >= 0
          && bounds.left <= width
        ) {
          const color = parseColor(getComputedStyle(parent).color);
          if (color) {
            for (let index = 0; index < text.length; index += 1) {
              if (/\s/.test(text[index])) continue;
              range.setStart(node, index);
              range.setEnd(node, index + 1);
              Array.from(range.getClientRects()).forEach((rect) => {
                if (
                  rect.width <= 0
                  || rect.height <= 0
                  || rect.bottom < 0
                  || rect.top > height
                  || rect.right < 0
                  || rect.left > width
                ) {
                  return;
                }
                addTextRegion({
                  left: rect.left,
                  top: rect.top,
                  right: rect.right,
                  bottom: rect.bottom,
                  color,
                });
              });
            }
          }
        }
      }
      node = walker.nextNode();
    }
    range.detach();
  };

  const textColorAt = (x: number, y: number): RgbColor | null => {
    const regions = textBuckets.get(textBucketKey(x, y));
    if (!regions) return null;

    for (let index = regions.length - 1; index >= 0; index -= 1) {
      const region = regions[index];
      if (
        x >= region.left
        && x <= region.right
        && y >= region.top
        && y <= region.bottom
      ) {
        return region.color;
      }
    }
    return null;
  };

  const splitBackgroundLayers = (backgroundImage: string): string[] => {
    const layers: string[] = [];
    let depth = 0;
    let start = 0;

    for (let index = 0; index < backgroundImage.length; index += 1) {
      const character = backgroundImage[index];
      if (character === "(") depth += 1;
      else if (character === ")") depth -= 1;
      else if (character === "," && depth === 0) {
        layers.push(backgroundImage.slice(start, index).trim());
        start = index + 1;
      }
    }
    layers.push(backgroundImage.slice(start).trim());
    return layers;
  };

  const parseLinearGradient = (
    element: Element,
    backgroundImage: string,
  ): LinearGradientSurface | null => {
    if (gradientCache.has(element)) return gradientCache.get(element) ?? null;
    const layer = splitBackgroundLayers(backgroundImage)
      .reverse()
      .find((candidate) => candidate.startsWith("linear-gradient"));
    if (!layer) {
      gradientCache.set(element, null);
      return null;
    }

    const angle = Number(layer.match(/linear-gradient\(\s*([-\d.]+)deg/)?.[1] ?? 180);
    const matches = Array.from(
      layer.matchAll(/(rgba?\([^)]+\))(?:\s+([-\d.]+)%)?/g),
    );
    const parsed = matches
      .map((match, index) => ({
        color: parseColor(match[1]),
        position: match[2] === undefined
          ? (matches.length <= 1 ? 0 : index / (matches.length - 1))
          : Number(match[2]) / 100,
      }))
      .filter(
        (stop): stop is GradientStop => stop.color !== null,
      );

    if (parsed.length < 2) {
      gradientCache.set(element, null);
      return null;
    }

    const gradient = { angle, stops: parsed };
    gradientCache.set(element, gradient);
    return gradient;
  };

  const gradientColorAt = (
    element: Element,
    gradient: LinearGradientSurface,
    x: number,
    y: number,
  ): RgbColor => {
    const rect = element.getBoundingClientRect();
    const radians = gradient.angle * Math.PI / 180;
    const directionX = Math.sin(radians);
    const directionY = -Math.cos(radians);
    const extent =
      Math.abs(directionX) * rect.width / 2
      + Math.abs(directionY) * rect.height / 2;
    const projection =
      (x - (rect.left + rect.width / 2)) * directionX
      + (y - (rect.top + rect.height / 2)) * directionY;
    const position = extent > 0 ? clamp01((projection + extent) / (2 * extent)) : 0;

    let left = gradient.stops[0];
    let right = gradient.stops[gradient.stops.length - 1];
    for (let index = 0; index < gradient.stops.length - 1; index += 1) {
      if (
        position >= gradient.stops[index].position
        && position <= gradient.stops[index + 1].position
      ) {
        left = gradient.stops[index];
        right = gradient.stops[index + 1];
        break;
      }
    }

    const distance = Math.max(0.0001, right.position - left.position);
    const mix = clamp01((position - left.position) / distance);
    return {
      red: Math.round(left.color.red + (right.color.red - left.color.red) * mix),
      green: Math.round(
        left.color.green + (right.color.green - left.color.green) * mix,
      ),
      blue: Math.round(left.color.blue + (right.color.blue - left.color.blue) * mix),
    };
  };

  const elementSurfaceColor = (
    element: Element | null,
    x: number,
    y: number,
  ): RgbColor => {
    if (!element) return { red: 7, green: 7, blue: 8 };
    const cached = elementColorCache.get(element);
    if (cached) return cached;

    let current: Element | null = element;
    while (current) {
      const style = getComputedStyle(current);
      const color = parseColor(style.backgroundColor);
      if (color) {
        elementColorCache.set(element, color);
        return color;
      }
      if (style.backgroundImage !== "none") {
        const gradient = parseLinearGradient(current, style.backgroundImage);
        if (gradient) return gradientColorAt(current, gradient, x, y);
      }
      current = current.parentElement;
    }

    const fallback = { red: 7, green: 7, blue: 8 };
    elementColorCache.set(element, fallback);
    return fallback;
  };

  const colorAt = (x: number, y: number): RgbColor => {
    const textColor = textColorAt(x, y);
    if (textColor) return textColor;

    const key = `${Math.floor(x / surfaceSampleSize)}:${Math.floor(y / surfaceSampleSize)}`;
    const cached = surfaceColorCache.get(key);
    if (cached) return cached;
    const element = document.elementFromPoint(x, y);
    const industryCard = element?.closest<HTMLElement>(".industry-card");
    const activeIndustryImage = industryCard?.classList.contains("is-secondary")
      ? "secondary"
      : "primary";
    const industryImage = industryCard?.querySelector<HTMLImageElement>(
      `[data-industry-image="${activeIndustryImage}"]`,
    );
    let imageColor: RgbColor | null = null;
    if (
      industryCard
      && industryImage
      && industryImage.complete
      && industryImage.naturalWidth > 0
    ) {
      let sample = imageSampleCache.get(industryImage);
      if (!sample) {
        const sampleCanvas = document.createElement("canvas");
        sampleCanvas.width = 180;
        sampleCanvas.height = Math.max(
          1,
          Math.round(
            sampleCanvas.width
            * industryImage.naturalHeight
            / industryImage.naturalWidth,
          ),
        );
        const sampleContext = sampleCanvas.getContext("2d", {
          alpha: false,
          willReadFrequently: true,
        });
        if (sampleContext) {
          sampleContext.drawImage(
            industryImage,
            0,
            0,
            sampleCanvas.width,
            sampleCanvas.height,
          );
          try {
            sample = {
              data: sampleContext.getImageData(
                0,
                0,
                sampleCanvas.width,
                sampleCanvas.height,
              ).data,
              width: sampleCanvas.width,
              height: sampleCanvas.height,
            };
            imageSampleCache.set(industryImage, sample);
          } catch {
            sample = undefined;
          }
        }
      }
      if (sample) {
        const rect = industryImage.getBoundingClientRect();
        const scale = Math.max(
          rect.width / industryImage.naturalWidth,
          rect.height / industryImage.naturalHeight,
        );
        const renderedWidth = industryImage.naturalWidth * scale;
        const renderedHeight = industryImage.naturalHeight * scale;
        const offsetX = (rect.width - renderedWidth) / 2;
        const offsetY = (rect.height - renderedHeight) / 2;
        const sourceX = clamp01(
          (x - rect.left - offsetX) / renderedWidth,
        );
        const sourceY = clamp01(
          (y - rect.top - offsetY) / renderedHeight,
        );
        const sampleX = Math.min(
          sample.width - 1,
          Math.floor(sourceX * sample.width),
        );
        const sampleY = Math.min(
          sample.height - 1,
          Math.floor(sourceY * sample.height),
        );
        const index = (sampleY * sample.width + sampleX) * 4;
        const verticalPosition = clamp01(
          (y - industryCard.getBoundingClientRect().top)
          / industryCard.getBoundingClientRect().height,
        );
        const overlay = 0.08 + clamp01(
          (verticalPosition - 0.38) / 0.62,
        ) * 0.7;
        imageColor = {
          red: Math.round(sample.data[index] * (1 - overlay)),
          green: Math.round(sample.data[index + 1] * (1 - overlay)),
          blue: Math.round(sample.data[index + 2] * (1 - overlay)),
        };
      }
    }
    const color = imageColor ?? elementSurfaceColor(element, x, y);
    surfaceColorCache.set(key, color);
    return color;
  };

  const adjustedColor = (
    base: RgbColor,
    toneIndex: number,
    opacityIndex: number,
  ): string => {
    const key = [
      base.red,
      base.green,
      base.blue,
      toneIndex,
      opacityIndex,
    ].join(":");
    const cached = toneColorCache.get(key);
    if (cached) return cached;

    const luminance =
      (base.red * 0.2126 + base.green * 0.7152 + base.blue * 0.0722) / 255;
    let red: number;
    let green: number;
    let blue: number;

    if (toneIndex === 0) {
      const amount = luminance > 0.84 ? 0 : luminance < 0.1 ? 0.19 : 0.13;
      red = base.red + (255 - base.red) * amount;
      green = base.green + (255 - base.green) * amount;
      blue = base.blue + (255 - base.blue) * amount;
    } else {
      const factor = luminance > 0.84 ? 0.91 : luminance < 0.1 ? 0.62 : 0.82;
      red = base.red * factor;
      green = base.green * factor;
      blue = base.blue * factor;
    }

    const color = `rgba(${Math.round(red)}, ${Math.round(green)}, ${Math.round(blue)}, ${opacityLevels[opacityIndex]})`;
    toneColorCache.set(key, color);
    return color;
  };

  const appendPixel = (
    paths: Map<string, ColorPath>,
    toneIndex: number,
    intensity: number,
    x: number,
    y: number,
    baseSize: number,
  ) => {
    if (intensity < 0.055 || x < 0 || y < 0 || x > width || y > height) {
      return;
    }

    const opacityIndex = Math.min(
      opacityLevels.length - 1,
      Math.floor(clamp01(intensity) * opacityLevels.length),
    );
    const color = adjustedColor(colorAt(x, y), toneIndex, opacityIndex);
    const size = baseSize + (intensity > 0.52 ? 0.5 : 0);
    const pixelX = Math.round(x / pixelGrid) * pixelGrid;
    const pixelY = Math.round(y / pixelGrid) * pixelGrid;
    const group = paths.get(color) ?? { color, path: new Path2D() };
    group.path.rect(
      pixelX - size / 2,
      pixelY - size / 2,
      size,
      size,
    );
    paths.set(color, group);
  };

  const render = (now: number) => {
    animationFrame = 0;
    context.clearRect(0, 0, width, height);
    if (colorMapDirty) rebuildTextColorMap();
    const paths = new Map<string, ColorPath>();

    for (let index = wake.length - 1; index >= 0; index -= 1) {
      const point = wake[index];
      const progress = (now - point.bornAt) / wakeLifetime;
      if (progress >= 1) {
        wake.splice(index, 1);
        continue;
      }

      const eased = easeOutCubic(Math.max(0, progress));
      const fadeIn = Math.min(1, progress * 10);
      const fadeOut = Math.pow(1 - progress, 1.15);
      const strength = fadeIn * fadeOut * point.energy;
      const perpendicularX = -point.directionY;
      const perpendicularY = point.directionX;
      const backwardDrift = eased * 6;
      const wavePhase = point.sequence * 0.72 - progress * 7.5;

      for (let band = 0; band < 4; band += 1) {
        const spread = 1.5 + eased * 32 + band * 4.5;
        const surfaceWave = Math.sin(wavePhase + band * 1.15) * (1.5 + eased * 2);
        const bandStrength = strength * (0.94 - band * 0.16);

        for (const side of [-1, 1]) {
          const lateral = side * (spread + surfaceWave);
          const x =
            point.x
            - point.directionX * backwardDrift
            + perpendicularX * lateral;
          const y =
            point.y
            - point.directionY * backwardDrift
            + perpendicularY * lateral;
          const variation = Math.sin(
            point.sequence * 12.9898 + band * 31.177 + side * 8.313,
          );

          if (variation < -0.9 + band * 0.08) continue;
          appendPixel(
            paths,
            (point.sequence + band + (side > 0 ? 1 : 0)) % 2,
            bandStrength * (0.9 + variation * 0.1),
            x,
            y,
            band === 0 && variation > 0.68 ? 2.5 : 1.5,
          );
        }
      }

      if (progress < 0.42) {
        const coreStrength = strength * (1 - progress / 0.42) * 0.52;
        appendPixel(
          paths,
          point.sequence % 2,
          coreStrength,
          point.x - point.directionX * backwardDrift * 0.35,
          point.y - point.directionY * backwardDrift * 0.35,
          1.5,
        );
      }
    }

    paths.forEach((group) => {
      context.fillStyle = group.color;
      context.fill(group.path);
    });

    if (wake.length > 0 && document.body.classList.contains("is-marketing-view")) {
      animationFrame = window.requestAnimationFrame(render);
    } else {
      context.clearRect(0, 0, width, height);
    }
  };

  const requestRender = () => {
    if (!animationFrame) animationFrame = window.requestAnimationFrame(render);
  };

  const pushWakePoint = (
    x: number,
    y: number,
    bornAt: number,
    directionX: number,
    directionY: number,
    energy: number,
  ) => {
    wake.push({
      x,
      y,
      bornAt,
      directionX,
      directionY,
      energy,
      sequence: sequence += 1,
    });
    if (wake.length > maximumWakePoints) wake.shift();
  };

  const handlePointerMove = (event: PointerEvent) => {
    if (!document.body.classList.contains("is-marketing-view")) {
      lastPointerX = event.clientX;
      lastPointerY = event.clientY;
      lastSampleX = Number.NaN;
      lastSampleY = Number.NaN;
      return;
    }

    const now = performance.now();
    if (!Number.isFinite(lastPointerX)) {
      lastPointerX = event.clientX;
      lastPointerY = event.clientY;
      lastPointerAt = now;
      lastSampleX = event.clientX;
      lastSampleY = event.clientY;
      lastSampleAt = now;
      return;
    }

    const movementX = event.clientX - lastPointerX;
    const movementY = event.clientY - lastPointerY;
    const movementDistance = Math.hypot(movementX, movementY);
    const elapsed = Math.max(1, now - lastPointerAt);

    if (movementDistance > 0.5) {
      previousDirectionX = movementX / movementDistance;
      previousDirectionY = movementY / movementDistance;
    }

    lastPointerX = event.clientX;
    lastPointerY = event.clientY;
    lastPointerAt = now;

    if (!Number.isFinite(lastSampleX)) {
      lastSampleX = event.clientX;
      lastSampleY = event.clientY;
      lastSampleAt = now;
      return;
    }

    const sampleDistance = Math.hypot(
      event.clientX - lastSampleX,
      event.clientY - lastSampleY,
    );
    if (sampleDistance < 8 && now - lastSampleAt < 24) return;

    const startX = lastSampleX;
    const startY = lastSampleY;
    const steps = Math.min(4, Math.max(1, Math.ceil(sampleDistance / 11)));
    const energy = clamp01(0.48 + movementDistance / elapsed * 0.24);

    for (let step = 1; step <= steps; step += 1) {
      const interpolation = step / steps;
      pushWakePoint(
        startX + (event.clientX - startX) * interpolation,
        startY + (event.clientY - startY) * interpolation,
        now - (steps - step) * 5,
        previousDirectionX,
        previousDirectionY,
        energy,
      );
    }

    lastSampleX = event.clientX;
    lastSampleY = event.clientY;
    lastSampleAt = now;
    requestRender();
  };

  const handleVisibilityChange = () => {
    if (!document.hidden) return;
    wake.length = 0;
    if (animationFrame) window.cancelAnimationFrame(animationFrame);
    animationFrame = 0;
    context.clearRect(0, 0, width, height);
  };

  const mutationObserver = new MutationObserver(markColorMapDirty);
  const marketingContent = document.querySelector("#marketing-content");
  if (marketingContent) {
    mutationObserver.observe(marketingContent, {
      attributes: true,
      attributeFilter: ["class"],
      childList: true,
      characterData: true,
      subtree: true,
    });
  }

  resize();
  window.addEventListener("resize", resize, { passive: true });
  window.addEventListener("scroll", markColorMapDirty, { passive: true });
  window.addEventListener("pointermove", handlePointerMove, { passive: true });
  document.addEventListener("animationend", markColorMapDirty, true);
  document.addEventListener("transitionend", markColorMapDirty, true);
  document.addEventListener("visibilitychange", handleVisibilityChange);

  return {
    destroy() {
      mutationObserver.disconnect();
      window.removeEventListener("resize", resize);
      window.removeEventListener("scroll", markColorMapDirty);
      window.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("animationend", markColorMapDirty, true);
      document.removeEventListener("transitionend", markColorMapDirty, true);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
      context.clearRect(0, 0, width, height);
    },
  };
}

export interface ScrollJourneyOptions {
  chapterCount: number;
  scrollElement?: HTMLElement;
  onStationChange: (index: number) => void;
  onProgress: (progress: number) => void;
}

export interface ScrollJourney {
  destroy: () => void;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function readScrollProgress(scrollElement?: HTMLElement): number {
  const maximum = Math.max(
    1,
    scrollElement
      ? scrollElement.offsetHeight - window.innerHeight
      : document.documentElement.scrollHeight - window.innerHeight,
  );
  return clamp01(window.scrollY / maximum);
}

export function createScrollJourney(options: ScrollJourneyOptions): ScrollJourney {
  let targetProgress = readScrollProgress(options.scrollElement);
  let currentProgress = targetProgress;
  let activeStation = -1;
  let animationFrame = 0;
  let previousTime = 0;
  let destroyed = false;

  const scheduleRender = () => {
    if (animationFrame || destroyed) return;
    animationFrame = window.requestAnimationFrame(render);
  };

  const handleScroll = () => {
    targetProgress = readScrollProgress(options.scrollElement);
    scheduleRender();
  };

  const render = (time: number) => {
    if (destroyed) return;
    animationFrame = 0;
    const delta = previousTime === 0
      ? 1 / 60
      : Math.min(Math.max((time - previousTime) / 1000, 0), 0.05);
    previousTime = time;
    const smoothing = 1 - Math.exp(-delta * 3.4);
    currentProgress += (targetProgress - currentProgress) * smoothing;
    const settled = Math.abs(targetProgress - currentProgress) < 0.000001;
    if (settled) {
      currentProgress = targetProgress;
    }

    const journey = Math.min(
      options.chapterCount - Number.EPSILON,
      currentProgress * options.chapterCount,
    );
    const stationIndex = Math.min(
      options.chapterCount - 1,
      Math.floor(journey),
    );
    if (stationIndex !== activeStation) {
      activeStation = stationIndex;
      options.onStationChange(activeStation);
    }

    options.onProgress(currentProgress);
    if (settled) {
      previousTime = 0;
    } else {
      scheduleRender();
    }
  };

  window.addEventListener("scroll", handleScroll, { passive: true });
  scheduleRender();

  return {
    destroy() {
      destroyed = true;
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener("scroll", handleScroll);
    },
  };
}

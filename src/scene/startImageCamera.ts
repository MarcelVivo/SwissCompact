export interface StartImageCameraOptions {
  container: HTMLElement;
  media: HTMLElement;
  scrollMedia?: HTMLElement | null;
  scrollVideo?: HTMLVideoElement | null;
  copy?: HTMLElement | null;
  flare?: HTMLElement | null;
  progress: number;
  chapterCount: number;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function smoothstep(value: number): number {
  const clamped = clamp01(value);
  return clamped * clamped * (3 - 2 * clamped);
}

function coveredMediaPoint(
  sourceWidth: number,
  sourceHeight: number,
  sourceX: number,
  sourceY: number,
): { x: number; y: number } {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const showFullWidth = window.matchMedia(
    "(max-width: 640px) and (orientation: portrait)",
  ).matches;
  const mediaScale = showFullWidth
    ? Math.min(viewportWidth / sourceWidth, viewportHeight / sourceHeight)
    : Math.max(viewportWidth / sourceWidth, viewportHeight / sourceHeight);
  const mediaLeft = (viewportWidth - sourceWidth * mediaScale) * 0.5;
  const mediaTop = (viewportHeight - sourceHeight * mediaScale) * 0.5;
  return {
    x: mediaLeft + sourceX * mediaScale,
    y: mediaTop + sourceY * mediaScale,
  };
}

export function updateStartImageCamera({
  container,
  media,
  scrollMedia,
  scrollVideo,
  copy,
  flare,
  progress,
  chapterCount,
}: StartImageCameraOptions): void {
  const journey = clamp01(progress) * chapterCount;
  const chapterProgress = clamp01(journey);
  const portraitMobile = window.matchMedia(
    "(max-width: 640px) and (orientation: portrait)",
  ).matches;
  const scrollVideoReady = Boolean(
    scrollVideo
    && scrollVideo.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA,
  );
  const scrollBlend = scrollVideoReady
    ? smoothstep(chapterProgress / 0.055)
    : 0;

  // Das Startbild bleibt unverändert, bis der erste Scrollimpuls den Film übernimmt.
  media.style.transform = "none";
  media.style.opacity = (1 - scrollBlend).toFixed(4);
  if (scrollMedia) {
    scrollMedia.style.opacity = scrollBlend.toFixed(4);
    if (portraitMobile) {
      // Keep the complete 16:9 frame visible throughout the mobile chapter.
      // The desktop sun-focus zoom would otherwise crop both horizontal edges.
      scrollMedia.style.transformOrigin = "50% 50%";
      scrollMedia.style.transform = "none";
    } else {
      const sun = coveredMediaPoint(1916, 1080, 1120, 465);
      const focusProgress = smoothstep((chapterProgress - 0.82) / 0.165);
      const focusZoom = 1 + 5.6 * focusProgress ** 1.35;
      const translateX = (window.innerWidth * 0.5 - sun.x) * focusProgress;
      const translateY = (window.innerHeight * 0.5 - sun.y) * focusProgress;
      scrollMedia.style.transformOrigin = `${sun.x.toFixed(2)}px ${sun.y.toFixed(2)}px`;
      scrollMedia.style.transform = [
        `translate3d(${translateX.toFixed(2)}px, ${translateY.toFixed(2)}px, 0)`,
        `scale(${focusZoom.toFixed(5)})`,
      ].join(" ");
    }
  }

  if (copy) {
    const copyFade = smoothstep((journey - 0.045) / 0.18);
    const copyOpacity = (1 - copyFade) * (1 - scrollBlend);
    copy.style.opacity = copyOpacity.toFixed(4);
    copy.style.transform = `translate3d(0, ${(-18 * copyFade).toFixed(2)}px, 0)`;
    copy.style.pointerEvents = copyOpacity > 0.12 ? "auto" : "none";
  }

  if (flare) {
    const flareProgress = smoothstep((journey - 0.88) / 0.12);
    flare.style.opacity = flareProgress.toFixed(4);
    flare.style.transform = `scale(${(0.72 + flareProgress * 0.58).toFixed(4)})`;
  }

  // Der eigentliche Bildwechsel liegt kurz hinter der virtuellen Displayscheibe.
  const portalBlend = smoothstep((journey - 0.98) / 0.04);
  container.style.opacity = (1 - portalBlend).toFixed(4);
  container.style.visibility = portalBlend >= 0.999 ? "hidden" : "visible";
}

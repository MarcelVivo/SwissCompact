export interface ScrollVideoController {
  update: (progress: number, chapterCount: number, chapterIndex: number) => void;
  hold: () => void;
  destroy: () => void;
}

export interface ScrollVideoOptions {
  reverseProgress?: boolean;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function createScrollVideoController(
  video: HTMLVideoElement,
  options: ScrollVideoOptions = {},
): ScrollVideoController {
  let localProgress = 0;
  let targetTime = 0;
  let targetVelocity = 0;
  let lastUpdateTime = performance.now();
  let animationFrame = 0;
  let playPending = false;
  let held = false;
  let destroyed = false;

  video.muted = true;
  video.pause();

  const finalVideoTime = () => (
    Number.isFinite(video.duration) && video.duration > 0
      ? Math.max(0, video.duration - 0.001)
      : 0
  );

  const ensurePlaying = () => {
    if (!video.paused || playPending || destroyed) return;
    playPending = true;
    void video.play()
      .catch(() => undefined)
      .finally(() => {
        playPending = false;
      });
  };

  const applyFrame = () => {
    animationFrame = 0;
    if (
      destroyed
      || video.readyState < HTMLMediaElement.HAVE_METADATA
      || !Number.isFinite(video.duration)
      || video.duration <= 0
    ) {
      return;
    }

    const difference = targetTime - video.currentTime;

    if (targetVelocity > 0.05) {
      if (video.seeking) return;
      if (difference > 0.42 || difference < -0.12) {
        if (!video.paused) video.pause();
        video.currentTime = targetTime;
        return;
      }

      video.playbackRate = Math.min(8, Math.max(0.25, targetVelocity));
      ensurePlaying();
      return;
    }

    if (!video.paused) video.pause();
    if (!video.seeking && Math.abs(difference) > 1 / 30) {
      video.currentTime = targetTime;
    }
  };

  const scheduleFrame = () => {
    if (animationFrame || destroyed) return;
    animationFrame = window.requestAnimationFrame(applyFrame);
  };

  const handleMetadata = () => {
    targetTime = localProgress * finalVideoTime();
    scheduleFrame();
  };
  const handleLoadedFrame = () => video.classList.add("is-ready");

  video.addEventListener("loadedmetadata", handleMetadata);
  video.addEventListener("loadeddata", handleLoadedFrame);
  if (video.readyState >= HTMLMediaElement.HAVE_METADATA) scheduleFrame();
  if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) handleLoadedFrame();

  return {
    update(progress, chapterCount, chapterIndex) {
      if (held) {
        held = false;
        targetTime = video.currentTime;
        targetVelocity = 0;
        lastUpdateTime = performance.now();
      }

      const journey = clamp01(progress) * chapterCount;
      const chapterProgress = clamp01(journey - chapterIndex);
      localProgress = options.reverseProgress
        ? 1 - chapterProgress
        : chapterProgress;

      const now = performance.now();
      const elapsed = Math.max(1 / 240, (now - lastUpdateTime) / 1000);
      const nextTargetTime = localProgress * finalVideoTime();
      const targetChanged = Math.abs(nextTargetTime - targetTime) > 1 / 1000;
      targetVelocity = (nextTargetTime - targetTime) / elapsed;
      targetTime = nextTargetTime;
      lastUpdateTime = now;
      if (targetChanged || !video.paused || video.seeking) scheduleFrame();
    },
    hold() {
      if (destroyed || held) return;
      held = true;
      if (animationFrame) {
        window.cancelAnimationFrame(animationFrame);
        animationFrame = 0;
      }
      targetTime = video.currentTime;
      targetVelocity = 0;
      video.playbackRate = 1;
      if (!video.paused) video.pause();
    },
    destroy() {
      destroyed = true;
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
      video.removeEventListener("loadedmetadata", handleMetadata);
      video.removeEventListener("loadeddata", handleLoadedFrame);
      video.pause();
    },
  };
}

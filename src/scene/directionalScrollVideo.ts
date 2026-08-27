import {
  createScrollVideoController,
  type ScrollVideoController,
} from "./scrollVideo";

export interface DirectionalScrollVideoController {
  update: (
    progress: number,
    chapterCount: number,
    scrollingBackward: boolean,
  ) => void;
  destroy: () => void;
}

interface DirectionalScrollVideoOptions {
  media: HTMLElement;
  forwardVideo: HTMLVideoElement;
  reverseVideo: HTMLVideoElement;
  chapterIndex: number;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function targetTime(video: HTMLVideoElement, progress: number): number {
  if (!Number.isFinite(video.duration) || video.duration <= 0) return 0;
  return clamp01(progress) * Math.max(0, video.duration - 0.001);
}

function frameReady(video: HTMLVideoElement, target: number): boolean {
  return video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
    && !video.seeking
    && Math.abs(video.currentTime - target) < 0.09;
}

export function createDirectionalScrollVideoController({
  media,
  forwardVideo,
  reverseVideo,
  chapterIndex,
}: DirectionalScrollVideoOptions): DirectionalScrollVideoController {
  const forwardController: ScrollVideoController =
    createScrollVideoController(forwardVideo);
  const reverseController: ScrollVideoController =
    createScrollVideoController(reverseVideo, { reverseProgress: true });

  return {
    update(progress, chapterCount, scrollingBackward) {
      const localJourney = clamp01(progress) * chapterCount - chapterIndex;
      if (localJourney < -0.06 || localJourney > 1.06) {
        forwardController.hold();
        reverseController.hold();
        return;
      }
      const localProgress = clamp01(localJourney);

      if (scrollingBackward) {
        forwardController.hold();
        reverseController.update(progress, chapterCount, chapterIndex);
        if (frameReady(reverseVideo, targetTime(reverseVideo, 1 - localProgress))) {
          media.classList.add("is-reversing");
        }
        return;
      }

      reverseController.hold();
      forwardController.update(progress, chapterCount, chapterIndex);
      if (frameReady(forwardVideo, targetTime(forwardVideo, localProgress))) {
        media.classList.remove("is-reversing");
      }
    },
    destroy() {
      forwardController.destroy();
      reverseController.destroy();
    },
  };
}

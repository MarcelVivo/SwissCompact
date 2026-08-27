export interface ScrollMediaAsset {
  chapterIndex: number;
  forwardVideo: HTMLVideoElement;
  forwardUrl: string;
  compactForwardUrl?: string;
  reverseVideo: HTMLVideoElement;
  reverseUrl: string;
  compactReverseUrl?: string;
}

export interface ScrollMediaPreloader {
  update: (journey: number, scrollingBackward: boolean) => void;
  destroy: () => void;
}

type PreloadMode = "none" | "metadata" | "auto";

const preloadRank: Record<PreloadMode, number> = {
  none: 0,
  metadata: 1,
  auto: 2,
};

interface ManagedVideo {
  element: HTMLVideoElement;
  url: string;
}

interface ManagedAsset {
  chapterIndex: number;
  forward: ManagedVideo;
  reverse: ManagedVideo;
}

function attachVideo(video: ManagedVideo, mode: PreloadMode): void {
  const { element, url } = video;
  const alreadyAttached = element.dataset.mediaAttached === "true";
  const previousMode = (element.dataset.mediaPreload as PreloadMode | undefined)
    ?? "none";

  if (preloadRank[previousMode] >= preloadRank[mode]) return;
  element.dataset.mediaPreload = mode;
  element.preload = mode;
  if (mode === "none") return;
  if (alreadyAttached) return;

  element.dataset.mediaAttached = "true";
  element.src = url;
  element.load();
}

function prepareAsset(
  asset: ManagedAsset,
  mode: PreloadMode,
  scrollingBackward: boolean,
): void {
  const primary = scrollingBackward ? asset.reverse : asset.forward;
  const secondary = scrollingBackward ? asset.forward : asset.reverse;

  attachVideo(primary, mode);
  attachVideo(secondary, mode === "auto" ? "metadata" : mode);
}

function connectionIsConstrained(): boolean {
  const connection = (
    navigator as Navigator & {
      connection?: { effectiveType?: string; saveData?: boolean };
    }
  ).connection;

  return Boolean(
    connection?.saveData
    || connection?.effectiveType === "slow-2g"
    || connection?.effectiveType === "2g",
  );
}

export function createScrollMediaPreloader(
  assets: ScrollMediaAsset[],
): ScrollMediaPreloader {
  const constrainedConnection = connectionIsConstrained();
  const useCompactMedia = constrainedConnection
    || window.matchMedia("(max-width: 900px)").matches;
  const managedAssets: ManagedAsset[] = assets
    .map((asset) => ({
      chapterIndex: asset.chapterIndex,
      forward: {
        element: asset.forwardVideo,
        url: useCompactMedia
          ? asset.compactForwardUrl ?? asset.forwardUrl
          : asset.forwardUrl,
      },
      reverse: {
        element: asset.reverseVideo,
        url: useCompactMedia
          ? asset.compactReverseUrl ?? asset.reverseUrl
          : asset.reverseUrl,
      },
    }))
    .sort((left, right) => left.chapterIndex - right.chapterIndex);
  let previousChapter = -1;
  let previousDirection = false;
  let destroyed = false;

  managedAssets.forEach((asset) => {
    [asset.forward.element, asset.reverse.element].forEach((video) => {
      video.muted = true;
      video.playsInline = true;
      video.preload = "none";
      video.setAttribute("webkit-playsinline", "");
    });
  });

  const update = (journey: number, scrollingBackward: boolean) => {
    if (destroyed || managedAssets.length === 0) return;

    const maximumChapter = managedAssets[managedAssets.length - 1].chapterIndex;
    const activeChapter = Math.min(
      maximumChapter,
      Math.max(0, Math.floor(journey)),
    );
    if (
      activeChapter === previousChapter
      && scrollingBackward === previousDirection
    ) {
      return;
    }
    previousChapter = activeChapter;
    previousDirection = scrollingBackward;

    managedAssets.forEach((asset) => {
      const distance = asset.chapterIndex - activeChapter;
      const directionalDistance = scrollingBackward ? -distance : distance;

      if (distance === 0) {
        prepareAsset(asset, "auto", scrollingBackward);
      } else if (
        directionalDistance === 1
        || (!constrainedConnection && directionalDistance === 2)
      ) {
        prepareAsset(asset, "auto", scrollingBackward);
      } else if (
        Math.abs(distance) === 1
        || (!constrainedConnection && Math.abs(distance) === 2)
      ) {
        prepareAsset(asset, "metadata", scrollingBackward);
      }
    });
  };

  update(0, false);

  return {
    update,
    destroy() {
      destroyed = true;
      managedAssets.forEach((asset) => {
        asset.forward.element.pause();
        asset.reverse.element.pause();
      });
    },
  };
}

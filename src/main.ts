import "./styles.css";
import startImageUrl from "../public/3DPictures/Stationen/Station1Berg/StationBerg.jpg?url";
import secondSceneImageUrl from "../public/3DPictures/Stationen/Station2Schuhgeschaeft/Schuhgeschaeft.jpg?url";
import { stations } from "./stations";
import { createDirectionalScrollVideoController } from "./scene/directionalScrollVideo";
import {
  createScrollMediaPreloader,
  type ScrollMediaAsset,
} from "./scene/mediaPreloader";
import { updatePhotographicScene } from "./scene/photographicScene";
import { createScrollJourney } from "./scene/scrollJourney";
import { createScrollVideoController } from "./scene/scrollVideo";
import { updateStartImageCamera } from "./scene/startImageCamera";
import { mountOverlays } from "./ui/overlays";
import { mountLazyGastronomyShowroom } from "./ui/lazyGastronomyShowroom";
import { mountImpactDetails } from "./ui/impactDetails";
import { mountImpactScenes } from "./ui/impactScenes";
import { mountMarketingEntryDissolve } from "./ui/marketingEntryDissolve";
import { mountMediaStudioDetails } from "./ui/mediaStudioDetails";
import { mountPictograms } from "./ui/pictograms";
import { mountProjectSteps } from "./ui/projectSteps";
import { mountScrollReveal } from "./ui/scrollReveal";
import { mountSiteNavigation } from "./ui/siteNavigation";
import { mountSolutionFinderScenes } from "./ui/solutionFinderScenes";
import { mountSalesAssistant } from "./ui/salesAssistant";
import { mountShowroomFunnel } from "./ui/showroomFunnel";
import { registerServiceWorker } from "./pwa/registerServiceWorker";
import { mountInstallPrompt } from "./pwa/installPrompt";

registerServiceWorker({ scope: "/" });
mountInstallPrompt("[data-pwa-install]");

const firstSceneVideoUrl = "/media/station1-scroll-scene.mp4";
const firstSceneReverseVideoUrl = "/media/station1-scroll-scene-reverse.mp4";
const secondSceneVideoUrl = "/media/station2-shoeshop02.mp4";
const secondSceneReverseVideoUrl = "/media/station2-shoeshop02-reverse.mp4";
const thirdSceneVideoUrl = "/media/station3-restaurant03.mp4";
const thirdSceneReverseVideoUrl = "/media/station3-restaurant03-reverse.mp4";
const fourthSceneVideoUrl = "/media/station4-conference03.mp4";
const fourthSceneReverseVideoUrl = "/media/station4-conference03-reverse.mp4";
const fifthSceneVideoUrl = "/media/station5-retail02.mp4";
const fifthSceneReverseVideoUrl = "/media/station5-retail02-reverse.mp4";
const sixthSceneVideoUrl = "/media/station6-ledfilm01.mp4";
const sixthSceneReverseVideoUrl = "/media/station6-ledfilm01-reverse.mp4";
const seventhSceneVideoUrl = "/media/station7-cinema01.mp4";
const seventhSceneReverseVideoUrl = "/media/station7-cinema01-reverse.mp4";
const eighthSceneVideoUrl = "/media/station8-museum01.mp4";
const eighthSceneReverseVideoUrl = "/media/station8-museum01-reverse.mp4";
const ninthSceneVideoUrl = "/media/station9-hotel01.mp4";
const ninthSceneReverseVideoUrl = "/media/station9-hotel01-reverse.mp4";
const tenthSceneVideoUrl = "/media/station10-beautysalon01.mp4";
const tenthSceneReverseVideoUrl = "/media/station10-beautysalon01-reverse.mp4";
const eleventhSceneVideoUrl = "/media/station11-skipanorama01.mp4";
const eleventhSceneReverseVideoUrl = "/media/station11-skipanorama01-reverse.mp4";

const ui = mountOverlays(stations);
const siteNavigation = mountSiteNavigation();
const scrollReveal = mountScrollReveal();
const marketingEntryDissolve = mountMarketingEntryDissolve();
const mediaStudioDetails = mountMediaStudioDetails();
const impactDetails = mountImpactDetails();
const impactScenes = mountImpactScenes();
const solutionFinderScenes = mountSolutionFinderScenes();
const gastronomyShowroom = mountLazyGastronomyShowroom();
const salesAssistant = mountSalesAssistant(gastronomyShowroom);
const showroomFunnel = mountShowroomFunnel(gastronomyShowroom);
const pictograms = mountPictograms();
const projectSteps = mountProjectSteps();
const journeyScroller = document.querySelector<HTMLElement>("#scroller");
const secondScene = document.querySelector<HTMLElement>("#scene-two");
const secondSceneMedia = secondScene?.querySelector<HTMLElement>(".photographic-scene__media");
const secondSceneImage = secondScene?.querySelector<HTMLImageElement>("img");
const secondSceneVideo = secondScene?.querySelector<HTMLVideoElement>(
  ".photographic-scene__video--station-two",
);
const secondSceneReverseVideo = secondScene?.querySelector<HTMLVideoElement>(
  ".photographic-scene__video--station-two-reverse",
);
const thirdScene = document.querySelector<HTMLElement>("#scene-three");
const thirdSceneMedia = thirdScene?.querySelector<HTMLElement>(".photographic-scene__media");
const thirdSceneVideo = thirdScene?.querySelector<HTMLVideoElement>(
  ".photographic-scene__video--station-three",
);
const thirdSceneReverseVideo = thirdScene?.querySelector<HTMLVideoElement>(
  ".photographic-scene__video--station-three-reverse",
);
const fourthScene = document.querySelector<HTMLElement>("#scene-four");
const fourthSceneMedia = fourthScene?.querySelector<HTMLElement>(".photographic-scene__media");
const fourthSceneVideo = fourthScene?.querySelector<HTMLVideoElement>(
  ".photographic-scene__video--station-four",
);
const fourthSceneReverseVideo = fourthScene?.querySelector<HTMLVideoElement>(
  ".photographic-scene__video--station-four-reverse",
);
const fifthScene = document.querySelector<HTMLElement>("#scene-five");
const fifthSceneMedia = fifthScene?.querySelector<HTMLElement>(".photographic-scene__media");
const fifthSceneVideo = fifthScene?.querySelector<HTMLVideoElement>(
  ".photographic-scene__video--station-five",
);
const fifthSceneReverseVideo = fifthScene?.querySelector<HTMLVideoElement>(
  ".photographic-scene__video--station-five-reverse",
);
const sixthScene = document.querySelector<HTMLElement>("#scene-six");
const sixthSceneMedia = sixthScene?.querySelector<HTMLElement>(".photographic-scene__media");
const sixthSceneVideo = sixthScene?.querySelector<HTMLVideoElement>(
  ".photographic-scene__video--station-six",
);
const sixthSceneReverseVideo = sixthScene?.querySelector<HTMLVideoElement>(
  ".photographic-scene__video--station-six-reverse",
);
const seventhScene = document.querySelector<HTMLElement>("#scene-seven");
const seventhSceneMedia = seventhScene?.querySelector<HTMLElement>(".photographic-scene__media");
const seventhSceneVideo = seventhScene?.querySelector<HTMLVideoElement>(
  ".photographic-scene__video--station-seven",
);
const seventhSceneReverseVideo = seventhScene?.querySelector<HTMLVideoElement>(
  ".photographic-scene__video--station-seven-reverse",
);
const eighthScene = document.querySelector<HTMLElement>("#scene-eight");
const eighthSceneMedia = eighthScene?.querySelector<HTMLElement>(".photographic-scene__media");
const eighthSceneVideo = eighthScene?.querySelector<HTMLVideoElement>(
  ".photographic-scene__video--station-eight",
);
const eighthSceneReverseVideo = eighthScene?.querySelector<HTMLVideoElement>(
  ".photographic-scene__video--station-eight-reverse",
);
const ninthScene = document.querySelector<HTMLElement>("#scene-nine");
const ninthSceneMedia = ninthScene?.querySelector<HTMLElement>(".photographic-scene__media");
const ninthSceneVideo = ninthScene?.querySelector<HTMLVideoElement>(
  ".photographic-scene__video--station-nine",
);
const ninthSceneReverseVideo = ninthScene?.querySelector<HTMLVideoElement>(
  ".photographic-scene__video--station-nine-reverse",
);
const tenthScene = document.querySelector<HTMLElement>("#scene-ten");
const tenthSceneMedia = tenthScene?.querySelector<HTMLElement>(".photographic-scene__media");
const tenthSceneVideo = tenthScene?.querySelector<HTMLVideoElement>(
  ".photographic-scene__video--station-ten",
);
const tenthSceneReverseVideo = tenthScene?.querySelector<HTMLVideoElement>(
  ".photographic-scene__video--station-ten-reverse",
);
const eleventhScene = document.querySelector<HTMLElement>("#scene-eleven");
const eleventhSceneMedia = eleventhScene?.querySelector<HTMLElement>(".photographic-scene__media");
const eleventhSceneVideo = eleventhScene?.querySelector<HTMLVideoElement>(
  ".photographic-scene__video--station-eleven",
);
const eleventhSceneReverseVideo = eleventhScene?.querySelector<HTMLVideoElement>(
  ".photographic-scene__video--station-eleven-reverse",
);
const displayPortalTransition = document.querySelector<HTMLElement>(
  "#display-portal-transition",
);
const introBrandMoment = document.querySelector<HTMLElement>(
  ".journey-brand--intro",
);
const panoramaBrandMoment = document.querySelector<HTMLElement>(
  ".journey-brand--panorama",
);
const intro = document.querySelector<HTMLElement>("#intro");
const startMedia = intro?.querySelector<HTMLElement>(".intro__media");
const startImage = intro?.querySelector<HTMLImageElement>("img");
const startScrollMedia = intro?.querySelector<HTMLElement>(".intro__scroll-media");
const startScrollVideo = intro?.querySelector<HTMLVideoElement>(
  ".intro__scroll-video--forward",
);
const startReverseVideo = intro?.querySelector<HTMLVideoElement>(
  ".intro__scroll-video--reverse",
);
const startFlare = intro?.querySelector<HTMLElement>(".intro__sun-flare");
const startCopy = document.querySelector<HTMLElement>("#station-1");
const secondSceneCopy = document.querySelector<HTMLElement>("#station-2");
const thirdSceneCopy = document.querySelector<HTMLElement>("#station-3");
const fourthSceneCopy = document.querySelector<HTMLElement>("#station-4");
const fifthSceneCopy = document.querySelector<HTMLElement>("#station-5");
const sixthSceneCopy = document.querySelector<HTMLElement>("#station-6");
const seventhSceneCopy = document.querySelector<HTMLElement>("#station-7");
const eighthSceneCopy = document.querySelector<HTMLElement>("#station-8");
const ninthSceneCopy = document.querySelector<HTMLElement>("#station-9");
const tenthSceneCopy = document.querySelector<HTMLElement>("#station-10");
const eleventhSceneCopy = document.querySelector<HTMLElement>("#station-11");
const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
let previousJourney = 0;
let scrollingBackward = false;

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function smoothstep(value: number): number {
  const clamped = clamp01(value);
  return clamped * clamped * (3 - 2 * clamped);
}

function updateBrandMoments(journey: number): void {
  const introExit = 1 - smoothstep((journey - 0.14) / 0.12);
  if (introBrandMoment) {
    introBrandMoment.style.setProperty(
      "--brand-opacity",
      clamp01(introExit).toFixed(4),
    );
    introBrandMoment.style.setProperty(
      "--brand-float",
      `${(-4 + Math.sin(journey * Math.PI * 6) * 4).toFixed(2)}px`,
    );
  }

  const panoramaProgress = journey - 10;
  const panoramaEnter = smoothstep((panoramaProgress - 0.84) / 0.09);
  const panoramaExit = 1 - smoothstep((panoramaProgress - 0.985) / 0.015);
  const panoramaOpacity = panoramaProgress >= 0 && panoramaProgress <= 1
    ? Math.min(panoramaEnter, panoramaExit)
    : 0;
  if (panoramaBrandMoment) {
    panoramaBrandMoment.style.setProperty(
      "--brand-opacity",
      clamp01(panoramaOpacity).toFixed(4),
    );
    panoramaBrandMoment.style.setProperty(
      "--brand-float",
      `${(-2 + Math.sin(panoramaProgress * Math.PI * 5) * 5).toFixed(2)}px`,
    );
  }
}

function updateDisplayPortalTransition(journey: number): void {
  const scenes = [
    intro,
    secondScene,
    thirdScene,
    fourthScene,
    fifthScene,
    sixthScene,
    seventhScene,
    eighthScene,
    ninthScene,
    tenthScene,
    eleventhScene,
  ];
  scenes.forEach((scene) => {
    if (scene) scene.style.transform = "";
  });

  const boundary = Math.min(10, Math.max(1, Math.round(journey)));
  const transitionStart = boundary - 0.075;
  const phase = clamp01((journey - transitionStart) / 0.15);
  const isNearBoundary = Math.abs(journey - boundary) <= 0.075;

  if (!displayPortalTransition || !isNearBoundary) {
    displayPortalTransition?.classList.remove("is-active");
    return;
  }

  const easedPhase = smoothstep(phase);
  const intensity = Math.sin(phase * Math.PI);
  const direction = boundary % 2 === 0 ? -1 : 1;
  const scale = 0.8 + easedPhase * 1.72;
  const translateX = direction * (1 - easedPhase) * window.innerWidth * 0.022;
  const translateY = Math.sin(phase * Math.PI * 2) * window.innerHeight * 0.008;
  const tiltX = Math.sin(phase * Math.PI) * -2.4;
  const tiltY = direction * (7.5 - easedPhase * 10);

  displayPortalTransition.classList.add("is-active");
  displayPortalTransition.style.setProperty(
    "--portal-opacity",
    Math.min(1, intensity * 1.18).toFixed(4),
  );
  displayPortalTransition.style.setProperty("--portal-phase", phase.toFixed(4));
  displayPortalTransition.style.setProperty("--portal-scale", scale.toFixed(4));
  displayPortalTransition.style.setProperty("--portal-x", `${translateX.toFixed(2)}px`);
  displayPortalTransition.style.setProperty("--portal-y", `${translateY.toFixed(2)}px`);
  displayPortalTransition.style.setProperty("--portal-tilt-x", `${tiltX.toFixed(3)}deg`);
  displayPortalTransition.style.setProperty("--portal-tilt-y", `${tiltY.toFixed(3)}deg`);

  const outgoing = scenes[boundary - 1];
  const incoming = scenes[boundary];
  if (outgoing) {
    const outgoingScale = 1 + easedPhase * 0.13;
    const outgoingX = direction * easedPhase * window.innerWidth * -0.012;
    outgoing.style.transform = [
      "perspective(1400px)",
      `translate3d(${outgoingX.toFixed(2)}px, 0, 0)`,
      `rotateY(${(direction * easedPhase * -1.2).toFixed(3)}deg)`,
      `scale(${outgoingScale.toFixed(5)})`,
    ].join(" ");
  }
  if (incoming) {
    const incomingScale = 0.94 + easedPhase * 0.06;
    const incomingX = direction * (1 - easedPhase) * window.innerWidth * 0.014;
    incoming.style.transform = [
      "perspective(1400px)",
      `translate3d(${incomingX.toFixed(2)}px, 0, 0)`,
      `rotateY(${(direction * (1 - easedPhase) * 1.1).toFixed(3)}deg)`,
      `scale(${incomingScale.toFixed(5)})`,
    ].join(" ");
  }
}

if (startImage) startImage.src = startImageUrl;
if (secondSceneImage) secondSceneImage.src = secondSceneImageUrl;
if (secondSceneVideo) {
  secondSceneVideo.poster = secondSceneImageUrl;
}
if (secondSceneReverseVideo) {
  secondSceneReverseVideo.poster = secondSceneImageUrl;
}

if (prefersReducedMotion) {
  ui.enableFallback();
  intro?.remove();
  secondScene?.remove();
  thirdScene?.remove();
  fourthScene?.remove();
  fifthScene?.remove();
  sixthScene?.remove();
  seventhScene?.remove();
  eighthScene?.remove();
  ninthScene?.remove();
  tenthScene?.remove();
  eleventhScene?.remove();
} else {
  const firstSceneVideoController = startScrollVideo
    ? createScrollVideoController(startScrollVideo)
    : undefined;
  const firstSceneReverseVideoController = startReverseVideo
    ? createScrollVideoController(startReverseVideo, { reverseProgress: true })
    : undefined;
  const secondSceneVideoController =
    secondSceneMedia && secondSceneVideo && secondSceneReverseVideo
      ? createDirectionalScrollVideoController({
          media: secondSceneMedia,
          forwardVideo: secondSceneVideo,
          reverseVideo: secondSceneReverseVideo,
          chapterIndex: 1,
        })
      : undefined;
  const thirdSceneVideoController =
    thirdSceneMedia && thirdSceneVideo && thirdSceneReverseVideo
      ? createDirectionalScrollVideoController({
          media: thirdSceneMedia,
          forwardVideo: thirdSceneVideo,
          reverseVideo: thirdSceneReverseVideo,
          chapterIndex: 2,
        })
      : undefined;
  const fourthSceneVideoController =
    fourthSceneMedia && fourthSceneVideo && fourthSceneReverseVideo
      ? createDirectionalScrollVideoController({
          media: fourthSceneMedia,
          forwardVideo: fourthSceneVideo,
          reverseVideo: fourthSceneReverseVideo,
          chapterIndex: 3,
        })
      : undefined;
  const fifthSceneVideoController =
    fifthSceneMedia && fifthSceneVideo && fifthSceneReverseVideo
      ? createDirectionalScrollVideoController({
          media: fifthSceneMedia,
          forwardVideo: fifthSceneVideo,
          reverseVideo: fifthSceneReverseVideo,
          chapterIndex: 4,
        })
      : undefined;
  const sixthSceneVideoController =
    sixthSceneMedia && sixthSceneVideo && sixthSceneReverseVideo
      ? createDirectionalScrollVideoController({
          media: sixthSceneMedia,
          forwardVideo: sixthSceneVideo,
          reverseVideo: sixthSceneReverseVideo,
          chapterIndex: 5,
        })
      : undefined;
  const seventhSceneVideoController =
    seventhSceneMedia && seventhSceneVideo && seventhSceneReverseVideo
      ? createDirectionalScrollVideoController({
          media: seventhSceneMedia,
          forwardVideo: seventhSceneVideo,
          reverseVideo: seventhSceneReverseVideo,
          chapterIndex: 6,
        })
      : undefined;
  const eighthSceneVideoController =
    eighthSceneMedia && eighthSceneVideo && eighthSceneReverseVideo
      ? createDirectionalScrollVideoController({
          media: eighthSceneMedia,
          forwardVideo: eighthSceneVideo,
          reverseVideo: eighthSceneReverseVideo,
          chapterIndex: 7,
        })
      : undefined;
  const ninthSceneVideoController =
    ninthSceneMedia && ninthSceneVideo && ninthSceneReverseVideo
      ? createDirectionalScrollVideoController({
          media: ninthSceneMedia,
          forwardVideo: ninthSceneVideo,
          reverseVideo: ninthSceneReverseVideo,
          chapterIndex: 8,
        })
      : undefined;
  const tenthSceneVideoController =
    tenthSceneMedia && tenthSceneVideo && tenthSceneReverseVideo
      ? createDirectionalScrollVideoController({
          media: tenthSceneMedia,
          forwardVideo: tenthSceneVideo,
          reverseVideo: tenthSceneReverseVideo,
          chapterIndex: 9,
        })
      : undefined;
  const eleventhSceneVideoController =
    eleventhSceneMedia && eleventhSceneVideo && eleventhSceneReverseVideo
      ? createDirectionalScrollVideoController({
          media: eleventhSceneMedia,
          forwardVideo: eleventhSceneVideo,
          reverseVideo: eleventhSceneReverseVideo,
          chapterIndex: 10,
        })
      : undefined;
  const mediaAssetDefinitions = [
    {
      chapterIndex: 0,
      forwardVideo: startScrollVideo,
      forwardUrl: firstSceneVideoUrl,
      reverseVideo: startReverseVideo,
      reverseUrl: firstSceneReverseVideoUrl,
    },
    {
      chapterIndex: 1,
      forwardVideo: secondSceneVideo,
      forwardUrl: secondSceneVideoUrl,
      reverseVideo: secondSceneReverseVideo,
      reverseUrl: secondSceneReverseVideoUrl,
    },
    {
      chapterIndex: 2,
      forwardVideo: thirdSceneVideo,
      forwardUrl: thirdSceneVideoUrl,
      reverseVideo: thirdSceneReverseVideo,
      reverseUrl: thirdSceneReverseVideoUrl,
    },
    {
      chapterIndex: 3,
      forwardVideo: fourthSceneVideo,
      forwardUrl: fourthSceneVideoUrl,
      reverseVideo: fourthSceneReverseVideo,
      reverseUrl: fourthSceneReverseVideoUrl,
    },
    {
      chapterIndex: 4,
      forwardVideo: fifthSceneVideo,
      forwardUrl: fifthSceneVideoUrl,
      reverseVideo: fifthSceneReverseVideo,
      reverseUrl: fifthSceneReverseVideoUrl,
    },
    {
      chapterIndex: 5,
      forwardVideo: sixthSceneVideo,
      forwardUrl: sixthSceneVideoUrl,
      reverseVideo: sixthSceneReverseVideo,
      reverseUrl: sixthSceneReverseVideoUrl,
    },
    {
      chapterIndex: 6,
      forwardVideo: seventhSceneVideo,
      forwardUrl: seventhSceneVideoUrl,
      reverseVideo: seventhSceneReverseVideo,
      reverseUrl: seventhSceneReverseVideoUrl,
    },
    {
      chapterIndex: 7,
      forwardVideo: eighthSceneVideo,
      forwardUrl: eighthSceneVideoUrl,
      reverseVideo: eighthSceneReverseVideo,
      reverseUrl: eighthSceneReverseVideoUrl,
    },
    {
      chapterIndex: 8,
      forwardVideo: ninthSceneVideo,
      forwardUrl: ninthSceneVideoUrl,
      reverseVideo: ninthSceneReverseVideo,
      reverseUrl: ninthSceneReverseVideoUrl,
    },
    {
      chapterIndex: 9,
      forwardVideo: tenthSceneVideo,
      forwardUrl: tenthSceneVideoUrl,
      reverseVideo: tenthSceneReverseVideo,
      reverseUrl: tenthSceneReverseVideoUrl,
    },
    {
      chapterIndex: 10,
      forwardVideo: eleventhSceneVideo,
      forwardUrl: eleventhSceneVideoUrl,
      reverseVideo: eleventhSceneReverseVideo,
      reverseUrl: eleventhSceneReverseVideoUrl,
    },
  ];
  const mediaAssets: ScrollMediaAsset[] = mediaAssetDefinitions.flatMap(
    (asset) => (
      asset.forwardVideo && asset.reverseVideo
        ? [{
            ...asset,
            forwardVideo: asset.forwardVideo,
            compactForwardUrl: asset.forwardUrl.replace(
              "/media/",
              "/media/mobile/",
            ),
            reverseVideo: asset.reverseVideo,
            compactReverseUrl: asset.reverseUrl.replace(
              "/media/",
              "/media/mobile/",
            ),
          }]
        : []
    ),
  );
  const mediaPreloader = createScrollMediaPreloader(mediaAssets);

  try {
    const scrollJourney = createScrollJourney({
      chapterCount: stations.length,
      scrollElement: journeyScroller ?? undefined,
      onStationChange: ui.setActive,
      onProgress(progress) {
        ui.setProgress(progress);
        const journey = progress * stations.length;
        const journeyDelta = journey - previousJourney;
        if (journeyDelta < -0.00005) scrollingBackward = true;
        else if (journeyDelta > 0.00005) scrollingBackward = false;
        mediaPreloader.update(journey, scrollingBackward);
        updateDisplayPortalTransition(journey);
        updateBrandMoments(journey);

        if (journey > 1.06) {
          firstSceneVideoController?.hold();
          firstSceneReverseVideoController?.hold();
        } else if (scrollingBackward) {
          firstSceneVideoController?.hold();
          firstSceneReverseVideoController?.update(progress, stations.length, 0);

          if (startReverseVideo && startScrollMedia) {
            const localProgress = Math.min(1, Math.max(0, journey));
            const reverseTarget = Number.isFinite(startReverseVideo.duration)
              ? (1 - localProgress) * Math.max(0, startReverseVideo.duration - 0.001)
              : 0;
            const reverseReady = !startReverseVideo.seeking
              && Math.abs(startReverseVideo.currentTime - reverseTarget) < 0.09;
            if (reverseReady) startScrollMedia.classList.add("is-reversing");
          }
        } else {
          firstSceneReverseVideoController?.hold();
          firstSceneVideoController?.update(progress, stations.length, 0);

          if (startScrollVideo && startScrollMedia) {
            const localProgress = Math.min(1, Math.max(0, journey));
            const forwardTarget = Number.isFinite(startScrollVideo.duration)
              ? localProgress * Math.max(0, startScrollVideo.duration - 0.001)
              : 0;
            const forwardReady = !startScrollVideo.seeking
              && Math.abs(startScrollVideo.currentTime - forwardTarget) < 0.09;
            if (forwardReady) startScrollMedia.classList.remove("is-reversing");
          }
        }

        secondSceneVideoController?.update(
          progress,
          stations.length,
          scrollingBackward,
        );
        thirdSceneVideoController?.update(
          progress,
          stations.length,
          scrollingBackward,
        );
        fourthSceneVideoController?.update(
          progress,
          stations.length,
          scrollingBackward,
        );
        fifthSceneVideoController?.update(
          progress,
          stations.length,
          scrollingBackward,
        );
        sixthSceneVideoController?.update(
          progress,
          stations.length,
          scrollingBackward,
        );
        seventhSceneVideoController?.update(
          progress,
          stations.length,
          scrollingBackward,
        );
        eighthSceneVideoController?.update(
          progress,
          stations.length,
          scrollingBackward,
        );
        ninthSceneVideoController?.update(
          progress,
          stations.length,
          scrollingBackward,
        );
        tenthSceneVideoController?.update(
          progress,
          stations.length,
          scrollingBackward,
        );
        eleventhSceneVideoController?.update(
          progress,
          stations.length,
          scrollingBackward,
        );

        if (intro && startMedia) {
          updateStartImageCamera({
            container: intro,
            media: startMedia,
            scrollMedia: startScrollMedia,
            scrollVideo: startScrollVideo,
            copy: startCopy,
            flare: startFlare,
            progress,
            chapterCount: stations.length,
          });
        }
        previousJourney = journey;
        if (secondScene && secondSceneMedia) {
          updatePhotographicScene({
            container: secondScene,
            media: secondSceneMedia,
            copy: secondSceneCopy,
            progress,
            chapterCount: stations.length,
            chapterIndex: 1,
            entryLead: 0.02,
            entryDuration: 0.04,
          });
        }
        if (thirdScene && thirdSceneMedia) {
          updatePhotographicScene({
            container: thirdScene,
            media: thirdSceneMedia,
            copy: thirdSceneCopy,
            progress,
            chapterCount: stations.length,
            chapterIndex: 2,
          });
        }
        if (fourthScene && fourthSceneMedia) {
          updatePhotographicScene({
            container: fourthScene,
            media: fourthSceneMedia,
            copy: fourthSceneCopy,
            progress,
            chapterCount: stations.length,
            chapterIndex: 3,
          });
        }
        if (fifthScene && fifthSceneMedia) {
          updatePhotographicScene({
            container: fifthScene,
            media: fifthSceneMedia,
            copy: fifthSceneCopy,
            progress,
            chapterCount: stations.length,
            chapterIndex: 4,
          });
        }
        if (sixthScene && sixthSceneMedia) {
          updatePhotographicScene({
            container: sixthScene,
            media: sixthSceneMedia,
            copy: sixthSceneCopy,
            progress,
            chapterCount: stations.length,
            chapterIndex: 5,
          });
        }
        if (seventhScene && seventhSceneMedia) {
          updatePhotographicScene({
            container: seventhScene,
            media: seventhSceneMedia,
            copy: seventhSceneCopy,
            progress,
            chapterCount: stations.length,
            chapterIndex: 6,
          });
        }
        if (eighthScene && eighthSceneMedia) {
          updatePhotographicScene({
            container: eighthScene,
            media: eighthSceneMedia,
            copy: eighthSceneCopy,
            progress,
            chapterCount: stations.length,
            chapterIndex: 7,
          });
        }
        if (ninthScene && ninthSceneMedia) {
          updatePhotographicScene({
            container: ninthScene,
            media: ninthSceneMedia,
            copy: ninthSceneCopy,
            progress,
            chapterCount: stations.length,
            chapterIndex: 8,
          });
        }
        if (tenthScene && tenthSceneMedia) {
          updatePhotographicScene({
            container: tenthScene,
            media: tenthSceneMedia,
            copy: tenthSceneCopy,
            progress,
            chapterCount: stations.length,
            chapterIndex: 9,
          });
        }
        if (eleventhScene && eleventhSceneMedia) {
          updatePhotographicScene({
            container: eleventhScene,
            media: eleventhSceneMedia,
            copy: eleventhSceneCopy,
            progress,
            chapterCount: stations.length,
            chapterIndex: 10,
          });
        }
      },
    });
    window.addEventListener("pagehide", () => {
      scrollJourney.destroy();
      siteNavigation.destroy();
      salesAssistant.destroy();
      showroomFunnel.destroy();
      pictograms.destroy();
      projectSteps.destroy();
      scrollReveal.destroy();
      marketingEntryDissolve.destroy();
      mediaStudioDetails.destroy();
      impactDetails.destroy();
      impactScenes.destroy();
      solutionFinderScenes.destroy();
      gastronomyShowroom.destroy();
      mediaPreloader.destroy();
      firstSceneVideoController?.destroy();
      firstSceneReverseVideoController?.destroy();
      secondSceneVideoController?.destroy();
      thirdSceneVideoController?.destroy();
      fourthSceneVideoController?.destroy();
      fifthSceneVideoController?.destroy();
      sixthSceneVideoController?.destroy();
      seventhSceneVideoController?.destroy();
      eighthSceneVideoController?.destroy();
      ninthSceneVideoController?.destroy();
      tenthSceneVideoController?.destroy();
      eleventhSceneVideoController?.destroy();
    }, { once: true });
  } catch (error) {
    console.error("SwissCompact scroll experience fallback", error);
    mediaPreloader.destroy();
    firstSceneVideoController?.destroy();
    firstSceneReverseVideoController?.destroy();
    secondSceneVideoController?.destroy();
    thirdSceneVideoController?.destroy();
    fourthSceneVideoController?.destroy();
    fifthSceneVideoController?.destroy();
    sixthSceneVideoController?.destroy();
    seventhSceneVideoController?.destroy();
    eighthSceneVideoController?.destroy();
    ninthSceneVideoController?.destroy();
    tenthSceneVideoController?.destroy();
    eleventhSceneVideoController?.destroy();
    ui.enableFallback();
    intro?.remove();
    secondScene?.remove();
    thirdScene?.remove();
    fourthScene?.remove();
    fifthScene?.remove();
    sixthScene?.remove();
    seventhScene?.remove();
    eighthScene?.remove();
    ninthScene?.remove();
    tenthScene?.remove();
    eleventhScene?.remove();
  }
}

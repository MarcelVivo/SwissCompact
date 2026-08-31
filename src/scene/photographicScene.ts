export interface PhotographicSceneOptions {
  container: HTMLElement;
  media?: HTMLElement | null;
  copy?: HTMLElement | null;
  progress: number;
  chapterCount: number;
  chapterIndex: number;
  entryLead?: number;
  entryDuration?: number;
  exitStart?: number;
  exitDuration?: number;
  motion?: PhotographicSceneMotion;
}

export interface PhotographicSceneMotion {
  sourceWidth: number;
  sourceHeight: number;
  targetX: number;
  targetY: number;
  startScale?: number;
  targetScale: number;
  curveX?: number;
  curveY?: number;
  focusOffsetX?: number;
  focusOffsetY?: number;
  zoomExponent?: number;
  motionStart?: number;
  motionEnd?: number;
  endTargetX?: number;
  endTargetY?: number;
  endScale?: number;
  endCurveX?: number;
  endCurveY?: number;
  endZoomExponent?: number;
  endMotionStart?: number;
  endMotionEnd?: number;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function smoothstep(value: number): number {
  const clamped = clamp01(value);
  return clamped * clamped * (3 - 2 * clamped);
}

export function updatePhotographicScene({
  container,
  media,
  copy,
  progress,
  chapterCount,
  chapterIndex,
  entryLead = 0.02,
  entryDuration = 0.04,
  exitStart = 0.98,
  exitDuration = 0.04,
  motion,
}: PhotographicSceneOptions): void {
  const journey = clamp01(progress) * chapterCount;
  const localProgress = clamp01(journey - chapterIndex);
  const entry = smoothstep(
    (journey - chapterIndex + entryLead) / Math.max(0.001, entryDuration),
  );
  const exit = 1 - smoothstep(
    (journey - chapterIndex - exitStart) / Math.max(0.001, exitDuration),
  );
  const opacity = Math.min(entry, exit);
  const visible = opacity > 0.001;

  container.style.opacity = opacity.toFixed(4);
  container.style.visibility = visible ? "visible" : "hidden";
  container.classList.toggle("is-visible", visible);

  if (media && motion) {
    const motionStart = clamp01(motion.motionStart ?? 0);
    const motionEnd = Math.max(motionStart + 0.001, clamp01(motion.motionEnd ?? 1));
    const motionProgress = clamp01(
      (localProgress - motionStart) / (motionEnd - motionStart),
    );
    const approach = smoothstep(motionProgress);
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const coverScale = Math.max(
      viewportWidth / motion.sourceWidth,
      viewportHeight / motion.sourceHeight,
    );
    const mediaLeft = (viewportWidth - motion.sourceWidth * coverScale) * 0.5;
    const mediaTop = (viewportHeight - motion.sourceHeight * coverScale) * 0.5;
    const targetX = mediaLeft + motion.targetX * coverScale;
    const targetY = mediaTop + motion.targetY * coverScale;
    const centerX = viewportWidth * 0.5;
    const centerY = viewportHeight * 0.5;
    const focusX = centerX + viewportWidth * (motion.focusOffsetX ?? 0);
    const focusY = centerY + viewportHeight * (motion.focusOffsetY ?? 0);
    const curveX = viewportWidth * (motion.curveX ?? 0.025)
      * (Math.sin(approach * Math.PI) - 0.34 * Math.sin(approach * Math.PI * 2));
    const curveY = viewportHeight * (motion.curveY ?? 0.012)
      * Math.sin(approach * Math.PI * 2);
    const startScale = motion.startScale ?? 1;
    const zoomProgress = approach ** (motion.zoomExponent ?? 2);
    let scale = startScale + zoomProgress * (motion.targetScale - startScale);
    const focusProgress = startScale > motion.targetScale ? 1 - approach : approach;
    let activeTargetX = targetX;
    let activeTargetY = targetY;
    let desiredTargetX = targetX + (focusX - targetX) * focusProgress + curveX;
    let desiredTargetY = targetY + (focusY - targetY) * focusProgress + curveY;

    if (
      motion.endTargetX !== undefined
      && motion.endTargetY !== undefined
      && motion.endScale !== undefined
    ) {
      const endMotionStart = clamp01(motion.endMotionStart ?? 0.65);
      const endMotionEnd = Math.max(
        endMotionStart + 0.001,
        clamp01(motion.endMotionEnd ?? 1),
      );
      const endMotionProgress = clamp01(
        (localProgress - endMotionStart) / (endMotionEnd - endMotionStart),
      );
      const endApproach = smoothstep(endMotionProgress);
      if (endApproach > 0) {
        activeTargetX = mediaLeft + motion.endTargetX * coverScale;
        activeTargetY = mediaTop + motion.endTargetY * coverScale;
        const endCurveX = viewportWidth * (motion.endCurveX ?? 0)
          * (Math.sin(endApproach * Math.PI) - 0.25 * Math.sin(endApproach * Math.PI * 2));
        const endCurveY = viewportHeight * (motion.endCurveY ?? 0)
          * Math.sin(endApproach * Math.PI * 2);
        const endZoomProgress = endApproach ** (motion.endZoomExponent ?? 2);
        scale = motion.targetScale
          + endZoomProgress * (motion.endScale - motion.targetScale);
        desiredTargetX = activeTargetX
          + (centerX - activeTargetX) * endApproach
          + endCurveX;
        desiredTargetY = activeTargetY
          + (centerY - activeTargetY) * endApproach
          + endCurveY;
      }
    }

    const relativeX = (activeTargetX - centerX) * scale;
    const relativeY = (activeTargetY - centerY) * scale;
    const transformedTargetX = centerX + relativeX;
    const transformedTargetY = centerY + relativeY;
    const translateX = desiredTargetX - transformedTargetX;
    const translateY = desiredTargetY - transformedTargetY;

    media.style.transform = [
      `translate3d(${translateX.toFixed(2)}px, ${translateY.toFixed(2)}px, 0)`,
      `scale(${scale.toFixed(5)})`,
    ].join(" ");
  }

  if (copy) {
    const copyFade = smoothstep((localProgress - 0.24) / 0.3);
    copy.style.opacity = (opacity * (1 - copyFade)).toFixed(4);
    copy.style.transform = `translate3d(0, ${(-18 * copyFade).toFixed(2)}px, 0)`;
  }
}

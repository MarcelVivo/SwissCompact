export interface ImpactScenes {
  destroy(): void;
}

type SceneName = "attention" | "decision" | "network" | "space";

interface SceneState {
  card: HTMLElement;
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
  name: SceneName;
  width: number;
  height: number;
  visible: boolean;
  interaction: number;
  targetInteraction: number;
  pointerX: number;
  pointerY: number;
  touchReleaseTimer: number;
}

const RED = "#d30a2f";
const DARK = "#111114";

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function mix(from: number, to: number, amount: number): number {
  return from + (to - from) * amount;
}

function seeded(index: number, seed: number): number {
  const value = Math.sin(index * 91.173 + seed * 47.319) * 43_758.5453;
  return value - Math.floor(value);
}

function setCanvasSize(state: SceneState): void {
  const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
  const rect = state.card.getBoundingClientRect();
  state.width = Math.max(1, rect.width);
  state.height = Math.max(1, rect.height);
  state.canvas.width = Math.round(state.width * ratio);
  state.canvas.height = Math.round(state.height * ratio);
  state.context.setTransform(ratio, 0, 0, ratio, 0, 0);
}

function drawAttention(
  state: SceneState,
  time: number,
  influence: number,
): void {
  const { context, width, height } = state;
  const zoneHeight = Math.min(172, height * 0.48);
  const idleX = 0.5 + Math.sin(time * 0.47) * 0.12;
  const idleY = 0.38 + Math.cos(time * 0.39) * 0.1;
  const focusX = width * mix(idleX, state.pointerX, influence * 0.78);
  const focusY = zoneHeight * mix(idleY, state.pointerY, influence * 0.72);

  for (let index = 0; index < 44; index += 1) {
    const originX = seeded(index, 1) * width;
    const originY = 18 + seeded(index, 2) * (zoneHeight - 30);
    const attraction =
      0.22
      + influence * 0.58
      + Math.sin(time * 1.4 + index * 0.7) * 0.045;
    const orbit = (1 - influence) * 12;
    const x =
      mix(originX, focusX, clamp01(attraction))
      + Math.sin(time * 0.9 + index) * orbit;
    const y =
      mix(originY, focusY, clamp01(attraction))
      + Math.cos(time * 0.75 + index * 1.7) * orbit;
    const size = 1.5 + seeded(index, 3) * 3.2 + influence * 1.4;
    context.fillStyle = index % 7 === 0
      ? `rgba(211, 10, 47, ${0.48 + influence * 0.42})`
      : `rgba(17, 17, 20, ${0.18 + influence * 0.42})`;
    context.fillRect(
      Math.round(x / 2) * 2,
      Math.round(y / 2) * 2,
      size,
      size,
    );
  }

  const pulse = 1 + Math.sin(time * 2.4) * 0.08;
  context.strokeStyle = `rgba(211, 10, 47, ${0.15 + influence * 0.34})`;
  context.lineWidth = 1;
  context.strokeRect(
    focusX - 17 * pulse,
    focusY - 17 * pulse,
    34 * pulse,
    34 * pulse,
  );
  context.fillStyle = RED;
  context.fillRect(focusX - 4, focusY - 4, 8, 8);
}

function drawDecision(
  state: SceneState,
  time: number,
  influence: number,
): void {
  const { context, width, height } = state;
  const zoneHeight = Math.min(176, height * 0.5);
  const centerY = zoneHeight * 0.5;
  const visitorX = 30;
  const startX = 48;
  const branchX = width * 0.43;
  const endX = width - 29;
  const routes = [36, centerY, zoneHeight - 32];
  const pointerY = state.pointerY * height;
  const selected = routes.reduce(
    (nearest, routeY, index) => (
      Math.abs(pointerY - routeY) < Math.abs(pointerY - routes[nearest])
        ? index
        : nearest
    ),
    0,
  );

  context.strokeStyle = `rgba(255, 255, 255, ${0.36 + influence * 0.34})`;
  context.lineWidth = 1.2;
  context.beginPath();
  context.arc(visitorX, centerY - 10, 4.5, 0, Math.PI * 2);
  context.moveTo(visitorX, centerY - 5);
  context.lineTo(visitorX, centerY + 7);
  context.moveTo(visitorX - 7, centerY);
  context.lineTo(visitorX + 7, centerY);
  context.moveTo(visitorX, centerY + 7);
  context.lineTo(visitorX - 6, centerY + 16);
  context.moveTo(visitorX, centerY + 7);
  context.lineTo(visitorX + 6, centerY + 16);
  context.stroke();
  context.fillStyle = RED;
  context.fillRect(visitorX - 2.5, centerY - 2.5, 5, 5);

  context.lineWidth = 1.25;
  routes.forEach((routeY, index) => {
    const isSelected = index === selected;
    context.beginPath();
    context.moveTo(startX, centerY);
    context.lineTo(branchX, centerY);
    context.lineTo(branchX + 24, routeY);
    context.lineTo(endX - 13, routeY);
    context.strokeStyle = isSelected
      ? `rgba(211, 10, 47, ${0.5 + influence * 0.5})`
      : `rgba(255, 255, 255, ${0.12 + (1 - influence) * 0.12})`;
    context.setLineDash(isSelected ? [5, 5] : [2, 7]);
    context.lineDashOffset = -time * (isSelected ? 28 : 8);
    context.stroke();

    context.setLineDash([]);
    context.strokeStyle = isSelected
      ? RED
      : "rgba(255, 255, 255, 0.42)";
    context.beginPath();
    context.arc(endX - 8, routeY, 5, 0, Math.PI * 2);
    context.stroke();
    context.fillStyle = isSelected ? RED : "rgba(255, 255, 255, 0.32)";
    context.fillRect(endX + 1, routeY - 1, 13, 2);
    if (isSelected) {
      context.beginPath();
      context.moveTo(endX - 11, routeY);
      context.lineTo(endX - 8.5, routeY + 2.5);
      context.lineTo(endX - 4.5, routeY - 3);
      context.strokeStyle = "#ff3156";
      context.stroke();
    }

    if (isSelected) {
      const travel = (time * 0.52) % 1;
      const firstLength = branchX - startX;
      const diagonalLength = Math.hypot(24, routeY - centerY);
      const finalLength = endX - 13 - (branchX + 24);
      const totalLength = firstLength + diagonalLength + finalLength;
      const distance = travel * totalLength;
      let pulseX: number;
      let pulseY: number;

      if (distance <= firstLength) {
        pulseX = startX + distance;
        pulseY = centerY;
      } else if (distance <= firstLength + diagonalLength) {
        const diagonalProgress = (distance - firstLength) / diagonalLength;
        pulseX = branchX + diagonalProgress * 24;
        pulseY = centerY + (routeY - centerY) * diagonalProgress;
      } else {
        pulseX =
          branchX
          + 24
          + distance
          - firstLength
          - diagonalLength;
        pulseY = routeY;
      }
      context.fillStyle = "#ff3156";
      context.fillRect(pulseX - 2.5, pulseY - 2.5, 5, 5);
    }
  });
  context.setLineDash([]);
}

function drawNetwork(
  state: SceneState,
  time: number,
  influence: number,
): void {
  const { context, width, height } = state;
  const zoneHeight = Math.min(176, height * 0.5);
  const centerY = zoneHeight * 0.5;
  const hub = {
    x: width * 0.14,
    y: centerY,
    width: 30 + influence * 4,
    height: 32 + influence * 4,
  };
  const trunkX = width * 0.35;
  const screens = [
    { x: width * 0.52, y: zoneHeight * 0.25 },
    { x: width * 0.82, y: zoneHeight * 0.25 },
    { x: width * 0.52, y: zoneHeight * 0.73 },
    { x: width * 0.82, y: zoneHeight * 0.73 },
  ];

  context.lineWidth = 1;
  screens.forEach((screen, index) => {
    const screenWidth = 25 + influence * 4;
    const screenHeight = 16 + influence * 2;
    const startX = hub.x + hub.width / 2;
    const endX = screen.x - screenWidth / 2;
    context.beginPath();
    context.moveTo(startX, centerY);
    context.lineTo(trunkX, centerY);
    context.lineTo(trunkX + 18, screen.y);
    context.lineTo(endX, screen.y);
    context.strokeStyle = `rgba(17, 17, 20, ${0.13 + influence * 0.16})`;
    context.setLineDash([3, 5]);
    context.lineDashOffset = -time * 9;
    context.stroke();
    context.setLineDash([]);

    const firstLength = trunkX - startX;
    const diagonalLength = Math.hypot(18, screen.y - centerY);
    const finalLength = endX - (trunkX + 18);
    const totalLength = firstLength + diagonalLength + finalLength;
    const travel = (time * (0.22 + influence * 0.24) + index * 0.2) % 1;
    const distance = travel * totalLength;
    let x: number;
    let y: number;
    if (distance <= firstLength) {
      x = startX + distance;
      y = centerY;
    } else if (distance <= firstLength + diagonalLength) {
      const diagonalProgress = (distance - firstLength) / diagonalLength;
      x = trunkX + diagonalProgress * 18;
      y = centerY + (screen.y - centerY) * diagonalProgress;
    } else {
      x = trunkX + 18 + distance - firstLength - diagonalLength;
      y = screen.y;
    }
    context.fillStyle = RED;
    context.fillRect(x - 2.5, y - 2.5, 5, 5);

    const arriving = travel > 0.84;
    context.fillStyle = arriving
      ? `rgba(211, 10, 47, ${0.1 + influence * 0.16})`
      : "rgba(17, 17, 20, 0.035)";
    context.fillRect(
      screen.x - screenWidth / 2,
      screen.y - screenHeight / 2,
      screenWidth,
      screenHeight,
    );
    context.strokeStyle = arriving ? RED : "rgba(17, 17, 20, 0.5)";
    context.strokeRect(
      screen.x - screenWidth / 2,
      screen.y - screenHeight / 2,
      screenWidth,
      screenHeight,
    );
    context.fillStyle = arriving ? RED : DARK;
    context.fillRect(
      screen.x - screenWidth / 2 + 4,
      screen.y - 1,
      screenWidth * (0.34 + 0.1 * Math.sin(time + index)),
      2,
    );
  });

  context.fillStyle = `rgba(211, 10, 47, ${0.1 + influence * 0.16})`;
  context.fillRect(
    hub.x - hub.width / 2,
    hub.y - hub.height / 2,
    hub.width,
    hub.height,
  );
  context.strokeStyle = RED;
  context.strokeRect(
    hub.x - hub.width / 2,
    hub.y - hub.height / 2,
    hub.width,
    hub.height,
  );
  context.fillStyle = RED;
  context.fillRect(hub.x - 4, hub.y - 4, 8, 8);
  context.fillStyle = DARK;
  context.fillRect(hub.x - 9, hub.y + 9, 18, 2);
}

function drawSpace(
  state: SceneState,
  time: number,
  influence: number,
): void {
  const { context, width, height } = state;
  const zoneHeight = Math.min(190, height * 0.54);
  const outerLeft = 12;
  const outerRight = width - 12;
  const outerTop = 15;
  const outerBottom = zoneHeight - 5;
  const backLeft = width * 0.28;
  const backRight = width * 0.72;
  const backTop = 28;
  const backBottom = zoneHeight * 0.66;
  const displayX = width * 0.5;
  const displayY = mix(backTop, backBottom, 0.46);
  const displayWidth = Math.min(54, width * 0.2);
  const displayHeight = displayWidth * 0.58;
  const pointerRoomY = clamp01(state.pointerY * height / zoneHeight);
  const idleX = 0.5 + Math.sin(time * 0.34) * 0.08;
  const idleY = 0.78 + Math.cos(time * 0.3) * 0.035;
  const lightX = width * mix(idleX, state.pointerX, influence * 0.72);
  const lightY = zoneHeight * mix(
    idleY,
    Math.max(0.54, pointerRoomY),
    influence * 0.66,
  );

  const polygon = (
    points: Array<[number, number]>,
    fill: string,
  ) => {
    context.beginPath();
    points.forEach(([x, y], index) => {
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    });
    context.closePath();
    context.fillStyle = fill;
    context.fill();
  };

  polygon(
    [
      [outerLeft, outerTop],
      [outerRight, outerTop],
      [backRight, backTop],
      [backLeft, backTop],
    ],
    "rgba(255, 255, 255, 0.018)",
  );
  polygon(
    [
      [outerLeft, outerTop],
      [backLeft, backTop],
      [backLeft, backBottom],
      [outerLeft, outerBottom],
    ],
    "rgba(255, 255, 255, 0.025)",
  );
  polygon(
    [
      [backRight, backTop],
      [outerRight, outerTop],
      [outerRight, outerBottom],
      [backRight, backBottom],
    ],
    "rgba(255, 255, 255, 0.014)",
  );
  polygon(
    [
      [backLeft, backBottom],
      [backRight, backBottom],
      [outerRight, outerBottom],
      [outerLeft, outerBottom],
    ],
    "rgba(255, 255, 255, 0.035)",
  );

  const leftLight = (1 - lightX / width) * (0.035 + influence * 0.08);
  const rightLight = lightX / width * (0.035 + influence * 0.08);
  polygon(
    [
      [outerLeft, outerTop],
      [backLeft, backTop],
      [backLeft, backBottom],
      [outerLeft, outerBottom],
    ],
    `rgba(211, 10, 47, ${leftLight})`,
  );
  polygon(
    [
      [backRight, backTop],
      [outerRight, outerTop],
      [outerRight, outerBottom],
      [backRight, backBottom],
    ],
    `rgba(211, 10, 47, ${rightLight})`,
  );
  polygon(
    [
      [displayX - displayWidth * 0.42, displayY + displayHeight / 2],
      [displayX + displayWidth * 0.42, displayY + displayHeight / 2],
      [Math.min(outerRight, lightX + 52 + influence * 24), lightY],
      [Math.max(outerLeft, lightX - 52 - influence * 24), lightY],
    ],
    `rgba(211, 10, 47, ${0.035 + influence * 0.09})`,
  );

  const radius = Math.max(width, zoneHeight) * (0.24 + influence * 0.2);
  const glow = context.createRadialGradient(
    lightX,
    lightY,
    0,
    lightX,
    lightY,
    radius,
  );
  glow.addColorStop(0, `rgba(211, 10, 47, ${0.17 + influence * 0.2})`);
  glow.addColorStop(0.45, `rgba(211, 10, 47, ${0.055 + influence * 0.07})`);
  glow.addColorStop(1, "rgba(211, 10, 47, 0)");
  context.fillStyle = glow;
  context.fillRect(0, 0, width, zoneHeight);

  context.strokeStyle = `rgba(255, 255, 255, ${0.13 + influence * 0.12})`;
  context.lineWidth = 1;
  context.strokeRect(
    backLeft,
    backTop,
    backRight - backLeft,
    backBottom - backTop,
  );
  context.beginPath();
  context.moveTo(outerLeft, outerTop);
  context.lineTo(backLeft, backTop);
  context.moveTo(outerRight, outerTop);
  context.lineTo(backRight, backTop);
  context.moveTo(outerLeft, outerBottom);
  context.lineTo(backLeft, backBottom);
  context.moveTo(outerRight, outerBottom);
  context.lineTo(backRight, backBottom);
  context.moveTo(outerLeft, outerTop);
  context.lineTo(outerLeft, outerBottom);
  context.moveTo(outerRight, outerTop);
  context.lineTo(outerRight, outerBottom);
  context.stroke();

  for (let index = 1; index <= 2; index += 1) {
    const progress = index / 3;
    const y = mix(backBottom, outerBottom, progress * progress);
    const left = mix(backLeft, outerLeft, progress);
    const right = mix(backRight, outerRight, progress);
    context.beginPath();
    context.moveTo(left, y);
    context.lineTo(right, y);
    context.strokeStyle = "rgba(255, 255, 255, 0.07)";
    context.stroke();
  }

  const displayGlow = context.createRadialGradient(
    displayX,
    displayY,
    0,
    displayX,
    displayY,
    displayWidth * (1.3 + influence),
  );
  displayGlow.addColorStop(0, `rgba(211, 10, 47, ${0.24 + influence * 0.2})`);
  displayGlow.addColorStop(1, "rgba(211, 10, 47, 0)");
  context.fillStyle = displayGlow;
  context.fillRect(
    displayX - displayWidth * 2,
    displayY - displayHeight * 2,
    displayWidth * 4,
    displayHeight * 4,
  );
  context.fillStyle = "rgba(5, 5, 7, 0.9)";
  context.fillRect(
    displayX - displayWidth / 2,
    displayY - displayHeight / 2,
    displayWidth,
    displayHeight,
  );
  context.strokeStyle = `rgba(255, 255, 255, ${0.48 + influence * 0.35})`;
  context.strokeRect(
    displayX - displayWidth / 2,
    displayY - displayHeight / 2,
    displayWidth,
    displayHeight,
  );
  context.fillStyle = RED;
  context.fillRect(
    displayX - displayWidth * 0.32,
    displayY - displayHeight * 0.18,
    displayWidth * (0.38 + Math.sin(time * 0.8) * 0.05),
    3,
  );
  context.fillStyle = "rgba(255, 255, 255, 0.48)";
  context.fillRect(
    displayX - displayWidth * 0.32,
    displayY + displayHeight * 0.08,
    displayWidth * 0.5,
    2,
  );

  for (let index = 0; index < 5; index += 1) {
    const travel = (time * (0.14 + influence * 0.13) + index * 0.19) % 1;
    const x = mix(displayX, lightX, travel);
    const y = mix(displayY + displayHeight / 2, lightY, travel);
    const alpha = Math.sin(travel * Math.PI) * (0.3 + influence * 0.55);
    context.fillStyle = `rgba(211, 10, 47, ${alpha})`;
    context.fillRect(x - 2, y - 2, 4, 4);
  }
}

function renderScene(state: SceneState, time: number): void {
  const { context, width, height } = state;
  context.clearRect(0, 0, width, height);
  state.interaction = mix(
    state.interaction,
    state.targetInteraction,
    state.targetInteraction > state.interaction ? 0.1 : 0.035,
  );
  const influence = 0.28 + state.interaction * 0.72;

  if (state.name === "attention") drawAttention(state, time, influence);
  else if (state.name === "decision") drawDecision(state, time, influence);
  else if (state.name === "network") drawNetwork(state, time, influence);
  else drawSpace(state, time, influence);
}

export function mountImpactScenes(): ImpactScenes {
  const cards = Array.from(
    document.querySelectorAll<HTMLElement>("[data-impact-scene]"),
  );
  const reducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;
  const states: SceneState[] = [];

  cards.forEach((card) => {
    const canvas = card.querySelector<HTMLCanvasElement>(
      ".impact-card__scene",
    );
    const context = canvas?.getContext("2d", { alpha: true });
    const name = card.dataset.impactScene as SceneName | undefined;
    if (!canvas || !context || !name) return;
    const state: SceneState = {
      card,
      canvas,
      context,
      name,
      width: 1,
      height: 1,
      visible: reducedMotion,
      interaction: 0,
      targetInteraction: 0,
      pointerX: 0.5,
      pointerY: 0.35,
      touchReleaseTimer: 0,
    };
    setCanvasSize(state);
    states.push(state);
  });

  if (states.length === 0) return { destroy() {} };

  let frame = 0;
  let destroyed = false;
  const startedAt = performance.now();

  const animate = (now: number) => {
    frame = 0;
    if (destroyed) return;
    let shouldContinue = false;
    states.forEach((state) => {
      if (!state.visible) return;
      renderScene(state, (now - startedAt) / 1_000);
      shouldContinue = true;
    });
    if (shouldContinue && !reducedMotion) {
      frame = window.requestAnimationFrame(animate);
    }
  };

  const schedule = () => {
    if (frame || destroyed || reducedMotion) return;
    frame = window.requestAnimationFrame(animate);
  };

  const intersectionObserver = reducedMotion
    ? null
    : new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const state = states.find(({ card }) => card === entry.target);
          if (!state) return;
          state.visible = entry.isIntersecting;
          state.card.classList.toggle("is-scene-active", entry.isIntersecting);
        });
        schedule();
      },
      { rootMargin: "8% 0px 8% 0px", threshold: 0.12 },
    );

  const resizeObserver = new ResizeObserver((entries) => {
    entries.forEach((entry) => {
      const state = states.find(({ card }) => card === entry.target);
      if (!state) return;
      setCanvasSize(state);
      if (reducedMotion) renderScene(state, 0);
    });
    schedule();
  });

  const cleanups: Array<() => void> = [];
  states.forEach((state) => {
    intersectionObserver?.observe(state.card);
    resizeObserver.observe(state.card);

    const updatePointer = (event: PointerEvent) => {
      const rect = state.card.getBoundingClientRect();
      state.pointerX = clamp01((event.clientX - rect.left) / rect.width);
      state.pointerY = clamp01((event.clientY - rect.top) / rect.height);
      state.targetInteraction = 1;
      state.card.classList.add("is-interacting");
      schedule();
    };
    const releasePointer = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      state.targetInteraction = 0;
      state.card.classList.remove("is-interacting");
    };
    const releaseTouch = () => {
      window.clearTimeout(state.touchReleaseTimer);
      state.touchReleaseTimer = window.setTimeout(() => {
        state.targetInteraction = 0;
        state.card.classList.remove("is-interacting");
      }, 1_400);
    };

    state.card.addEventListener("pointerenter", updatePointer);
    state.card.addEventListener("pointermove", updatePointer);
    state.card.addEventListener("pointerleave", releasePointer);
    state.card.addEventListener("pointerup", releaseTouch);
    state.card.addEventListener("pointercancel", releaseTouch);
    cleanups.push(() => {
      state.card.removeEventListener("pointerenter", updatePointer);
      state.card.removeEventListener("pointermove", updatePointer);
      state.card.removeEventListener("pointerleave", releasePointer);
      state.card.removeEventListener("pointerup", releaseTouch);
      state.card.removeEventListener("pointercancel", releaseTouch);
    });
  });

  if (reducedMotion) {
    states.forEach((state) => {
      state.card.classList.add("is-scene-active");
      renderScene(state, 0);
    });
  }

  return {
    destroy() {
      destroyed = true;
      window.cancelAnimationFrame(frame);
      intersectionObserver?.disconnect();
      resizeObserver.disconnect();
      cleanups.forEach((cleanup) => cleanup());
      states.forEach((state) => {
        window.clearTimeout(state.touchReleaseTimer);
        state.card.classList.remove("is-scene-active", "is-interacting");
        state.context.clearRect(0, 0, state.width, state.height);
      });
    },
  };
}

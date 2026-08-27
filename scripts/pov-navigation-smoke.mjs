import { chromium } from "playwright-core";

const executablePath =
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const baseURL =
  process.env.SWISSCOMPACT_BASE_URL ?? "http://127.0.0.1:4174/";
const browser = await chromium.launch({ executablePath, headless: true });
const errors = [];

const position = async (page) => page.locator("[data-showroom]").evaluate(
  (root) => ({
    state: root.getAttribute("data-showroom-pov-state"),
    x: Number(root.getAttribute("data-showroom-pov-x")),
    y: Number(root.getAttribute("data-showroom-pov-y")),
    z: Number(root.getAttribute("data-showroom-pov-z")),
    yaw: Number(root.getAttribute("data-showroom-pov-yaw")),
    pitch: Number(root.getAttribute("data-showroom-pov-pitch")),
  }),
);

const prepare = async (page) => {
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(baseURL, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.evaluate(() => {
    document.querySelector("[data-showroom]")?.scrollIntoView({
      block: "start",
      behavior: "instant",
    });
  });
  await page.waitForFunction(() => (
    document.querySelector("[data-showroom]")?.getAttribute(
      "data-showroom-ready",
    ) === "true"
    && document.querySelector("[data-showroom]")?.getAttribute(
      "data-showroom-pov-state",
    ) === "active"
  ), undefined, { timeout: 45_000 });
};

const desktopPage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await prepare(desktopPage);
const desktopStart = await position(desktopPage);
const totalStart = await desktopPage.evaluate(() => {
  const root = document.querySelector("[data-showroom]");
  const scale = Number(root?.getAttribute("data-showroom-room-scale-factor"));
  return {
    view: root?.getAttribute("data-showroom-pov-view"),
    entry: root?.getAttribute("data-showroom-pov-entry"),
    scale,
    expectedZ: 6.02,
    roomOffsetZ: Number(root?.getAttribute("data-showroom-room-offset-z")),
  };
});
const crosshairRemoved = await desktopPage.evaluate(() => (
  !document.querySelector(".showroom-pov-crosshair")
  && !document.querySelector("[data-showroom-pov-interact-hint]")
));
const configurationVisible = await desktopPage.evaluate(() => {
  const selectors = [
    ".showroom-focus-header",
    ".showroom-use-guide",
    ".showroom-focus-tools",
  ];
  return selectors.every((selector) => {
    const element = document.querySelector(selector);
    if (!(element instanceof HTMLElement)) return false;
    const style = getComputedStyle(element);
    return style.display !== "none"
      && style.visibility !== "hidden"
      && Number(style.opacity) > 0.5
      && style.pointerEvents !== "none";
  });
});
const arrowPadVisible = await desktopPage.locator(".showroom-pov-arrow-pad")
  .evaluate((pad) => {
    const bounds = pad.getBoundingClientRect();
    return getComputedStyle(pad).display !== "none"
      && bounds.bottom <= innerHeight
      && bounds.left >= 0
      && bounds.right <= innerWidth
      && pad.querySelectorAll("[data-showroom-pov-move]").length === 0
      && pad.querySelectorAll(".showroom-pov-motion-ring__arrow").length === 8
      && Boolean(pad.querySelector("[data-showroom-pov-ring]"))
      && Boolean(pad.querySelector(".showroom-pov-room-size"));
  });
const ringStatusLayout = await desktopPage.evaluate(() => {
  const ring = document.querySelector("[data-showroom-pov-ring]");
  const status = document.querySelector(".showroom-status");
  if (!(ring instanceof HTMLElement) || !(status instanceof HTMLElement)) {
    return { separated: false, gap: -1 };
  }
  const ringBounds = ring.getBoundingClientRect();
  const statusBounds = status.getBoundingClientRect();
  return {
    separated: statusBounds.top >= ringBounds.bottom + 8,
    gap: statusBounds.top - ringBounds.bottom,
  };
});
await desktopPage.screenshot({
  path: "/tmp/swisscompact-pov-ring-status.png",
  fullPage: false,
});
await desktopPage.keyboard.down("w");
await desktopPage.waitForTimeout(600);
const keyboardArrowActive = await desktopPage.locator(
  "[data-showroom-pov-ring]",
).evaluate((ring) => ring.classList.contains("is-active"));
await desktopPage.keyboard.up("w");
const desktopMoved = await position(desktopPage);
const clickRingAt = async (page, xRatio, yRatio) => {
  const bounds = await page.locator("[data-showroom-pov-ring]").boundingBox();
  if (!bounds) throw new Error("360-degree movement ring is missing");
  await page.mouse.click(
    bounds.x + bounds.width * xRatio,
    bounds.y + bounds.height * yRatio,
  );
};
const beforeArrowClick = await position(desktopPage);
await clickRingAt(desktopPage, 0.88, 0.5);
await desktopPage.waitForTimeout(2500);
const afterArrowClick = await position(desktopPage);
const beforeDiagonalClick = await position(desktopPage);
await clickRingAt(desktopPage, 0.8, 0.2);
await desktopPage.waitForTimeout(1350);
const afterDiagonalClick = await position(desktopPage);
const ringBoundsForHold = await desktopPage.locator(
  "[data-showroom-pov-ring]",
).boundingBox();
if (!ringBoundsForHold) throw new Error("360-degree movement ring is missing");
const beforeRingHold = await position(desktopPage);
await desktopPage.mouse.move(
  ringBoundsForHold.x + ringBoundsForHold.width * 0.88,
  ringBoundsForHold.y + ringBoundsForHold.height * 0.5,
);
await desktopPage.mouse.down();
await desktopPage.waitForTimeout(2500);
await desktopPage.mouse.up();
const afterRingHold = await position(desktopPage);
await desktopPage.waitForTimeout(320);
const afterRingRelease = await position(desktopPage);
await desktopPage.locator(".showroom-pov-room-size summary").click();
await desktopPage.locator(
  '.showroom-pov-room-size [data-showroom-setting="roomSize"][data-value="standard"]',
).click();
await desktopPage.waitForFunction(() => (
  document.querySelector("[data-showroom]")?.getAttribute("data-showroom-room-size")
    === "standard"
));
const centerRoomSizeChanged = await desktopPage.evaluate(() => ({
  roomSize: document.querySelector("[data-showroom]")?.getAttribute(
    "data-showroom-room-size",
  ),
  label: document.querySelector(
    ".showroom-pov-room-size [data-showroom-navbar-value=\"roomSize\"]",
  )?.textContent?.trim(),
  closed: !document.querySelector(".showroom-pov-room-size")?.hasAttribute("open"),
  roomOffsetZ: Number(document.querySelector("[data-showroom]")?.getAttribute(
    "data-showroom-room-offset-z",
  )),
}));
const centerRoomSizePosition = await position(desktopPage);
await desktopPage.locator(".showroom-pov-room-size summary").click();
await desktopPage.locator(
  '.showroom-pov-room-size [data-showroom-setting="roomSize"][data-value="small"]',
).click();
await desktopPage.waitForFunction(() => (
  document.querySelector("[data-showroom]")?.getAttribute("data-showroom-room-size")
    === "small"
));
const restoredRoomSizePosition = await position(desktopPage);
const navbarRoomSizeRemoved = await desktopPage.evaluate(() => (
  document.querySelectorAll(
    ".showroom-focus-header [data-showroom-setting=\"roomSize\"]",
  ).length === 0
  && !document.querySelector("[data-showroom-room-label]")?.textContent?.includes(" · ")
));
const beforeBackwardClick = await position(desktopPage);
await clickRingAt(desktopPage, 0.5, 0.88);
await desktopPage.waitForTimeout(80);
const afterBackwardClick = await position(desktopPage);
await desktopPage.keyboard.press("r");
const canvasBounds = await desktopPage.locator("[data-showroom-canvas]")
  .boundingBox();
const beforeCanvasDrag = await position(desktopPage);
if (canvasBounds) {
  const centerX = canvasBounds.x + canvasBounds.width / 2;
  const centerY = canvasBounds.y + canvasBounds.height / 2;
  await desktopPage.mouse.move(centerX, centerY);
  await desktopPage.mouse.down({ button: "right" });
  await desktopPage.mouse.move(centerX + 170, centerY - 65, { steps: 5 });
  await desktopPage.mouse.up({ button: "right" });
}
const afterCanvasDrag = await position(desktopPage);
await desktopPage.keyboard.press("Space");
await desktopPage.waitForTimeout(160);
const desktopJumped = await position(desktopPage);
await desktopPage.waitForTimeout(850);
const desktopLanded = await position(desktopPage);
await desktopPage.keyboard.down("c");
await desktopPage.waitForTimeout(120);
const desktopCrouched = await position(desktopPage);
await desktopPage.keyboard.up("c");
await desktopPage.waitForTimeout(120);
await desktopPage.keyboard.press("Escape");
const stateAfterEscape = await position(desktopPage);

await desktopPage.locator('[data-showroom-focus-tool="display"]')
  .evaluate((button) => button.click());
await desktopPage.waitForFunction(() => (
  document.querySelector('[data-showroom-selection-item^="display:"]') !== null
));
await desktopPage.locator('[data-showroom-selection-item^="display:"]')
  .first().evaluate((button) => button.click());
await desktopPage.waitForFunction(() => (
  document.querySelector("[data-showroom]")?.classList.contains(
    "has-display-selection",
  )
));
await desktopPage.locator("[data-showroom-display-flyout-close]")
  .evaluate((button) => button.click());
await desktopPage.keyboard.press("e");
await desktopPage.waitForFunction(() => (
  document.querySelector("[data-showroom]")?.classList.contains(
    "has-display-selection",
  )
));
const configurationOpened = await desktopPage.evaluate(() => ({
  povState: document.querySelector("[data-showroom]")?.getAttribute(
    "data-showroom-pov-state",
  ),
  flyoutVisible: !document.querySelector("[data-showroom-display-flyout]")
    ?.hasAttribute("hidden"),
  previewAvailable: Boolean(
    document.querySelector("[data-showroom-display-preview-open]"),
  ),
  gameInteraction: document.querySelector("[data-showroom]")?.getAttribute(
    "data-showroom-pov-last-interaction",
  ),
}));
await desktopPage.keyboard.press("r");
const desktopReset = await position(desktopPage);
const steeringSpeeds = await desktopPage.evaluate(() => ({
  walk: Number(document.querySelector("[data-showroom]")?.getAttribute(
    "data-showroom-pov-walk-speed",
  )),
  turn: Number(document.querySelector("[data-showroom]")?.getAttribute(
    "data-showroom-pov-steer-speed",
  )),
  tap: Number(document.querySelector("[data-showroom]")?.getAttribute(
    "data-showroom-pov-tap-step",
  )),
}));
await desktopPage.screenshot({ path: "/tmp/swisscompact-pov-config-desktop.png" });
await desktopPage.close();

const mobileContext = await browser.newContext({
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
});
const mobilePage = await mobileContext.newPage();
await prepare(mobilePage);
const mobileStart = await position(mobilePage);
const forward = await mobilePage.locator("[data-showroom-pov-ring]")
  .boundingBox();
if (forward) {
  const mobileSession = await mobileContext.newCDPSession(mobilePage);
  const point = {
    x: forward.x + forward.width / 2,
    y: forward.y + forward.height * 0.12,
  };
  await mobileSession.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [point],
  });
  await mobilePage.waitForTimeout(420);
  await mobileSession.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
}
const mobileMoved = await position(mobilePage);
const mobileUi = await mobilePage.evaluate(() => ({
  ringVisible: getComputedStyle(
    document.querySelector("[data-showroom-pov-ring]"),
  ).display !== "none",
  extraLookControlRemoved: !document.querySelector("[data-showroom-pov-look]"),
  configurationVisible: getComputedStyle(
    document.querySelector(".showroom-focus-tools"),
  ).pointerEvents !== "none",
  gameButtonRemoved: !document.querySelector("[data-showroom-pov-reset]"),
}));
await mobilePage.screenshot({ path: "/tmp/swisscompact-pov-config-mobile.png" });
await mobileContext.close();
await browser.close();

const desktopDistance = Math.hypot(
  desktopMoved.x - desktopStart.x,
  desktopMoved.z - desktopStart.z,
);
const mobileDistance = Math.hypot(
  mobileMoved.x - mobileStart.x,
  mobileMoved.z - mobileStart.z,
);
const resetDistance = Math.hypot(
  desktopReset.x - desktopStart.x,
  desktopReset.z - desktopStart.z,
);
const arrowClickDistance = Math.hypot(
  afterArrowClick.x - beforeArrowClick.x,
  afterArrowClick.z - beforeArrowClick.z,
);
const backwardArrowDistance = Math.hypot(
  afterBackwardClick.x - beforeBackwardClick.x,
  afterBackwardClick.z - beforeBackwardClick.z,
);
const yawDistance = (first, second) => Math.abs(Math.atan2(
  Math.sin(second - first),
  Math.cos(second - first),
));
const forwardSteeringYaw = yawDistance(
  beforeArrowClick.yaw,
  afterArrowClick.yaw,
);
const diagonalSteeringYaw = yawDistance(
  beforeDiagonalClick.yaw,
  afterDiagonalClick.yaw,
);
const heldSteeringYaw = yawDistance(
  beforeRingHold.yaw,
  afterRingHold.yaw,
);
const releasedSteeringYaw = yawDistance(
  afterRingHold.yaw,
  afterRingRelease.yaw,
);
const backwardSteeringYaw = yawDistance(
  beforeBackwardClick.yaw,
  afterBackwardClick.yaw,
);
const diagonalDelta = {
  x: Math.abs(afterDiagonalClick.x - beforeDiagonalClick.x),
  z: Math.abs(afterDiagonalClick.z - beforeDiagonalClick.z),
};
const valid = Boolean(
  desktopStart.state === "active"
  && crosshairRemoved
  && totalStart.view === "total"
  && totalStart.entry === "front-wall"
  && Math.abs(desktopStart.z - totalStart.expectedZ) < 0.05
  && configurationVisible
  && arrowPadVisible
  && ringStatusLayout.separated
  && keyboardArrowActive
  && steeringSpeeds.walk === 3.9
  && steeringSpeeds.turn === 0.68
  && steeringSpeeds.tap === 0.035
  && desktopDistance > 0.5
  && yawDistance(beforeCanvasDrag.yaw, afterCanvasDrag.yaw) < 0.01
  && desktopJumped.y > desktopMoved.y + 0.25
  && desktopLanded.y < desktopJumped.y - 0.2
  && desktopCrouched.y < 2.5
  && stateAfterEscape.state === "active"
  && configurationOpened.povState === "active"
  && configurationOpened.flyoutVisible
  && configurationOpened.previewAvailable
  && configurationOpened.gameInteraction === "display"
  && arrowClickDistance > 0.08
  && arrowClickDistance < 0.2
  && forwardSteeringYaw < 0.1
  && diagonalDelta.x > 0.05
  && diagonalDelta.z > 0.05
  && diagonalSteeringYaw < 0.1
  && heldSteeringYaw > 1.35
  && releasedSteeringYaw < 0.02
  && centerRoomSizeChanged.roomSize === "standard"
  && centerRoomSizeChanged.label === "L"
  && centerRoomSizeChanged.closed
  && Math.abs(centerRoomSizePosition.z - desktopStart.z) < 0.05
  && centerRoomSizeChanged.roomOffsetZ < totalStart.roomOffsetZ - 20
  && Math.abs(restoredRoomSizePosition.z - desktopStart.z) < 0.05
  && navbarRoomSizeRemoved
  && backwardArrowDistance > 0.08
  && backwardArrowDistance < 0.2
  && afterBackwardClick.z > beforeBackwardClick.z
  && backwardSteeringYaw < 0.03
  && resetDistance < 0.05
  && mobileStart.state === "active"
  && mobileDistance > 0.15
  && mobileUi.ringVisible
  && mobileUi.extraLookControlRemoved
  && mobileUi.configurationVisible
  && mobileUi.gameButtonRemoved
  && errors.length === 0
);

console.log(JSON.stringify({
  valid,
  desktop: {
    start: desktopStart,
    totalStart,
    crosshairRemoved,
    moved: desktopMoved,
    distance: desktopDistance,
    canvasDragYaw: yawDistance(beforeCanvasDrag.yaw, afterCanvasDrag.yaw),
    jumped: desktopJumped,
    landed: desktopLanded,
    crouched: desktopCrouched,
    stateAfterEscape: stateAfterEscape.state,
    configurationVisible,
    arrowPadVisible,
    ringStatusLayout,
    keyboardArrowActive,
    steeringSpeeds,
    configurationOpened,
    arrowClickDistance,
    forwardSteeringYaw,
    diagonalDelta,
    diagonalSteeringYaw,
    heldSteeringYaw,
    releasedSteeringYaw,
    centerRoomSizeChanged,
    centerRoomSizePosition,
    restoredRoomSizePosition,
    navbarRoomSizeRemoved,
    backwardArrowDistance,
    backwardSteeringYaw,
    resetDistance,
  },
  mobile: {
    start: mobileStart,
    moved: mobileMoved,
    distance: mobileDistance,
    ...mobileUi,
  },
  errors,
}, null, 2));

if (!valid) process.exitCode = 1;

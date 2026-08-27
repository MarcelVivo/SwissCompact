import { chromium } from "playwright-core";

const executablePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const baseURL = process.env.SWISSCOMPACT_BASE_URL ?? "http://127.0.0.1:4173/";
const chapterCount = 11;
const errors = [];
const failedRequests = [];
const cancelledMediaRequests = [];
const browser = await chromium.launch({ executablePath, headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});
page.on("pageerror", (error) => errors.push(error.message));
page.on("requestfailed", (request) => {
  const failure = `${request.url()}: ${request.failure()?.errorText ?? "failed"}`;
  if (request.failure()?.errorText === "net::ERR_ABORTED") {
    cancelledMediaRequests.push(failure);
    return;
  }
  failedRequests.push(failure);
});

const response = await page.goto(baseURL, {
  waitUntil: "domcontentloaded",
  timeout: 30_000,
});
await page.waitForSelector("#station-1");
await page.waitForTimeout(800);

const initialState = await page.evaluate(() => ({
  attachedVideos: Array.from(document.querySelectorAll("video"))
    .filter((video) => Boolean(video.currentSrc || video.getAttribute("src")))
    .length,
  totalVideos: document.querySelectorAll("video").length,
  stations: document.querySelectorAll(".station").length,
}));

const forwardSelectors = [
  "#intro .intro__scroll-video--forward",
  "#scene-two .photographic-scene__video--forward",
  "#scene-three .photographic-scene__video--forward",
  "#scene-four .photographic-scene__video--forward",
  "#scene-five .photographic-scene__video--forward",
  "#scene-six .photographic-scene__video--forward",
  "#scene-seven .photographic-scene__video--forward",
  "#scene-eight .photographic-scene__video--forward",
  "#scene-nine .photographic-scene__video--forward",
  "#scene-ten .photographic-scene__video--forward",
  "#scene-eleven .photographic-scene__video--forward",
];
const reverseSelectors = forwardSelectors.map((selector) => (
  selector.replace("--forward", "--reverse")
));

async function jumpToJourney(journey) {
  await page.evaluate(({ journey, chapterCount: chapters }) => {
    const scroller = document.querySelector("#scroller");
    const maximum = Math.max(
      1,
      (scroller instanceof HTMLElement ? scroller.offsetHeight : 0)
        - window.innerHeight,
    );
    window.scrollTo(0, journey / chapters * maximum);
  }, { journey, chapterCount });
  await page.waitForTimeout(180);
}

async function waitForVideo(selector) {
  await page.waitForFunction((videoSelector) => {
    const video = document.querySelector(videoSelector);
    return video instanceof HTMLVideoElement
      && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
      && Number.isFinite(video.duration)
      && video.duration > 0;
  }, selector, { timeout: 20_000 });
}

async function measureScroll(fromJourney, toJourney, videoSelector) {
  return page.evaluate(async ({
    from,
    to,
    selector,
    chapters,
  }) => {
    const scroller = document.querySelector("#scroller");
    const maximum = Math.max(
      1,
      (scroller instanceof HTMLElement ? scroller.offsetHeight : 0)
        - window.innerHeight,
    );
    const video = document.querySelector(selector);
    let decodedFrames = 0;
    let countFrames = true;

    if (
      video instanceof HTMLVideoElement
      && "requestVideoFrameCallback" in video
    ) {
      const countFrame = () => {
        decodedFrames += 1;
        if (countFrames) video.requestVideoFrameCallback(countFrame);
      };
      video.requestVideoFrameCallback(countFrame);
    }

    window.scrollTo(0, from / chapters * maximum);
    await new Promise((resolve) => requestAnimationFrame(() => resolve()));

    const frameGaps = [];
    const duration = 950;
    const startedAt = performance.now();
    let previousFrame = startedAt;

    await new Promise((resolve) => {
      const animate = (now) => {
        frameGaps.push(now - previousFrame);
        previousFrame = now;
        const progress = Math.min(1, (now - startedAt) / duration);
        const eased = progress * progress * (3 - 2 * progress);
        const journey = from + (to - from) * eased;
        window.scrollTo(0, journey / chapters * maximum);
        if (progress < 1) requestAnimationFrame(animate);
        else resolve();
      };
      requestAnimationFrame(animate);
    });
    await new Promise((resolve) => setTimeout(resolve, 140));
    countFrames = false;

    const sortedGaps = [...frameGaps].sort((left, right) => left - right);
    const percentileIndex = Math.min(
      sortedGaps.length - 1,
      Math.floor(sortedGaps.length * 0.95),
    );
    return {
      decodedFrames,
      renderedFrames: frameGaps.length,
      p95FrameGap: sortedGaps[percentileIndex] ?? 0,
      maximumFrameGap: Math.max(0, ...frameGaps),
    };
  }, {
    from: fromJourney,
    to: toJourney,
    selector: videoSelector,
    chapters: chapterCount,
  });
}

const forwardMetrics = [];
for (let chapter = 0; chapter < forwardSelectors.length; chapter += 1) {
  await jumpToJourney(chapter + 0.08);
  await waitForVideo(forwardSelectors[chapter]);
  forwardMetrics.push(await measureScroll(
    chapter + 0.08,
    chapter + 0.92,
    forwardSelectors[chapter],
  ));
}

await jumpToJourney(10.6);
await page.waitForFunction(() => (
  document.querySelector("#station-11")?.classList.contains("is-active")
), undefined, { timeout: 8_000 });

const reverseMetrics = [];
for (let chapter = reverseSelectors.length - 1; chapter >= 0; chapter -= 1) {
  await jumpToJourney(chapter + 0.92);
  await jumpToJourney(chapter + 0.86);
  await waitForVideo(reverseSelectors[chapter]);
  reverseMetrics.push(await measureScroll(
    chapter + 0.86,
    chapter + 0.08,
    reverseSelectors[chapter],
  ));
}

const finalState = await page.evaluate(() => {
  const videos = Array.from(document.querySelectorAll("video"));
  return {
    attachedVideos: videos.filter((video) => (
      Boolean(video.currentSrc || video.getAttribute("src"))
    )).length,
    readyVideos: videos.filter((video) => (
      video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
    )).length,
    activeStation: document.querySelector(".station.is-active")?.id ?? null,
  };
});

await jumpToJourney(0);
await page.waitForTimeout(500);
await page.locator("[data-marketing-target=\"#wirkung\"]").first().click({
  force: false,
});
await page.waitForFunction(() => {
  const section = document.querySelector("#wirkung");
  return document.body.classList.contains("is-marketing-view")
    && section instanceof HTMLElement
    && section.getBoundingClientRect().top >= 0
    && section.getBoundingClientRect().top < 90;
}, undefined, { timeout: 8_000 });
await page.locator("[data-solution-goal=\"begeistern\"]").click();
await page.waitForTimeout(760);
const marketingState = await page.evaluate(() => ({
  marketingView: document.body.classList.contains("is-marketing-view"),
  impactHeading: document.querySelector("#wirkung h2")?.textContent?.trim() ?? "",
  activeSolution: document.querySelector(
    "[data-solution-goal][aria-selected=\"true\"]",
  )?.textContent?.trim() ?? "",
  solutionTitle: document.querySelector("[data-solution-title]")?.textContent?.trim() ?? "",
  activeSolutionScene: document.querySelector("[data-solution-result]")
    ?.getAttribute("data-active-solution") ?? "",
  solutionCanvasPopulated: (() => {
    const canvas = document.querySelector(".solution-result__canvas");
    if (!(canvas instanceof HTMLCanvasElement)) return false;
    const context = canvas.getContext("2d");
    if (!context) return false;
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    for (let index = 3; index < pixels.length; index += 128) {
      if (pixels[index] > 0) return true;
    }
    return false;
  })(),
}));

await page.locator(".impact-grid").scrollIntoViewIfNeeded();
await page.waitForTimeout(650);
await page.locator(".impact-card").first().hover({ position: { x: 150, y: 80 } });
const impactScenesState = await page.evaluate(async () => {
  const frameGaps = [];
  const startedAt = performance.now();
  let previousFrame = startedAt;
  await new Promise((resolve) => {
    const measure = (now) => {
      frameGaps.push(now - previousFrame);
      previousFrame = now;
      if (now - startedAt < 700) requestAnimationFrame(measure);
      else resolve();
    };
    requestAnimationFrame(measure);
  });
  const canvases = Array.from(document.querySelectorAll(".impact-card__scene"));
  const populatedCanvases = canvases.filter((canvas) => {
    if (!(canvas instanceof HTMLCanvasElement)) return false;
    const context = canvas.getContext("2d");
    if (!context) return false;
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    for (let index = 3; index < pixels.length; index += 128) {
      if (pixels[index] > 0) return true;
    }
    return false;
  }).length;
  const sortedGaps = [...frameGaps].sort((left, right) => left - right);
  return {
    canvases: canvases.length,
    populatedCanvases,
    activeCards: document.querySelectorAll(".impact-card.is-scene-active").length,
    interactingCards: document.querySelectorAll(".impact-card.is-interacting").length,
    p95FrameGap: sortedGaps[
      Math.min(sortedGaps.length - 1, Math.floor(sortedGaps.length * 0.95))
    ] ?? 0,
  };
});

await page.locator("[data-showroom]").scrollIntoViewIfNeeded();
await page.waitForFunction(() => (
  document.querySelector("[data-showroom]")?.getAttribute("data-showroom-ready")
    === "true"
), undefined, { timeout: 30_000 });
const selectEdgeSetting = async (menu, key, value) => {
  const edgeMenu = page.locator(`.showroom-edge-menu--${menu}`);
  await edgeMenu.locator("[data-showroom-edge-trigger]").hover();
  await page.waitForTimeout(180);
  await edgeMenu.locator(
    `[data-showroom-setting="${key}"][data-value="${value}"]`,
  ).click({ force: true });
};
const changeEdgeCount = async (change) => {
  const edgeMenu = page.locator(".showroom-edge-menu--position");
  await edgeMenu.locator("[data-showroom-edge-trigger]").hover();
  await page.waitForTimeout(180);
  await edgeMenu.locator(`[data-showroom-count="${change}"]`).click({
    force: true,
  });
};
const perimeterMainState = await page.evaluate(() => {
  const showroom = document.querySelector("[data-showroom]");
  const buttons = Array.from(document.querySelectorAll(".showroom-edge-trigger"));
  const consultation = document.querySelector(".showroom-edge-cta");
  const heading = document.querySelector(".showroom-header h3");
  const viewSwitcher = document.querySelector(".showroom-view-switcher");
  const displayTrigger = document.querySelector(
    ".showroom-edge-menu--displays [data-showroom-edge-trigger]",
  );
  const statusLine = document.querySelector(".showroom-status");
  if (!(showroom instanceof HTMLElement)) return null;
  const showroomBounds = showroom.getBoundingClientRect();
  const controlBounds = [
    ...buttons.map((button) => button.getBoundingClientRect()),
    ...(consultation ? [consultation.getBoundingClientRect()] : []),
  ];
  const headingBounds = heading?.getBoundingClientRect();
  const viewBounds = viewSwitcher?.getBoundingClientRect();
  const centerElement = document.elementFromPoint(
    showroomBounds.left + showroomBounds.width / 2,
    showroomBounds.top + showroomBounds.height / 2,
  );
  return {
    layout: showroom.dataset.showroomControlLayout ?? "",
    mainLabels: buttons.map((button) => (
      button.querySelector("strong")?.textContent?.trim() ?? ""
    )),
    allVisible: buttons.every((button) => {
      const bounds = button.getBoundingClientRect();
      const styles = getComputedStyle(button);
      return bounds.width > 100
        && bounds.height > 40
        && styles.visibility === "visible";
    }),
    allInside: controlBounds.every((bounds) => (
      bounds.left >= showroomBounds.left
      && bounds.right <= showroomBounds.right
      && bounds.top >= showroomBounds.top
      && bounds.bottom <= showroomBounds.bottom
    )),
    topControlsClearHeading: Boolean(
      !headingBounds
      || buttons.slice(0, 2).every(
        (button) => button.getBoundingClientRect().bottom <= headingBounds.top,
      )
    ),
    topControlsAligned: Boolean(
      viewBounds
      && buttons.slice(0, 2).every((button) => {
        const bounds = button.getBoundingClientRect();
        return Math.abs(
          bounds.top + bounds.height / 2
          - (viewBounds.top + viewBounds.height / 2),
        ) <= 2;
      })
    ),
    topControlsNearCenter: Boolean(
      viewBounds
      && buttons[0]
      && buttons[1]
      && viewBounds.left - buttons[0].getBoundingClientRect().right > 20
      && viewBounds.left - buttons[0].getBoundingClientRect().right < 120
      && buttons[1].getBoundingClientRect().left - viewBounds.right > 20
      && buttons[1].getBoundingClientRect().left - viewBounds.right < 120
    ),
    displayControlAboveStatus: Boolean(
      displayTrigger instanceof HTMLElement
      && statusLine instanceof HTMLElement
      && displayTrigger.getBoundingClientRect().bottom
        <= statusLine.getBoundingClientRect().top
    ),
    centerClear: centerElement?.classList.contains("showroom-canvas") ?? false,
  };
});
const themeSelector = page.locator("[data-showroom-themes-toggle]").first();
await themeSelector.click();
await page.waitForTimeout(420);
const themeMenuState = await page.evaluate(() => {
  const selector = document.querySelector("[data-showroom-themes-toggle]");
  const menu = document.querySelector("[data-showroom-themes]");
  const options = Array.from(menu?.querySelectorAll("li > button") ?? []);
  return {
    selectorLabel: selector?.querySelector("[data-showroom-theme-label]")
      ?.textContent?.trim() ?? "",
    expanded: selector?.getAttribute("aria-expanded") === "true",
    menuOpen: menu?.classList.contains("is-open") ?? false,
    themeCount: options.length,
    activeEnabled: options[0] instanceof HTMLButtonElement && !options[0].disabled,
    futureThemesDisabled: options.slice(1).every(
      (option) => option instanceof HTMLButtonElement && option.disabled,
    ),
    oldBottomToggleRemoved: !document.querySelector(".showroom-themes-toggle"),
  };
});
await page.locator("[data-showroom-theme-option=\"gastronomy\"]").click();
await page.waitForTimeout(220);
const themeMenuClosedState = await page.evaluate(() => ({
  menuOpen: document.querySelector("[data-showroom-themes]")
    ?.classList.contains("is-open") ?? false,
  expanded: document.querySelector("[data-showroom-themes-toggle]")
    ?.getAttribute("aria-expanded") ?? "",
}));
const roomTypeMenu = page.locator(".showroom-edge-menu--room-type");
await roomTypeMenu.locator("[data-showroom-edge-trigger]").hover();
await page.waitForTimeout(350);
const perimeterFlyoutOpenState = await roomTypeMenu.evaluate((menu) => {
  const flyout = menu.querySelector("[data-showroom-edge-flyout]");
  const trigger = menu.querySelector("[data-showroom-edge-trigger]");
  if (!(flyout instanceof HTMLElement) || !(trigger instanceof HTMLElement)) {
    return { open: false, highContrast: false, expanded: false };
  }
  const flyoutStyles = getComputedStyle(flyout);
  const triggerStyles = getComputedStyle(trigger);
  return {
    open: menu.classList.contains("is-open")
      && flyoutStyles.visibility === "visible"
      && Number(flyoutStyles.opacity) > 0.9,
    highContrast:
      flyoutStyles.backgroundImage !== "none"
      && triggerStyles.backgroundColor === "rgb(217, 11, 50)",
    expanded: trigger.getAttribute("aria-expanded") === "true",
  };
});
await roomTypeMenu.locator(
  "[data-showroom-setting=\"preset\"][data-value=\"restaurant\"]",
).click();
const perimeterFlyoutPersistentState = await roomTypeMenu.evaluate((menu) => ({
  open: menu.classList.contains("is-open"),
  expanded: menu.querySelector("[data-showroom-edge-trigger]")
    ?.getAttribute("aria-expanded") ?? "",
}));
const roomSizeMenu = page.locator(".showroom-edge-menu--room-size");
await roomSizeMenu.locator("[data-showroom-edge-trigger]").hover();
await page.waitForTimeout(180);
const perimeterFlyoutSwitchState = await page.evaluate(() => ({
  roomTypeOpen: document.querySelector(".showroom-edge-menu--room-type")
    ?.classList.contains("is-open") ?? false,
  roomSizeOpen: document.querySelector(".showroom-edge-menu--room-size")
    ?.classList.contains("is-open") ?? false,
}));
await page.locator("[data-showroom-canvas]").dispatchEvent("pointerdown", {
  pointerId: 89,
  pointerType: "mouse",
  button: 0,
  buttons: 1,
  clientX: 720,
  clientY: 450,
});
await page.locator("[data-showroom-canvas]").dispatchEvent("pointerup", {
  pointerId: 89,
  pointerType: "mouse",
  button: 0,
  buttons: 0,
  clientX: 720,
  clientY: 450,
});
const perimeterFlyoutRoomDismissState = await page.evaluate(() => ({
  openMenus: document.querySelectorAll(".showroom-edge-menu.is-open").length,
}));
const perimeterFlyoutReachabilityState = [];
for (const selector of [
  ".showroom-edge-menu--room-type",
  ".showroom-edge-menu--room-size",
  ".showroom-edge-menu--position",
  ".showroom-edge-menu--displays",
  ".showroom-edge-menu--content",
  ".showroom-edge-menu--light",
  ".showroom-edge-menu--furnishings",
]) {
  await page.mouse.move(720, 450);
  await page.waitForTimeout(340);
  const menu = page.locator(selector);
  const trigger = menu.locator("[data-showroom-edge-trigger]");
  const flyout = menu.locator("[data-showroom-edge-flyout]");
  await trigger.hover();
  await page.waitForTimeout(220);
  const enabledOption = flyout.locator("button:not([disabled])").first();
  if (await enabledOption.count()) await enabledOption.hover();
  else await flyout.hover();
  await page.waitForTimeout(360);
  perimeterFlyoutReachabilityState.push(await menu.evaluate((item) => {
    const flyoutElement = item.querySelector("[data-showroom-edge-flyout]");
    const styles = flyoutElement instanceof HTMLElement
      ? getComputedStyle(flyoutElement)
      : null;
    return {
      label: item.querySelector("strong")?.textContent?.trim() ?? "",
      remainedOpen: item.classList.contains("is-open")
        && styles?.visibility === "visible"
        && Number(styles?.opacity ?? 0) > 0.9,
    };
  }));
}
await page.mouse.move(720, 450);
await page.waitForTimeout(340);
await changeEdgeCount("1");
await changeEdgeCount("1");
await changeEdgeCount("1");
await selectEdgeSetting("displays", "orientation", "portrait");
await selectEdgeSetting("light", "light", "evening");
const clickShowroomWall = async (focus) => {
  await page.mouse.move(720, 450);
  await page.waitForTimeout(420);
  await page.waitForFunction((selectedFocus) => {
    const showroom = document.querySelector("[data-showroom]");
    return Number.isFinite(Number(
      showroom?.getAttribute(`data-showroom-wall-${selectedFocus}-screen-x`),
    )) && Number.isFinite(Number(
      showroom?.getAttribute(`data-showroom-wall-${selectedFocus}-screen-y`),
    ));
  }, focus, { timeout: 10_000 });
  const point = await page.evaluate((selectedFocus) => {
    const showroom = document.querySelector("[data-showroom]");
    const canvas = document.querySelector("[data-showroom-canvas]");
    if (!(canvas instanceof HTMLCanvasElement)) return { x: 0, y: 0 };
    const bounds = canvas.getBoundingClientRect();
    return {
      x: bounds.left + Number(showroom?.getAttribute(
        `data-showroom-wall-${selectedFocus}-screen-x`,
      )),
      y: bounds.top + Number(showroom?.getAttribute(
        `data-showroom-wall-${selectedFocus}-screen-y`,
      )),
    };
  }, focus);
  let clickPoint = point;
  for (const [offsetX, offsetY] of [
    [0, 0],
    [8, 0],
    [-8, 0],
    [0, 8],
    [0, -8],
  ]) {
    const candidate = {
      x: point.x + offsetX,
      y: point.y + offsetY,
    };
    await page.mouse.move(candidate.x, candidate.y);
    await page.waitForTimeout(90);
    const hoveredWall = await page.locator("[data-showroom]").getAttribute(
      "data-showroom-hovered-wall",
    );
    clickPoint = candidate;
    if (hoveredWall === focus) break;
  }
  const canvas = page.locator("[data-showroom-canvas]");
  await canvas.dispatchEvent("pointermove", {
    pointerId: 91,
    pointerType: "mouse",
    clientX: clickPoint.x,
    clientY: clickPoint.y,
  });
  await canvas.dispatchEvent("pointerdown", {
    pointerId: 91,
    pointerType: "mouse",
    button: 0,
    buttons: 1,
    clientX: clickPoint.x,
    clientY: clickPoint.y,
  });
  await canvas.dispatchEvent("pointerup", {
    pointerId: 91,
    pointerType: "mouse",
    button: 0,
    buttons: 0,
    clientX: clickPoint.x,
    clientY: clickPoint.y,
  });
  await page.waitForFunction((selectedFocus) => (
    document.querySelector("[data-showroom]")
      ?.getAttribute("data-showroom-wall-focus") === selectedFocus
  ), focus, { timeout: 5_000 });
  await page.waitForTimeout(520);
};
const wallFocusSequence = [];
await clickShowroomWall("back");
wallFocusSequence.push(await page.locator("[data-showroom]").getAttribute(
  "data-showroom-wall-focus",
));
await clickShowroomWall("left");
wallFocusSequence.push(await page.locator("[data-showroom]").getAttribute(
  "data-showroom-wall-focus",
));
await clickShowroomWall("back");
wallFocusSequence.push(await page.locator("[data-showroom]").getAttribute(
  "data-showroom-wall-focus",
));
await page.waitForTimeout(720);
const showroomState = await page.evaluate(async () => {
  const frameGaps = [];
  const startedAt = performance.now();
  let previousFrame = startedAt;
  await new Promise((resolve) => {
    const measure = (now) => {
      frameGaps.push(now - previousFrame);
      previousFrame = now;
      if (now - startedAt < 700) requestAnimationFrame(measure);
      else resolve();
    };
    requestAnimationFrame(measure);
  });
  const canvas = document.querySelector("[data-showroom-canvas]");
  const showroom = document.querySelector("[data-showroom]");
  const sortedGaps = [...frameGaps].sort((left, right) => left - right);
  const artworkAssets = new Set(
    performance.getEntriesByType("resource")
      .map((entry) => entry.name)
      .filter((name) => name.includes("/media/showroom/display-content/"))
      .map((name) => name.split("/").pop()),
  );
  return {
    ready: showroom?.getAttribute("data-showroom-ready") === "true",
    artworkReady: showroom?.getAttribute("data-showroom-artwork-ready") === "true",
    artworkAssetCount: artworkAssets.size,
    canvasWidth: canvas instanceof HTMLCanvasElement ? canvas.width : 0,
    canvasHeight: canvas instanceof HTMLCanvasElement ? canvas.height : 0,
    themeCount: document.querySelectorAll(".showroom-themes li").length,
    displayLabel: document.querySelector(
      "[data-showroom-display-label]",
    )?.textContent?.trim() ?? "",
    activeLight: document.querySelector(
      "[data-showroom-setting=\"light\"].is-active",
    )?.getAttribute("data-value") ?? "",
    activeView: document.querySelector(
      "[data-showroom-view-label]",
    )?.textContent?.trim() ?? "",
    wallFocus: showroom?.getAttribute("data-showroom-wall-focus") ?? "",
    oldViewButtonsRemoved:
      document.querySelectorAll("[data-showroom-view]").length === 0,
    withinViewport: Boolean(
      showroom
      && showroom.getBoundingClientRect().left >= 0
      && showroom.getBoundingClientRect().right <= window.innerWidth
    ),
    p95FrameGap: sortedGaps[
      Math.min(sortedGaps.length - 1, Math.floor(sortedGaps.length * 0.95))
    ] ?? 0,
  };
});

await selectEdgeSetting("room-type", "preset", "cafe");
await page.waitForTimeout(120);
const cafePresetState = await page.evaluate(() => ({
  architecture: document.querySelector("[data-showroom]")
    ?.getAttribute("data-showroom-architecture") ?? "",
  displayLabel: document.querySelector(
    "[data-showroom-display-label]",
  )?.textContent?.trim() ?? "",
  content: document.querySelector(
    "[data-showroom-setting=\"content\"].is-active",
  )?.getAttribute("data-value") ?? "",
  light: document.querySelector(
    "[data-showroom-setting=\"light\"].is-active",
  )?.getAttribute("data-value") ?? "",
}));
await selectEdgeSetting("room-type", "preset", "takeaway");
await page.waitForTimeout(120);
const takeawayPresetState = await page.evaluate(() => ({
  architecture: document.querySelector("[data-showroom]")
    ?.getAttribute("data-showroom-architecture") ?? "",
  displayLabel: document.querySelector(
    "[data-showroom-display-label]",
  )?.textContent?.trim() ?? "",
  content: document.querySelector(
    "[data-showroom-setting=\"content\"].is-active",
  )?.getAttribute("data-value") ?? "",
  light: document.querySelector(
    "[data-showroom-setting=\"light\"].is-active",
  )?.getAttribute("data-value") ?? "",
}));

const selectDisplayUnit = async (index) => {
  const menu = page.locator(".showroom-edge-menu--displays");
  await menu.locator("[data-showroom-edge-trigger]").hover();
  await page.waitForTimeout(160);
  await menu.locator(
    `[data-showroom-select-display="${index}"]`,
  ).click({ force: true });
};
await selectDisplayUnit(1);
await selectEdgeSetting("content", "content", "pickup");
await selectEdgeSetting("displays", "displaySize", "75");
await selectDisplayUnit(2);
await selectEdgeSetting("content", "content", "campaign");
await selectEdgeSetting("displays", "displaySize", "32");
const individualDisplayState = await page.evaluate(() => {
  const showroom = document.querySelector("[data-showroom]");
  return {
    selected: showroom?.getAttribute(
      "data-showroom-selected-display-index",
    ) ?? "",
    contents: showroom?.getAttribute(
      "data-showroom-display-unit-contents",
    ) ?? "",
    sizes: showroom?.getAttribute("data-showroom-display-unit-sizes") ?? "",
    guidance: showroom?.getAttribute("data-showroom-guidance-target") ?? "",
    selectorCount: document.querySelectorAll(
      ".showroom-edge-menu--displays [data-showroom-select-display]",
    ).length,
  };
});

await selectEdgeSetting("position", "wall", "sideRight");
await changeEdgeCount("1");
await changeEdgeCount("1");
const combinedInstallationState = await page.evaluate(() => ({
  total: document.querySelector("[data-showroom]")
    ?.getAttribute("data-showroom-total-displays") ?? "",
  activeInstallations: document.querySelector("[data-showroom]")
    ?.getAttribute("data-showroom-active-installations") ?? "",
  menuCount: document.querySelector("[data-showroom-wall-count=\"menu\"]")
    ?.textContent?.trim() ?? "",
  sideCount: document.querySelector("[data-showroom-wall-count=\"sideRight\"]")
    ?.textContent?.trim() ?? "",
  selectedWall: document.querySelector("[data-showroom]")
    ?.getAttribute("data-showroom-selected-wall") ?? "",
}));
await selectEdgeSetting("position", "wall", "menu");
const menuInstallationState = await page.evaluate(() => ({
  selectedCount: document.querySelector("[data-showroom-count-output]")
    ?.textContent?.trim() ?? "",
  total: document.querySelector("[data-showroom]")
    ?.getAttribute("data-showroom-total-displays") ?? "",
}));
await selectEdgeSetting("position", "wall", "sideRight");
await changeEdgeCount("-1");
await changeEdgeCount("-1");
await selectEdgeSetting("position", "wall", "counterTop");
await changeEdgeCount("1");
const removedAndOverheadState = await page.evaluate(() => ({
  total: document.querySelector("[data-showroom]")
    ?.getAttribute("data-showroom-total-displays") ?? "",
  activeInstallations: document.querySelector("[data-showroom]")
    ?.getAttribute("data-showroom-active-installations") ?? "",
  sideCount: document.querySelector("[data-showroom-wall-count=\"sideRight\"]")
    ?.textContent?.trim() ?? "",
  overheadCount: document.querySelector(
    "[data-showroom-wall-count=\"counterTop\"]",
  )?.textContent?.trim() ?? "",
  selectedWall: document.querySelector("[data-showroom]")
    ?.getAttribute("data-showroom-selected-wall") ?? "",
}));
await selectEdgeSetting("position", "wall", "sideLeft");
await changeEdgeCount("1");
const selectTotemSetup = async (selectedPage, variant) => {
  const menu = selectedPage.locator(".showroom-edge-menu--position");
  await menu.locator("[data-showroom-edge-trigger]").hover();
  await selectedPage.waitForTimeout(180);
  await menu.locator(
    `[data-showroom-totem-setup="${variant}"]`,
  ).evaluate((button) => button.click());
};
await selectTotemSetup(page, "twoSided");
const bilateralAndTotemState = await page.evaluate(() => ({
  total: document.querySelector("[data-showroom]")
    ?.getAttribute("data-showroom-total-displays") ?? "",
  activeInstallations: document.querySelector("[data-showroom]")
    ?.getAttribute("data-showroom-active-installations") ?? "",
  leftCount: document.querySelector("[data-showroom-wall-count=\"sideLeft\"]")
    ?.textContent?.trim() ?? "",
  rightCount: document.querySelector("[data-showroom-wall-count=\"sideRight\"]")
    ?.textContent?.trim() ?? "",
  totemCount: document.querySelector("[data-showroom]")
    ?.getAttribute("data-showroom-totem-count") ?? "",
  totemVisible: document.querySelector("[data-showroom]")
    ?.getAttribute("data-showroom-totem-visible") ?? "",
}));
const totemVariantStates = [];
for (const variant of [
  "fourSided",
  "twoSided",
  "ceilingColumn",
  "halfTotem",
]) {
  await selectTotemSetup(page, variant);
  totemVariantStates.push(await page.evaluate(() => ({
    variant: document.querySelector("[data-showroom]")
      ?.getAttribute("data-showroom-totem-variant") ?? "",
    count: document.querySelector("[data-showroom-count-output]")
      ?.textContent?.trim() ?? "",
    total: document.querySelector("[data-showroom]")
      ?.getAttribute("data-showroom-total-displays") ?? "",
  })));
}
const removeTotemButton = page.locator(
  ".showroom-edge-menu--position [data-showroom-totem-remove]",
).first();
await page.locator(
  ".showroom-edge-menu--position [data-showroom-edge-trigger]",
).hover();
await page.waitForTimeout(180);
await removeTotemButton.click({ force: true });
const removedTotemState = await page.evaluate(() => ({
  total: document.querySelector("[data-showroom]")
    ?.getAttribute("data-showroom-total-displays") ?? "",
  totemCount: document.querySelector("[data-showroom]")
    ?.getAttribute("data-showroom-totem-count") ?? "",
  totemVisible: document.querySelector("[data-showroom]")
    ?.getAttribute("data-showroom-totem-visible") ?? "",
}));
await selectEdgeSetting("room-type", "preset", "restaurant");
const restoredRestaurantState = await page.evaluate(() => ({
  total: document.querySelector("[data-showroom]")
    ?.getAttribute("data-showroom-total-displays") ?? "",
  sideCount: document.querySelector("[data-showroom-wall-count=\"sideRight\"]")
    ?.textContent?.trim() ?? "",
  displayLabel: document.querySelector("[data-showroom-display-label]")
    ?.textContent?.trim() ?? "",
}));

const allMetrics = [...forwardMetrics, ...reverseMetrics];
const performanceSummary = {
  minimumDecodedFrames: Math.min(...allMetrics.map((metric) => metric.decodedFrames)),
  minimumRenderedFrames: Math.min(...allMetrics.map((metric) => metric.renderedFrames)),
  worstP95FrameGap: Math.max(...allMetrics.map((metric) => metric.p95FrameGap)),
  worstMaximumFrameGap: Math.max(...allMetrics.map((metric) => metric.maximumFrameGap)),
};

await page.close();

const totemDragPage = await browser.newPage({
  viewport: { width: 1440, height: 900 },
});
totemDragPage.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});
totemDragPage.on("pageerror", (error) => errors.push(error.message));
await totemDragPage.goto(baseURL, {
  waitUntil: "domcontentloaded",
  timeout: 30_000,
});
await totemDragPage.locator("[data-showroom]").scrollIntoViewIfNeeded();
await totemDragPage.waitForFunction(() => (
  document.querySelector("[data-showroom]")?.getAttribute("data-showroom-ready")
    === "true"
), undefined, { timeout: 30_000 });
const selectTotemDragSetting = async (menu, key, value) => {
  const edgeMenu = totemDragPage.locator(`.showroom-edge-menu--${menu}`);
  await edgeMenu.locator("[data-showroom-edge-trigger]").hover();
  await totemDragPage.waitForTimeout(180);
  await edgeMenu.locator(
    `[data-showroom-setting="${key}"][data-value="${value}"]`,
  ).click({ force: true });
};
await selectTotemDragSetting("room-type", "preset", "takeaway");
const totemPositionMenu = totemDragPage.locator(".showroom-edge-menu--position");
await totemPositionMenu.locator("[data-showroom-edge-trigger]").hover();
await totemDragPage.waitForTimeout(180);
await totemPositionMenu.locator(
  "[data-showroom-totem-setup=\"halfTotem\"]",
).evaluate((button) => button.click());
await totemDragPage.waitForFunction(() => {
  const showroom = document.querySelector("[data-showroom]");
  return Number.isFinite(Number(
    showroom?.getAttribute("data-showroom-totem-screen-x"),
  )) && Number.isFinite(Number(
    showroom?.getAttribute("data-showroom-totem-screen-y"),
  ));
}, undefined, { timeout: 10_000 });
await totemDragPage.waitForTimeout(850);
const totemPositionBeforeDrag = await totemDragPage.evaluate(() => ({
  x: Number(document.querySelector("[data-showroom]")
    ?.getAttribute("data-showroom-totem-x")),
  z: Number(document.querySelector("[data-showroom]")
    ?.getAttribute("data-showroom-totem-z")),
}));
const totemHitPoint = await totemDragPage.evaluate(() => {
  const showroom = document.querySelector("[data-showroom]");
  const canvas = document.querySelector("[data-showroom-canvas]");
  if (!(canvas instanceof HTMLCanvasElement)) return { x: 0, y: 0 };
  const bounds = canvas.getBoundingClientRect();
  return {
    x: bounds.left + Number(
      showroom?.getAttribute("data-showroom-totem-screen-x"),
    ),
    y: bounds.top + Number(
      showroom?.getAttribute("data-showroom-totem-screen-y"),
    ),
  };
});
await totemDragPage.mouse.move(totemHitPoint.x, totemHitPoint.y);
await totemDragPage.mouse.down();
await totemDragPage.mouse.move(
  totemHitPoint.x - 260,
  totemHitPoint.y + 140,
  { steps: 12 },
);
await totemDragPage.mouse.up();
const totemDragState = await totemDragPage.evaluate((before) => {
  const showroom = document.querySelector("[data-showroom]");
  const x = Number(showroom?.getAttribute("data-showroom-totem-x"));
  const z = Number(showroom?.getAttribute("data-showroom-totem-z"));
  return {
    x,
    z,
    moved: Number.isFinite(x)
      && Number.isFinite(z)
      && (Math.abs(x - before.x) > 0.5 || Math.abs(z - before.z) > 0.5),
    released: !showroom?.classList.contains("is-totem-dragging"),
  };
}, totemPositionBeforeDrag);
await totemDragPage.close();

const displayDragPage = await browser.newPage({
  viewport: { width: 1440, height: 900 },
});
displayDragPage.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});
displayDragPage.on("pageerror", (error) => errors.push(error.message));
await displayDragPage.goto(baseURL, {
  waitUntil: "domcontentloaded",
  timeout: 30_000,
});
await displayDragPage.locator("[data-showroom]").scrollIntoViewIfNeeded();
await displayDragPage.waitForFunction(() => {
  const showroom = document.querySelector("[data-showroom]");
  return showroom?.getAttribute("data-showroom-ready") === "true"
    && Number.isFinite(Number(
      showroom.getAttribute("data-showroom-display-screen-x"),
    ))
    && Number.isFinite(Number(
      showroom.getAttribute("data-showroom-display-screen-y"),
    ));
}, undefined, { timeout: 30_000 });
await displayDragPage.waitForTimeout(520);
const displayPositionBeforeDrag = await displayDragPage.evaluate(() => {
  const showroom = document.querySelector("[data-showroom]");
  return {
    u: Number(showroom?.getAttribute(
      "data-showroom-selected-display-offset-u",
    )),
    v: Number(showroom?.getAttribute(
      "data-showroom-selected-display-offset-v",
    )),
  };
});
const projectedDisplayHitPoint = await displayDragPage.evaluate(() => {
  const showroom = document.querySelector("[data-showroom]");
  const canvas = document.querySelector("[data-showroom-canvas]");
  if (!(canvas instanceof HTMLCanvasElement)) return { x: 0, y: 0 };
  const bounds = canvas.getBoundingClientRect();
  return {
    x: bounds.left + Number(
      showroom?.getAttribute("data-showroom-display-screen-x"),
    ),
    y: bounds.top + Number(
      showroom?.getAttribute("data-showroom-display-screen-y"),
    ),
  };
});
let displayHitPoint = projectedDisplayHitPoint;
for (const [offsetX, offsetY] of [
  [0, 0],
  [-18, 0],
  [18, 0],
  [0, 18],
  [0, -18],
]) {
  const candidate = {
    x: projectedDisplayHitPoint.x + offsetX,
    y: projectedDisplayHitPoint.y + offsetY,
  };
  await displayDragPage.mouse.move(candidate.x, candidate.y);
  await displayDragPage.waitForTimeout(90);
  displayHitPoint = candidate;
  if (await displayDragPage.locator("[data-showroom]").evaluate(
    (showroom) => showroom.classList.contains("is-display-hover"),
  )) break;
}
await displayDragPage.mouse.move(displayHitPoint.x, displayHitPoint.y);
await displayDragPage.mouse.down();
await displayDragPage.mouse.move(
  displayHitPoint.x - 115,
  displayHitPoint.y + 70,
  { steps: 10 },
);
await displayDragPage.mouse.up();
const displayDragState = await displayDragPage.evaluate((before) => {
  const showroom = document.querySelector("[data-showroom]");
  const u = Number(showroom?.getAttribute(
    "data-showroom-selected-display-offset-u",
  ));
  const v = Number(showroom?.getAttribute(
    "data-showroom-selected-display-offset-v",
  ));
  return {
    wall: showroom?.getAttribute("data-showroom-display-drag-wall") ?? "",
    wallFocus: showroom?.getAttribute("data-showroom-wall-focus") ?? "",
    u,
    v,
    moved: Number.isFinite(u)
      && Number.isFinite(v)
      && (Math.abs(u - before.u) > 0.1 || Math.abs(v - before.v) > 0.1),
    released: !showroom?.classList.contains("is-display-dragging"),
  };
}, displayPositionBeforeDrag);
const displayPositionMenu = displayDragPage.locator(
  ".showroom-edge-menu--position",
);
await displayPositionMenu.locator("[data-showroom-edge-trigger]").hover();
await displayDragPage.waitForTimeout(220);
await displayPositionMenu.locator(
  "[data-showroom-display-position-reset]",
).click({ force: true });
const displayResetState = await displayDragPage.evaluate(() => {
  const showroom = document.querySelector("[data-showroom]");
  return {
    u: Number(showroom?.getAttribute(
      "data-showroom-selected-display-offset-u",
    )),
    v: Number(showroom?.getAttribute(
      "data-showroom-selected-display-offset-v",
    )),
  };
});
await displayDragPage.close();

const furnishingPage = await browser.newPage({
  viewport: { width: 1440, height: 900 },
});
furnishingPage.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});
furnishingPage.on("pageerror", (error) => errors.push(error.message));
await furnishingPage.goto(baseURL, {
  waitUntil: "domcontentloaded",
  timeout: 30_000,
});
await furnishingPage.locator("[data-showroom]").scrollIntoViewIfNeeded();
await furnishingPage.waitForFunction(() => (
  document.querySelector("[data-showroom]")?.getAttribute("data-showroom-ready")
    === "true"
), undefined, { timeout: 30_000 });
const furnishingMenu = furnishingPage.locator(
  ".showroom-edge-menu--furnishings",
);
await furnishingMenu.locator("[data-showroom-edge-trigger]").hover();
await furnishingPage.waitForTimeout(240);
await furnishingMenu.locator(
  "[data-showroom-furnishing-select=\"restaurant-table-1\"]",
).click({ force: true });
await furnishingPage.waitForFunction(() => {
  const showroom = document.querySelector("[data-showroom]");
  return showroom?.getAttribute("data-showroom-selected-furnishing")
    === "restaurant-table-1"
    && Number.isFinite(Number(
      showroom.getAttribute("data-showroom-furnishing-screen-x"),
    ))
    && Number.isFinite(Number(
      showroom.getAttribute("data-showroom-furnishing-screen-y"),
    ));
}, undefined, { timeout: 10_000 });
await furnishingPage.mouse.click(720, 250);
await furnishingPage.waitForTimeout(900);
const furnishingPositionBeforeDrag = await furnishingPage.evaluate(() => {
  const showroom = document.querySelector("[data-showroom]");
  return {
    x: Number(showroom?.getAttribute("data-showroom-furnishing-x")),
    z: Number(showroom?.getAttribute("data-showroom-furnishing-z")),
  };
});
const furnishingHitPoint = await furnishingPage.evaluate(() => {
  const showroom = document.querySelector("[data-showroom]");
  const canvas = document.querySelector("[data-showroom-canvas]");
  if (!(canvas instanceof HTMLCanvasElement)) return { x: 0, y: 0 };
  const bounds = canvas.getBoundingClientRect();
  return {
    x: bounds.left + Number(
      showroom?.getAttribute("data-showroom-furnishing-screen-x"),
    ),
    y: bounds.top + Number(
      showroom?.getAttribute("data-showroom-furnishing-screen-y"),
    ),
  };
});
await furnishingPage.mouse.move(furnishingHitPoint.x, furnishingHitPoint.y);
await furnishingPage.mouse.down();
await furnishingPage.mouse.move(
  furnishingHitPoint.x + 130,
  furnishingHitPoint.y - 35,
  { steps: 10 },
);
await furnishingPage.mouse.up();
const furnishingDragState = await furnishingPage.evaluate((before) => {
  const showroom = document.querySelector("[data-showroom]");
  const toolbar = document.querySelector("[data-showroom-object-toolbar]");
  const x = Number(showroom?.getAttribute("data-showroom-furnishing-x"));
  const z = Number(showroom?.getAttribute("data-showroom-furnishing-z"));
  return {
    count: Number(showroom?.getAttribute("data-showroom-furnishing-count")),
    visible: Number(showroom?.getAttribute("data-showroom-visible-furnishings")),
    selected: showroom?.getAttribute("data-showroom-selected-furnishing") ?? "",
    x,
    z,
    moved: Number.isFinite(x)
      && Number.isFinite(z)
      && (Math.abs(x - before.x) > 0.25 || Math.abs(z - before.z) > 0.25),
    released: !showroom?.classList.contains("is-furnishing-dragging"),
    toolbarVisible: toolbar instanceof HTMLElement && !toolbar.hidden,
  };
}, furnishingPositionBeforeDrag);
await furnishingPage.locator("[data-showroom-object-hide]").click();
const furnishingHiddenState = await furnishingPage.evaluate(() => {
  const showroom = document.querySelector("[data-showroom]");
  return {
    visible: Number(showroom?.getAttribute("data-showroom-visible-furnishings")),
    selectionCleared:
      !showroom?.getAttribute("data-showroom-selected-furnishing"),
  };
});
await furnishingMenu.locator("[data-showroom-edge-trigger]").hover();
await furnishingPage.waitForTimeout(240);
await furnishingMenu.locator(
  "[data-showroom-furnishing-show-all]",
).click({ force: true });
const furnishingRestoredState = await furnishingPage.evaluate(() => {
  const showroom = document.querySelector("[data-showroom]");
  return {
    visible: Number(showroom?.getAttribute("data-showroom-visible-furnishings")),
    count: Number(showroom?.getAttribute("data-showroom-furnishing-count")),
  };
});
await furnishingPage.close();

const mobilePage = await browser.newPage({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
});
const mobileErrors = [];
mobilePage.on("console", (message) => {
  if (message.type() === "error") mobileErrors.push(message.text());
});
mobilePage.on("pageerror", (error) => mobileErrors.push(error.message));
const mobileResponse = await mobilePage.goto(baseURL, {
  waitUntil: "domcontentloaded",
  timeout: 30_000,
});
await mobilePage.waitForSelector("#station-1");
await mobilePage.waitForTimeout(800);
const mobileState = await mobilePage.evaluate(() => {
  const attachedVideos = Array.from(document.querySelectorAll("video"))
    .filter((video) => Boolean(video.currentSrc || video.getAttribute("src")));
  return {
    status: document.readyState,
    attachedVideos: attachedVideos.length,
    usesCompactMedia: attachedVideos.every((video) => (
      video.currentSrc.includes("/media/mobile/")
      || video.getAttribute("src")?.includes("/media/mobile/")
    )),
  };
});
await mobilePage.locator("[data-menu-toggle]").click();
const mobileMenuOpen = await mobilePage.evaluate(() => (
  document.body.classList.contains("is-menu-open")
));
await mobilePage.locator("[data-menu-toggle]").click();
const mobileEntryState = await mobilePage.evaluate(async () => {
  const scroller = document.querySelector("#scroller");
  if (!(scroller instanceof HTMLElement)) return null;
  const journeyMaximum = Math.max(1, scroller.offsetHeight - window.innerHeight);
  const frameGaps = [];
  const startedAt = performance.now();
  let previousFrame = startedAt;

  window.scrollTo(0, journeyMaximum);
  await new Promise((resolve) => requestAnimationFrame(() => resolve()));

  await new Promise((resolve) => {
    const animate = (now) => {
      frameGaps.push(now - previousFrame);
      previousFrame = now;
      const progress = Math.min(1, (now - startedAt) / 1_100);
      const eased = progress * progress * (3 - 2 * progress);
      window.scrollTo(0, journeyMaximum + window.innerHeight * eased);
      if (progress < 1) requestAnimationFrame(animate);
      else resolve();
    };
    requestAnimationFrame(animate);
  });
  await new Promise((resolve) => setTimeout(resolve, 220));

  const sortedGaps = [...frameGaps].sort((left, right) => left - right);
  return {
    complete: document.body.classList.contains("is-marketing-entry-complete"),
    active: document.body.classList.contains("is-marketing-entry-active"),
    canvasHidden: getComputedStyle(
      document.querySelector(".marketing-entry-dissolve"),
    ).visibility === "hidden",
    impactBackground: getComputedStyle(
      document.querySelector("#wirkung"),
    ).backgroundColor,
    p95FrameGap: sortedGaps[
      Math.min(sortedGaps.length - 1, Math.floor(sortedGaps.length * 0.95))
    ] ?? 0,
    maximumFrameGap: Math.max(0, ...frameGaps),
  };
});
await mobilePage.locator("[data-solution-goal=\"monetarisieren\"]").tap();
await mobilePage.waitForTimeout(760);
const mobileSolutionState = await mobilePage.evaluate(() => {
  const result = document.querySelector(".solution-result")?.getBoundingClientRect();
  const tabs = document.querySelector(".solution-tabs");
  return {
    active: document.querySelector("[data-solution-result]")
      ?.getAttribute("data-active-solution") ?? "",
    resultWithinViewport: Boolean(
      result && result.left >= 0 && result.right <= window.innerWidth,
    ),
    tabsScrollable: tabs instanceof HTMLElement
      && tabs.scrollWidth > tabs.clientWidth
      && tabs.scrollLeft > 0,
    bodyWithinViewport: document.body.scrollWidth <= window.innerWidth,
  };
});
await mobilePage.locator(".impact-card").nth(1).scrollIntoViewIfNeeded();
await mobilePage.locator(".impact-card").nth(1).tap({
  position: { x: 180, y: 82 },
});
await mobilePage.waitForTimeout(180);
const mobileImpactState = await mobilePage.evaluate(() => {
  const cards = Array.from(document.querySelectorAll(".impact-card"));
  return {
    canvases: document.querySelectorAll(".impact-card__scene").length,
    activeCards: document.querySelectorAll(".impact-card.is-scene-active").length,
    secondInteracting: cards[1]?.classList.contains("is-interacting") ?? false,
    firstBackground: cards[0] ? getComputedStyle(cards[0]).backgroundColor : "",
    secondBackground: cards[1] ? getComputedStyle(cards[1]).backgroundColor : "",
  };
});
await mobilePage.locator("[data-showroom]").scrollIntoViewIfNeeded();
await mobilePage.waitForFunction(() => (
  document.querySelector("[data-showroom]")?.getAttribute("data-showroom-ready")
    === "true"
), undefined, { timeout: 30_000 });
const mobileShowroomInitiallyCollapsed = await mobilePage.locator(
  ".showroom-config",
).evaluate((element) => element.classList.contains("is-collapsed"));
await mobilePage.locator("[data-showroom-config-open]").tap();
const mobileConfig = mobilePage.locator(".showroom-config");
await mobileConfig.locator("[data-showroom-tab=\"displays\"]").tap();
await mobileConfig.locator(
  "[data-showroom-setting=\"orientation\"][data-value=\"portrait\"]",
).tap();
await mobileConfig.locator("[data-showroom-tab=\"furnishings\"]").tap();
await mobilePage.waitForTimeout(350);
const mobileShowroomState = await mobilePage.evaluate(() => {
  const showroom = document.querySelector("[data-showroom]");
  const canvas = document.querySelector("[data-showroom-canvas]");
  return {
    ready: showroom?.getAttribute("data-showroom-ready") === "true",
    configOpen: !document.querySelector(".showroom-config")
      ?.classList.contains("is-collapsed"),
    portraitActive: document.querySelector(
      "[data-showroom-setting=\"orientation\"][data-value=\"portrait\"]",
    )?.classList.contains("is-active") ?? false,
    furnishingsActive: document.querySelector(
      "[data-showroom-panel=\"furnishings\"]",
    )?.classList.contains("is-active") ?? false,
    furnishingCount: document.querySelectorAll(
      "[data-showroom-panel=\"furnishings\"] [data-showroom-furnishing-select]",
    ).length,
    canvasSized: canvas instanceof HTMLCanvasElement
      && canvas.clientWidth === window.innerWidth
      && canvas.clientHeight > 600,
    bodyWithinViewport: document.body.scrollWidth <= window.innerWidth,
  };
});
await mobilePage.close();

const reducedMotionPage = await browser.newPage({
  viewport: { width: 1440, height: 900 },
  reducedMotion: "reduce",
});
const reducedMotionResponse = await reducedMotionPage.goto(baseURL, {
  waitUntil: "domcontentloaded",
  timeout: 30_000,
});
await reducedMotionPage.waitForSelector("#wirkung");
await reducedMotionPage.waitForTimeout(350);
await reducedMotionPage.locator("[data-solution-goal=\"informieren\"]").click();
await reducedMotionPage.waitForTimeout(100);
await reducedMotionPage.locator("[data-showroom]").scrollIntoViewIfNeeded();
await reducedMotionPage.waitForFunction(() => (
  document.querySelector("[data-showroom]")?.getAttribute("data-showroom-ready")
    === "true"
), undefined, { timeout: 30_000 });
const reducedLightMenu = reducedMotionPage.locator(".showroom-edge-menu--light");
await reducedLightMenu.locator("[data-showroom-edge-trigger]").hover();
await reducedMotionPage.waitForTimeout(180);
await reducedLightMenu.locator(
  "[data-showroom-setting=\"light\"][data-value=\"brand\"]",
).click({ force: true });
await reducedMotionPage.waitForTimeout(50);
const reducedMotionState = await reducedMotionPage.evaluate(() => ({
  dissolveMounted: document.documentElement.classList.contains(
    "has-marketing-entry-dissolve",
  ),
  impactBackground: getComputedStyle(
    document.querySelector("#wirkung"),
  ).backgroundColor,
  solutionActive: document.querySelector("[data-solution-result]")
    ?.getAttribute("data-active-solution") ?? "",
  showroomReady: document.querySelector("[data-showroom]")
    ?.getAttribute("data-showroom-ready") === "true",
  showroomLight: document.querySelector(
    "[data-showroom-setting=\"light\"].is-active",
  )?.getAttribute("data-value") ?? "",
}));
await reducedMotionPage.close();

console.log(JSON.stringify({
  status: response?.status(),
  initialState,
  finalState,
  marketingState,
  impactScenesState,
  showroomState,
  wallFocusSequence,
  perimeterMainState,
  themeMenuState,
  themeMenuClosedState,
  perimeterFlyoutOpenState,
  perimeterFlyoutPersistentState,
  perimeterFlyoutSwitchState,
  perimeterFlyoutRoomDismissState,
  perimeterFlyoutReachabilityState,
  cafePresetState,
  takeawayPresetState,
  individualDisplayState,
  combinedInstallationState,
  menuInstallationState,
  removedAndOverheadState,
  bilateralAndTotemState,
  totemVariantStates,
  totemDragState,
  displayDragState,
  displayResetState,
  furnishingDragState,
  furnishingHiddenState,
  furnishingRestoredState,
  removedTotemState,
  restoredRestaurantState,
  mobileStatus: mobileResponse?.status(),
  mobileState: { ...mobileState, menuOpen: mobileMenuOpen },
  mobileEntryState,
  mobileSolutionState,
  mobileImpactState,
  mobileShowroomState: {
    ...mobileShowroomState,
    initiallyCollapsed: mobileShowroomInitiallyCollapsed,
  },
  reducedMotionStatus: reducedMotionResponse?.status(),
  reducedMotionState,
  performanceSummary,
  errors,
  mobileErrors,
  failedRequests,
  cancelledMediaRequests: cancelledMediaRequests.length,
}, null, 2));

await browser.close();

const failures = [
  response?.status() !== 200 ? `Unexpected HTTP status: ${response?.status()}` : "",
  initialState.stations !== chapterCount
    ? `Expected ${chapterCount} stations, found ${initialState.stations}`
    : "",
  initialState.attachedVideos > 6
    ? `Too many videos attached initially: ${initialState.attachedVideos}`
    : "",
  mobileResponse?.status() !== 200
    ? `Unexpected mobile HTTP status: ${mobileResponse?.status()}`
    : "",
  !mobileState.usesCompactMedia
    ? "Mobile viewport did not select compact videos"
    : "",
  !mobileMenuOpen ? "Mobile navigation did not open" : "",
  !mobileEntryState?.complete
    || mobileEntryState.active
    || !mobileEntryState.canvasHidden
    ? "Mobile pixel transition did not finish cleanly"
    : "",
  (mobileEntryState?.p95FrameGap ?? Infinity) > 50
    ? `Mobile pixel transition p95 frame gap is too high: ${
      mobileEntryState?.p95FrameGap.toFixed(1)
    }ms`
    : "",
  reducedMotionResponse?.status() !== 200
    ? `Unexpected reduced-motion HTTP status: ${reducedMotionResponse?.status()}`
    : "",
  reducedMotionState.dissolveMounted
    ? "Pixel transition mounted despite reduced-motion preference"
    : "",
  reducedMotionState.solutionActive !== "informieren"
    ? "Reduced-motion solution finder did not update"
    : "",
  reducedMotionState.impactBackground === "rgba(0, 0, 0, 0)"
    ? "Reduced-motion impact background became transparent"
    : "",
  !marketingState.marketingView
    || marketingState.activeSolution !== "Begeistern"
    || marketingState.activeSolutionScene !== "begeistern"
    || !marketingState.solutionCanvasPopulated
    || !marketingState.solutionTitle.includes("Erlebnis")
    ? "Marketing route or solution finder did not respond"
    : "",
  impactScenesState.canvases !== 4
    || impactScenesState.populatedCanvases !== 4
    || impactScenesState.activeCards !== 4
    || impactScenesState.interactingCards !== 1
    ? "Interactive impact scenes did not initialize correctly"
    : "",
  impactScenesState.p95FrameGap > 50
    ? `Impact scene p95 frame gap is too high: ${
      impactScenesState.p95FrameGap.toFixed(1)
    }ms`
    : "",
  !showroomState.ready
    || !showroomState.artworkReady
    || showroomState.artworkAssetCount !== 6
    || showroomState.canvasWidth <= 0
    || showroomState.canvasHeight <= 0
    || showroomState.themeCount !== 12
    || !showroomState.displayLabel.includes("4 Displays")
    || !showroomState.displayLabel.includes("Vertikal")
    || showroomState.activeLight !== "evening"
    || showroomState.activeView !== "Rückwand"
    || showroomState.wallFocus !== "back"
    || !showroomState.oldViewButtonsRemoved
    || wallFocusSequence.join(",") !== "back,left,back"
    || !showroomState.withinViewport
    ? "3D showroom initialization or configuration interaction failed"
    : "",
  showroomState.p95FrameGap > 50
    ? `3D showroom p95 frame gap is too high: ${
      showroomState.p95FrameGap.toFixed(1)
    }ms`
    : "",
  !perimeterMainState
    || perimeterMainState.layout !== "perimeter"
    || !perimeterMainState.allVisible
    || !perimeterMainState.allInside
    || !perimeterMainState.topControlsClearHeading
    || !perimeterMainState.topControlsAligned
    || !perimeterMainState.topControlsNearCenter
    || !perimeterMainState.displayControlAboveStatus
    || !perimeterMainState.centerClear
    || perimeterMainState.mainLabels.join(",")
      !== "Raumtyp,Raumgrösse,Display Position,Displays,Inhalt,Licht,Einrichtung"
    || !perimeterFlyoutOpenState.open
    || !perimeterFlyoutOpenState.highContrast
    || !perimeterFlyoutOpenState.expanded
    || !perimeterFlyoutPersistentState.open
    || perimeterFlyoutPersistentState.expanded !== "true"
    || perimeterFlyoutSwitchState.roomTypeOpen
    || !perimeterFlyoutSwitchState.roomSizeOpen
    || perimeterFlyoutRoomDismissState.openMenus !== 0
    || perimeterFlyoutReachabilityState.length !== 7
    || perimeterFlyoutReachabilityState.some((item) => !item.remainedOpen)
    ? "Showroom perimeter navigation or auto-closing flyouts failed"
    : "",
  themeMenuState.selectorLabel !== "Gastronomie"
    || !themeMenuState.expanded
    || !themeMenuState.menuOpen
    || themeMenuState.themeCount !== 12
    || !themeMenuState.activeEnabled
    || !themeMenuState.futureThemesDisabled
    || !themeMenuState.oldBottomToggleRemoved
    || themeMenuClosedState.menuOpen
    || themeMenuClosedState.expanded !== "false"
    ? "Integrated showroom theme selector failed"
    : "",
  cafePresetState.architecture !== "cafe"
    || !cafePresetState.displayLabel.includes("2 Displays")
    || !cafePresetState.displayLabel.includes("55″")
    || cafePresetState.content !== "menu"
    || cafePresetState.light !== "warm"
    ? "Café showroom preset did not apply its own architecture or defaults"
    : "",
  takeawayPresetState.architecture !== "takeaway"
    || !takeawayPresetState.displayLabel.includes("3 Displays")
    || !takeawayPresetState.displayLabel.includes("55″")
    || takeawayPresetState.content !== "menu"
    || takeawayPresetState.light !== "day"
    ? "Take-away showroom preset did not apply its own architecture or defaults"
    : "",
  individualDisplayState.selected !== "2"
    || individualDisplayState.contents !== "menu,pickup,campaign"
    || individualDisplayState.sizes !== "55,75,32"
    || individualDisplayState.guidance !== "content"
    || individualDisplayState.selectorCount !== 3
    ? "Individual display selection, content, size, or guided workflow failed"
    : "",
  combinedInstallationState.total !== "5"
    || combinedInstallationState.activeInstallations !== "2"
    || combinedInstallationState.menuCount !== "3"
    || combinedInstallationState.sideCount !== "2"
    || combinedInstallationState.selectedWall !== "sideRight"
    || menuInstallationState.selectedCount !== "3"
    || menuInstallationState.total !== "5"
    ? "Display installations did not persist independently across positions"
    : "",
  removedAndOverheadState.total !== "4"
    || removedAndOverheadState.activeInstallations !== "2"
    || removedAndOverheadState.sideCount !== "0"
    || removedAndOverheadState.overheadCount !== "1"
    || removedAndOverheadState.selectedWall !== "counterTop"
    ? "Display installation removal or overhead placement state failed"
    : "",
  bilateralAndTotemState.total !== "7"
    || bilateralAndTotemState.activeInstallations !== "4"
    || bilateralAndTotemState.leftCount !== "1"
    || bilateralAndTotemState.rightCount !== "0"
    || bilateralAndTotemState.totemCount !== "2"
    || bilateralAndTotemState.totemVisible !== "true"
    ? "Left wall or freestanding multi-sided totem configuration failed"
    : "",
  totemVariantStates.length !== 4
    || totemVariantStates[0]?.variant !== "fourSided"
    || totemVariantStates[0]?.count !== "4"
    || totemVariantStates[1]?.variant !== "twoSided"
    || totemVariantStates[1]?.count !== "2"
    || totemVariantStates[2]?.variant !== "ceilingColumn"
    || totemVariantStates[2]?.count !== "3"
    || totemVariantStates[3]?.variant !== "halfTotem"
    || totemVariantStates[3]?.count !== "1"
    ? "The four freestanding display variants did not configure correctly"
    : "",
  !totemDragState.moved || !totemDragState.released
    ? "Direct 3D placement of the freestanding display failed"
    : "",
  displayDragState.wall !== "sideRight"
    || displayDragState.wallFocus !== "right"
    || !displayDragState.moved
    || !displayDragState.released
    ? "Wall-mounted displays could not be dragged within their surface"
    : "",
  Math.abs(displayResetState.u) > 0.01
    || Math.abs(displayResetState.v) > 0.01
    ? "Wall-mounted display position reset failed"
    : "",
  furnishingDragState.count < 10
    || furnishingDragState.visible !== furnishingDragState.count
    || furnishingDragState.selected !== "restaurant-table-1"
    || !furnishingDragState.moved
    || !furnishingDragState.released
    || !furnishingDragState.toolbarVisible
    ? "Direct 3D furniture selection or drag placement failed"
    : "",
  furnishingHiddenState.visible !== furnishingDragState.count - 1
    || !furnishingHiddenState.selectionCleared
    || furnishingRestoredState.visible !== furnishingRestoredState.count
    ? "Furniture visibility controls did not hide and restore objects"
    : "",
  removedTotemState.total !== "5"
    || removedTotemState.totemCount !== "0"
    || removedTotemState.totemVisible !== "false"
    ? "Freestanding display totem did not disappear at zero displays"
    : "",
  restoredRestaurantState.total !== "4"
    || restoredRestaurantState.sideCount !== "4"
    || !restoredRestaurantState.displayLabel.includes("4 Displays")
    ? "Room-specific configuration did not survive a preset change"
    : "",
  mobileImpactState.canvases !== 4
    || mobileImpactState.activeCards < 2
    || !mobileImpactState.secondInteracting
    || mobileImpactState.firstBackground === mobileImpactState.secondBackground
    ? "Mobile impact scene interaction or alternating surfaces failed"
    : "",
  mobileSolutionState.active !== "monetarisieren"
    || !mobileSolutionState.resultWithinViewport
    || !mobileSolutionState.tabsScrollable
    || !mobileSolutionState.bodyWithinViewport
    ? "Mobile solution finder interaction or viewport containment failed"
    : "",
  !mobileShowroomInitiallyCollapsed
    || !mobileShowroomState.ready
    || !mobileShowroomState.configOpen
    || !mobileShowroomState.portraitActive
    || !mobileShowroomState.furnishingsActive
    || mobileShowroomState.furnishingCount < 3
    || !mobileShowroomState.canvasSized
    || !mobileShowroomState.bodyWithinViewport
    ? "Mobile 3D showroom interaction or viewport containment failed"
    : "",
  !reducedMotionState.showroomReady
    || reducedMotionState.showroomLight !== "brand"
    ? "Reduced-motion 3D showroom did not initialize or configure"
    : "",
  performanceSummary.minimumDecodedFrames < 2
    ? "A sequence did not produce enough decoded frames"
    : "",
  performanceSummary.worstP95FrameGap > 50
    ? `Animation p95 frame gap is too high: ${performanceSummary.worstP95FrameGap.toFixed(1)}ms`
    : "",
  errors.length > 0 ? `Browser errors: ${errors.join(" | ")}` : "",
  mobileErrors.length > 0
    ? `Mobile browser errors: ${mobileErrors.join(" | ")}`
    : "",
  failedRequests.length > 0
    ? `Failed requests: ${failedRequests.join(" | ")}`
    : "",
].filter(Boolean);

if (failures.length > 0) {
  throw new Error(failures.join("\n"));
}

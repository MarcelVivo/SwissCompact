import { chromium } from "playwright-core";

const executablePath =
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const baseURL =
  process.env.SWISSCOMPACT_BASE_URL ?? "http://127.0.0.1:4174/";
const browser = await chromium.launch({ executablePath, headless: true });
const errors = [];

const inspectPreview = async (page) => page.evaluate(() => {
  const root = document.querySelector("[data-showroom]");
  const modal = document.querySelector(".showroom-display-preview");
  const previewWindow = document.querySelector(
    ".showroom-display-preview__window",
  );
  const canvas = document.querySelector("[data-showroom-display-preview-canvas]");
  const screen = document.querySelector("[data-showroom-display-preview-screen]");
  const stage = document.querySelector("[data-showroom-stage]");
  if (!(canvas instanceof HTMLCanvasElement)) return { valid: false };
  const pixels = canvas.getContext("2d")?.getImageData(
    0,
    0,
    canvas.width,
    canvas.height,
  ).data;
  let colouredPixels = 0;
  if (pixels) {
    const stride = Math.max(4, Math.floor(pixels.length / 12000 / 4) * 4);
    for (let index = 0; index < pixels.length; index += stride) {
      if (pixels[index] + pixels[index + 1] + pixels[index + 2] > 24) {
        colouredPixels += 1;
      }
    }
  }
  const bounds = previewWindow?.getBoundingClientRect();
  const stageBounds = stage?.getBoundingClientRect();
  const headerBounds = previewWindow?.querySelector("header")
    ?.getBoundingClientRect();
  const siteHeader = document.querySelector(".site-header");
  return {
    valid: true,
    state: root?.getAttribute("data-showroom-display-preview-state"),
    hidden: modal?.hidden,
    role: modal?.getAttribute("role"),
    modal: modal?.getAttribute("aria-modal"),
    width: canvas.width,
    height: canvas.height,
    orientation: canvas.dataset.showroomPreviewOrientation,
    screenPortrait: screen?.classList.contains("is-portrait"),
    colouredPixels,
    title: document.querySelector(
      "[data-showroom-display-preview-title]",
    )?.textContent?.trim(),
    meta: document.querySelector(
      "[data-showroom-display-preview-meta]",
    )?.textContent?.trim(),
    headerVisible: Boolean(
      headerBounds
      && stageBounds
      && headerBounds.top >= stageBounds.top
      && headerBounds.bottom <= stageBounds.bottom
    ),
    siteHeaderHidden: siteHeader
      ? getComputedStyle(siteHeader).visibility === "hidden"
      : true,
    contained: Boolean(
      bounds
      && stageBounds
      && bounds.left >= stageBounds.left
      && bounds.right <= stageBounds.right
      && bounds.top >= stageBounds.top
      && bounds.bottom <= stageBounds.bottom
    ),
  };
});

const openFirstDisplay = async (page) => {
  await page.locator('[data-showroom-focus-tool="display"]').evaluate(
    (button) => button.click(),
  );
  await page.waitForFunction(() => (
    document.querySelector('[data-showroom-selection-item^="display:"]')
    !== null
  ));
  await page.locator('[data-showroom-selection-item^="display:"]').first()
    .evaluate((button) => button.click());
  await page.waitForFunction(() => (
    document.querySelector("[data-showroom]")?.classList.contains(
      "has-display-selection",
    )
  ));
};

const openFromSceneDoubleActivation = async (page, touch) => {
  await page.waitForFunction(() => {
    const root = document.querySelector("[data-showroom]");
    return Number.isFinite(Number(root?.getAttribute("data-showroom-display-screen-x")))
      && Number.isFinite(Number(root?.getAttribute("data-showroom-display-screen-y")));
  });
  await page.evaluate((useTouch) => {
    const root = document.querySelector("[data-showroom]");
    const canvas = document.querySelector("[data-showroom-canvas]");
    if (!(canvas instanceof HTMLCanvasElement) || !(root instanceof HTMLElement)) {
      throw new Error("3D display coordinates are unavailable");
    }
    const bounds = canvas.getBoundingClientRect();
    const clientX = bounds.left + Number(root.dataset.showroomDisplayScreenX);
    const clientY = bounds.top + Number(root.dataset.showroomDisplayScreenY);
    if (useTouch) {
      [71, 72].forEach((pointerId) => {
        canvas.dispatchEvent(new PointerEvent("pointerdown", {
          bubbles: true,
          cancelable: true,
          button: 0,
          buttons: 1,
          clientX,
          clientY,
          pointerId,
          pointerType: "touch",
        }));
        canvas.dispatchEvent(new PointerEvent("pointerup", {
          bubbles: true,
          cancelable: true,
          button: 0,
          clientX,
          clientY,
          pointerId,
          pointerType: "touch",
        }));
      });
      return;
    }
    canvas.dispatchEvent(new MouseEvent("dblclick", {
      bubbles: true,
      cancelable: true,
      button: 0,
      clientX,
      clientY,
    }));
  }, touch);
  await page.waitForFunction(() => (
    document.querySelector("[data-showroom]")?.getAttribute(
      "data-showroom-display-preview-state",
    ) === "open"
  ));
  const action = await page.locator("[data-showroom]").getAttribute(
    "data-showroom-last-selection-action",
  );
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => (
    document.querySelector("[data-showroom]")?.getAttribute(
      "data-showroom-display-preview-state",
    ) === "closed"
  ));
  return action;
};

const runViewport = async (viewport, orientation) => {
  const page = await browser.newPage({ viewport });
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
  ), undefined, { timeout: 45_000 });
  await openFirstDisplay(page);
  const sceneActivation = await openFromSceneDoubleActivation(
    page,
    viewport.width < 700,
  );
  await page.locator(
    `[data-showroom-setting="orientation"][data-value="${orientation}"]`,
  ).last().evaluate((button) => button.click());
  await page.waitForTimeout(180);
  await page.locator("[data-showroom-display-preview-open]").evaluate(
    (button) => button.click(),
  );
  await page.waitForFunction(() => (
    document.querySelector("[data-showroom]")?.getAttribute(
      "data-showroom-display-preview-state",
    ) === "open"
  ));
  await page.waitForTimeout(360);
  const openState = await inspectPreview(page);
  await page.screenshot({
    path: `/tmp/swisscompact-display-preview-${viewport.width}.png`,
    fullPage: false,
  });
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => (
    document.querySelector("[data-showroom]")?.getAttribute(
      "data-showroom-display-preview-state",
    ) === "closed"
  ));
  const closed = await page.locator(".showroom-display-preview")
    .evaluate((modal) => modal.hidden);
  await page.close();
  return { viewport, orientation, sceneActivation, openState, closed };
};

const desktop = await runViewport({ width: 1440, height: 900 }, "landscape");
const mobile = await runViewport({ width: 390, height: 844 }, "portrait");
await browser.close();

const states = [desktop, mobile];
const invalid = states.filter(({
  viewport,
  orientation,
  sceneActivation,
  openState,
  closed,
}) => (
  !openState.valid
  || openState.hidden !== false
  || openState.state !== "open"
  || openState.role !== "dialog"
  || openState.modal !== "true"
  || openState.colouredPixels < 50
  || !openState.title
  || !openState.meta
  || !openState.headerVisible
  || !openState.siteHeaderHidden
  || !openState.contained
  || !closed
  || sceneActivation !== (viewport.width < 700
    ? "display-double-tap"
    : "display-double-click")
  || openState.orientation !== orientation
  || openState.screenPortrait !== (orientation === "portrait")
  || (orientation === "portrait"
    ? openState.height <= openState.width
    : openState.width <= openState.height)
));

console.log(JSON.stringify({
  valid: invalid.length === 0 && errors.length === 0,
  states,
  errors,
}, null, 2));

if (invalid.length > 0 || errors.length > 0) process.exitCode = 1;

import { chromium } from "playwright-core";

const executablePath =
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const baseURL =
  process.env.SWISSCOMPACT_BASE_URL ?? "http://127.0.0.1:5177/";
const browser = await chromium.launch({ executablePath, headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = [];

page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});
page.on("pageerror", (error) => errors.push(error.message));

await page.goto(baseURL, { waitUntil: "domcontentloaded", timeout: 30_000 });
await page.evaluate(() => {
  sessionStorage.clear();
  document.querySelector("[data-showroom]")?.scrollIntoView({
    block: "start",
    behavior: "instant",
  });
});
await page.reload({ waitUntil: "domcontentloaded" });
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

const click = async (selector) => {
  await page.locator(selector).first().evaluate((button) => button.click());
  await page.waitForTimeout(100);
};

await click('[data-showroom-focus-tool="display"]');
await page.waitForFunction(() => (
  document.querySelector('[data-showroom-selection-item^="display:"]')
  !== null
));
await click('[data-showroom-selection-item^="display:"]');
await page.waitForFunction(() => {
  const root = document.querySelector("[data-showroom]");
  return Boolean(
    root?.getAttribute("data-showroom-display-resize-screen-x")
    && root.classList.contains("has-display-selection")
  );
});

const controls = await page.evaluate(() => ({
  oldSliders: document.querySelectorAll("[data-showroom-display-width]").length,
  oldPresets: document.querySelectorAll(
    "[data-showroom-display-width-preset]",
  ).length,
  oldLimits: document.querySelectorAll(
    "[data-showroom-display-width-limit]",
  ).length,
  currentSizeOutputs: document.querySelectorAll(
    "[data-showroom-display-current-size]",
  ).length,
  resetButtons: document.querySelectorAll(
    "[data-showroom-display-scale-reset]",
  ).length,
}));

const scaleBefore = Number(await page.locator("[data-showroom]").getAttribute(
  "data-showroom-selected-display-width-scale",
));

const resizePoints = await page.evaluate(() => {
  const root = document.querySelector("[data-showroom]");
  const canvas = document.querySelector("[data-showroom-canvas]");
  if (!(canvas instanceof HTMLCanvasElement)) {
    throw new Error("Showroom canvas is missing");
  }
  document.querySelectorAll(
    "[data-showroom-focus-browser], [data-showroom-focus-inspector]",
  ).forEach((element) => {
    element.style.pointerEvents = "none";
  });
  const bounds = canvas.getBoundingClientRect();
  const centreX = Number(root?.getAttribute("data-showroom-display-screen-x"));
  const centreY = Number(root?.getAttribute("data-showroom-display-screen-y"));
  const handleX = Number(
    root?.getAttribute("data-showroom-display-resize-screen-x"),
  );
  const handleY = Number(
    root?.getAttribute("data-showroom-display-resize-screen-y"),
  );
  const factor = 1.45;
  return {
    startX: bounds.left + handleX,
    startY: bounds.top + handleY,
    endX: bounds.left + centreX + (handleX - centreX) * factor,
    endY: bounds.top + centreY + (handleY - centreY) * factor,
    selectionMode: root?.getAttribute("data-showroom-selection-mode"),
    displayFlyoutHidden: document.querySelector(
      "[data-showroom-display-flyout]",
    )?.hidden,
    rootClasses: root?.className,
    canvasBounds: {
      left: bounds.left,
      top: bounds.top,
      width: bounds.width,
      height: bounds.height,
    },
  };
});

await page.evaluate(({ startX, startY }) => {
  const canvas = document.querySelector("[data-showroom-canvas]");
  canvas?.dispatchEvent(new PointerEvent("pointerdown", {
    bubbles: true,
    cancelable: true,
    pointerId: 41,
    pointerType: "mouse",
    button: 0,
    buttons: 1,
    clientX: startX,
    clientY: startY,
  }));
}, resizePoints);
const resizeStarted = await page.locator("[data-showroom]").evaluate(
  (root) => root.classList.contains("is-display-resizing"),
);
await page.evaluate(({ endX, endY }) => {
  const canvas = document.querySelector("[data-showroom-canvas]");
  canvas?.dispatchEvent(new PointerEvent("pointermove", {
    bubbles: true,
    cancelable: true,
    pointerId: 41,
    pointerType: "mouse",
    button: 0,
    buttons: 1,
    clientX: endX,
    clientY: endY,
  }));
  canvas?.dispatchEvent(new PointerEvent("pointerup", {
    bubbles: true,
    cancelable: true,
    pointerId: 41,
    pointerType: "mouse",
    button: 0,
    buttons: 0,
    clientX: endX,
    clientY: endY,
  }));
}, resizePoints);
if (resizeStarted) {
  await page.waitForFunction((before) => (
    Number(document.querySelector("[data-showroom]")?.getAttribute(
      "data-showroom-selected-display-width-scale",
    )) > before * 1.08
  ), scaleBefore, { timeout: 5_000 });
}

const resizedState = await page.evaluate(() => {
  const root = document.querySelector("[data-showroom]");
  document.querySelectorAll(
    "[data-showroom-focus-browser], [data-showroom-focus-inspector]",
  ).forEach((element) => {
    element.style.pointerEvents = "";
  });
  return {
    scale: Number(root?.getAttribute(
      "data-showroom-selected-display-width-scale",
    )),
    scales: root?.getAttribute(
      "data-showroom-display-unit-width-scales",
    )?.split(",") ?? [],
    sizeText: document.querySelector(
      ".showroom-focus-inspector [data-showroom-display-current-size]",
    )?.textContent?.trim() ?? "",
  };
});

await click(
  ".showroom-focus-inspector [data-showroom-display-scale-reset]",
);
await page.waitForFunction(() => (
  document.querySelector("[data-showroom]")?.getAttribute(
    "data-showroom-selected-display-width-scale",
  ) === "1.00"
));
const resetState = await page.evaluate(() => ({
  scale: document.querySelector("[data-showroom]")?.getAttribute(
    "data-showroom-selected-display-width-scale",
  ),
  sizeText: document.querySelector(
    ".showroom-focus-inspector [data-showroom-display-current-size]",
  )?.textContent?.trim() ?? "",
  disabled: document.querySelector(
    ".showroom-focus-inspector [data-showroom-display-scale-reset]",
  )?.disabled ?? false,
}));

await page.screenshot({
  path: "/tmp/swisscompact-display-direct-resize.png",
  fullPage: false,
});
await browser.close();

const valid =
  errors.length === 0
  && controls.oldSliders === 0
  && controls.oldPresets === 0
  && controls.oldLimits === 0
  && controls.currentSizeOutputs === 3
  && controls.resetButtons === 3
  && resizeStarted
  && resizedState.scale > scaleBefore
  && resizedState.scales[0] === resizedState.scale.toFixed(2)
  && resizedState.sizeText.includes("cm")
  && resizedState.sizeText.includes("×")
  && resetState.scale === "1.00"
  && resetState.sizeText.includes("1,00×")
  && resetState.disabled;

console.log(JSON.stringify({
  valid,
  errors,
  controls,
  scaleBefore,
  resizePoints,
  resizeStarted,
  resizedState,
  resetState,
}, null, 2));
if (!valid) process.exitCode = 1;

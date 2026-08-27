import { chromium } from "playwright-core";

const executablePath =
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const baseURL =
  process.env.SWISSCOMPACT_BASE_URL ?? "http://127.0.0.1:5188/";
const browser = await chromium.launch({ executablePath, headless: true });
const context = await browser.newContext({
  viewport: { width: 2048, height: 1024 },
  reducedMotion: "reduce",
});
const page = await context.newPage();
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
await page.locator('[data-showroom-preset="restaurant"]').evaluate(
  (button) => button.click(),
);
await page.waitForTimeout(250);

const clickSelectionItem = async (key) => {
  const item = page.locator(`[data-showroom-selection-item="${key}"]`);
  await item.waitFor({ state: "attached" });
  await item.evaluate((button) => button.click());
  await page.waitForTimeout(100);
};
const structurePositions = async () => page.evaluate(() => {
  const root = document.querySelector("[data-showroom]");
  const number = (name) => Number(root?.getAttribute(name));
  return {
    first: {
      x: number("data-showroom-totem1-x"),
      z: number("data-showroom-totem1-z"),
    },
    second: {
      x: number("data-showroom-totem2-x"),
      z: number("data-showroom-totem2-z"),
    },
  };
});
const selectedDisplayPoint = async () => page.evaluate(() => {
  const root = document.querySelector("[data-showroom]");
  const canvas = document.querySelector("[data-showroom-canvas]");
  if (!(canvas instanceof HTMLCanvasElement)) {
    throw new Error("Showroom canvas is missing");
  }
  const bounds = canvas.getBoundingClientRect();
  return {
    x: bounds.left + Number(
      root?.getAttribute("data-showroom-display-screen-x"),
    ),
    y: bounds.top + Number(
      root?.getAttribute("data-showroom-display-screen-y"),
    ),
  };
});

const before = await structurePositions();

// Record the exact visible display position of the right gold column.
await clickSelectionItem("display:totem:1:0");
const rightDisplayPoint = await selectedDisplayPoint();
const rightOwnershipFromList = await page.evaluate(() => ({
  title: document.querySelector(
    "[data-showroom-focus-inspector-title]",
  )?.textContent?.trim(),
  parent: document.querySelector(
    "[data-showroom-display-parent-label]",
  )?.textContent?.trim(),
}));

// Recreate the reported bug: left green column, second level selected.
await clickSelectionItem("display:totem:0:1");
const leftSelectionBeforeDirectClick = await page.evaluate(() => ({
  title: document.querySelector(
    "[data-showroom-focus-inspector-title]",
  )?.textContent?.trim(),
  parent: document.querySelector(
    "[data-showroom-display-parent-label]",
  )?.textContent?.trim(),
}));

// Click the visible display on the right gold column directly in the scene.
await page.evaluate(() => {
  document.querySelectorAll(
    "[data-showroom-focus-browser], [data-showroom-focus-inspector]",
  ).forEach((element) => {
    element.style.pointerEvents = "none";
  });
});
await page.mouse.click(rightDisplayPoint.x, rightDisplayPoint.y);
await page.waitForTimeout(160);
const directRightSelection = await page.evaluate(() => {
  const root = document.querySelector("[data-showroom]");
  const canvas = document.querySelector("[data-showroom-canvas]");
  const bounds = canvas?.getBoundingClientRect();
  document.querySelectorAll(
    "[data-showroom-focus-browser], [data-showroom-focus-inspector]",
  ).forEach((element) => {
    element.style.pointerEvents = "";
  });
  return {
    title: document.querySelector(
      "[data-showroom-focus-inspector-title]",
    )?.textContent?.trim(),
    parent: document.querySelector(
      "[data-showroom-display-parent-label]",
    )?.textContent?.trim(),
    screenX: (bounds?.left ?? 0) + Number(
      root?.getAttribute("data-showroom-display-screen-x"),
    ),
    screenY: (bounds?.top ?? 0) + Number(
      root?.getAttribute("data-showroom-display-screen-y"),
    ),
  };
});
await page.screenshot({
  path: "/tmp/swisscompact-right-gold-display-selection.png",
  fullPage: false,
});

// The carrier action must now resolve to the same right-hand instance.
await page.locator("[data-showroom-display-parent-edit]").evaluate(
  (button) => button.click(),
);
await page.waitForTimeout(100);
const armed = await page.evaluate(() => {
  const root = document.querySelector("[data-showroom]");
  return {
    index: root?.getAttribute("data-showroom-selected-structure-index"),
    title: document.querySelector(
      "[data-showroom-focus-inspector-title]",
    )?.textContent?.trim(),
  };
});

await page.screenshot({
  path: "/tmp/swisscompact-right-gold-column-selection.png",
  fullPage: false,
});

const directProjectionMatches = Math.hypot(
  directRightSelection.screenX - rightDisplayPoint.x,
  directRightSelection.screenY - rightDisplayPoint.y,
) < 20;
const valid =
  errors.length === 0
  && rightOwnershipFromList.title?.includes(
    "Säule 2 · Displayfläche 1 · Ebene 1",
  )
  && rightOwnershipFromList.parent?.includes("Säule 2")
  && leftSelectionBeforeDirectClick.title?.includes(
    "Säule 1 · Displayfläche 1 · Ebene 2",
  )
  && directRightSelection.title?.includes(
    "Säule 2 · Displayfläche 1 · Ebene 1",
  )
  && directRightSelection.parent?.includes("Säule 2")
  && directProjectionMatches
  && armed.index === "1"
  && armed.title === "Säule 2";

console.log(JSON.stringify({
  valid,
  before,
  rightDisplayPoint,
  rightOwnershipFromList,
  leftSelectionBeforeDirectClick,
  directRightSelection,
  directProjectionMatches,
  armed,
  errors,
}, null, 2));

await context.close();
await browser.close();
if (!valid) process.exitCode = 1;

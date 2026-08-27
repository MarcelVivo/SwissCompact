import { chromium } from "playwright-core";

const executablePath =
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const baseURL =
  process.env.SWISSCOMPACT_BASE_URL ?? "http://127.0.0.1:5173/";
const browser = await chromium.launch({ executablePath, headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];

page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});
page.on("pageerror", (error) => errors.push(error.message));

const selectPreset = async (preset) => {
  await page.locator(
    `[data-showroom-setting="preset"][data-value="${preset}"]`,
  ).first().evaluate((button) => button.click());
  await page.waitForFunction((expected) => (
    document.querySelector("[data-showroom]")?.getAttribute(
      "data-showroom-preset",
    ) === expected
  ), preset);
  await page.waitForTimeout(100);
};

const selectBackWall = async () => {
  await page.locator(
    'button[data-showroom-selection-mode="surface"]',
  ).evaluate((button) => button.click());
  await page.locator(
    '[data-showroom-selection-item="surface:wallBack"]',
  ).evaluate((button) => button.click());
  await page.waitForFunction(() => (
    document.querySelector("[data-showroom]")?.getAttribute(
      "data-showroom-selected-room-surface",
    ) === "wallBack"
  ));
};

const setScale = async (axis, percent) => {
  await page.locator(
    `[data-showroom-back-wall-scale="${axis}"]`,
  ).evaluate((input, value) => {
    input.value = String(value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }, percent);
  await page.waitForTimeout(120);
};

const readState = async () => page.evaluate(() => {
  const showroom = document.querySelector("[data-showroom]");
  const control = document.querySelector(
    "[data-showroom-back-wall-size-control]",
  );
  return {
    scaleX: Number(
      showroom?.getAttribute("data-showroom-back-wall-scale-x"),
    ),
    scaleY: Number(
      showroom?.getAttribute("data-showroom-back-wall-scale-y"),
    ),
    widthCm: Number(
      showroom?.getAttribute("data-showroom-back-wall-width-cm"),
    ),
    heightCm: Number(
      showroom?.getAttribute("data-showroom-back-wall-height-cm"),
    ),
    color:
      showroom?.getAttribute("data-showroom-selected-object-color") ?? "",
    target:
      showroom?.getAttribute("data-showroom-selected-object-color-target")
      ?? "",
    controlHidden: control?.hasAttribute("hidden") ?? true,
    widthOutput:
      document.querySelector(
        '[data-showroom-back-wall-scale-output="x"]',
      )?.textContent ?? "",
    heightOutput:
      document.querySelector(
        '[data-showroom-back-wall-scale-output="y"]',
      )?.textContent ?? "",
  };
});

try {
  await page.goto(baseURL, {
    waitUntil: "domcontentloaded",
    timeout: 30_000,
  });
  await page.locator("[data-marketing-target=\"#wirkung\"]").first().click();
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

  await selectPreset("restaurant");
  await selectBackWall();
  const initial = await readState();
  await page.locator("[data-showroom-object-color=\"#2374d8\"]").click();
  await setScale("x", 75);
  await setScale("y", 120);
  const changed = await readState();

  await selectPreset("cafe");
  await selectBackWall();
  const cafe = await readState();
  await selectPreset("restaurant");
  await selectBackWall();
  const restored = await readState();

  await page.locator("[data-showroom-room-reset]").click();
  await page.waitForTimeout(180);
  await selectBackWall();
  const reset = await readState();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => {
    document.querySelector("[data-showroom]")?.scrollIntoView({
      block: "start",
      behavior: "instant",
    });
  });
  await page.waitForTimeout(120);
  const mobile = await page.evaluate(() => {
    const panel = document.querySelector(
      "[data-showroom-object-color-control]",
    );
    if (!(panel instanceof HTMLElement)) return null;
    const bounds = panel.getBoundingClientRect();
    return {
      left: bounds.left,
      right: bounds.right,
      width: bounds.width,
      viewportWidth: innerWidth,
      horizontalOverflow:
        document.documentElement.scrollWidth > innerWidth + 1,
    };
  });

  const valid =
    errors.length === 0
    && !initial.controlHidden
    && initial.target === "surface:wallBack"
    && initial.scaleX === 1
    && initial.scaleY === 1
    && initial.widthCm === 1050
    && initial.heightCm === 310
    && changed.color === "#2374d8"
    && changed.scaleX === 0.75
    && changed.scaleY === 1.2
    && changed.widthCm === 788
    && changed.heightCm === 372
    && changed.widthOutput === "75%"
    && changed.heightOutput === "120%"
    && cafe.scaleX === 1
    && cafe.scaleY === 1
    && restored.scaleX === 0.75
    && restored.scaleY === 1.2
    && restored.color === "#2374d8"
    && reset.scaleX === 1
    && reset.scaleY === 1
    && reset.color === "#f0dfd4"
    && mobile
    && mobile.left >= 0
    && mobile.right <= mobile.viewportWidth
    && !mobile.horizontalOverflow;

  console.log(JSON.stringify({
    valid,
    errors,
    initial,
    changed,
    cafe,
    restored,
    reset,
    mobile,
  }, null, 2));
  if (!valid) process.exitCode = 1;
} finally {
  await browser.close();
}

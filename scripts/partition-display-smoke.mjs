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

const openSelectionMenu = async () => {
  const menu = page.locator("[data-showroom-selection-menu]");
  if (!await menu.evaluate((element) => element.classList.contains("is-open"))) {
    await menu.locator("[data-showroom-navbar-trigger]").click();
  }
  await page.waitForFunction(() => (
    document.querySelector("[data-showroom-selection-menu]")
      ?.classList.contains("is-open")
  ));
};

const setMode = async (mode) => {
  await openSelectionMenu();
  await page.locator("[data-showroom-expert-finder]").evaluate((details) => {
    details.open = true;
  });
  await page.locator(
    `button[data-showroom-selection-mode="${mode}"]`,
  ).click();
  await page.waitForFunction((expected) => (
    document.querySelector("[data-showroom]")?.getAttribute(
      "data-showroom-selection-mode",
    ) === expected
  ), mode);
};

const selectPreset = async (preset) => {
  await page.locator(
    `[data-showroom-setting="preset"][data-value="${preset}"]`,
  ).first().evaluate((button) => button.click());
  await page.waitForFunction((expected) => (
    document.querySelector("[data-showroom]")?.getAttribute(
      "data-showroom-preset",
    ) === expected
  ), preset);
  await page.waitForTimeout(180);
};

const selectDisplay = async (wall) => {
  await setMode("display");
  const item = page.locator(
    `[data-showroom-selection-item="display:${wall}:0:0"]`,
  );
  if (await item.count() === 0) {
    const keys = await page.locator(
      '[data-showroom-selection-item^="display:"]',
    ).evaluateAll((items) => items.map(
      (candidate) => candidate.getAttribute("data-showroom-selection-item"),
    ));
    throw new Error(`Missing ${wall} display; available: ${keys.join(",")}`);
  }
  await item.click();
  await page.waitForFunction((expected) => {
    const showroom = document.querySelector("[data-showroom]");
    return showroom?.getAttribute("data-showroom-selected-wall") === expected
      && Number.isFinite(Number(showroom?.getAttribute(
        "data-showroom-display-screen-x",
      )));
  }, wall);
  return page.evaluate(() => {
    const showroom = document.querySelector("[data-showroom]");
    return {
      wall: showroom?.getAttribute("data-showroom-selected-wall"),
      x: Number(showroom?.getAttribute("data-showroom-display-screen-x")),
      y: Number(showroom?.getAttribute("data-showroom-display-screen-y")),
    };
  });
};

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
  await setMode("mount");
  const restaurantMounts = await page.locator(
    '[data-showroom-selection-item^="mount:partition"]',
  ).evaluateAll((items) => items.map(
    (item) => item.getAttribute("data-showroom-selection-item"),
  ));
  const restaurantBefore = await selectDisplay("partition1");

  await setMode("partition");
  await page.locator(
    '[data-showroom-selection-item="partition:room-divider"]',
  ).click();
  await page.waitForFunction(() => (
    document.querySelector("[data-showroom]")?.getAttribute(
      "data-showroom-selected-furnishing",
    ) === "room-divider"
  ));
  await page.locator("[data-showroom-simple-advanced]").click();
  await page.locator('[data-showroom-furnishing-rotate="15"]').first().click();
  await page.waitForTimeout(240);
  const restaurantPartitionRotation = Number(await page.locator(
    "[data-showroom]",
  ).getAttribute("data-showroom-furnishing-rotation"));
  const restaurantAfter = await selectDisplay("partition1");
  const displayMovedWithPartition =
    Math.hypot(
      restaurantAfter.x - restaurantBefore.x,
      restaurantAfter.y - restaurantBefore.y,
    ) > 1;

  await setMode("partition");
  await page.locator(
    '[data-showroom-selection-item="partition:room-divider"]',
  ).click();
  await page.locator("[data-showroom-simple-advanced]").click();
  await page.locator("[data-showroom-object-hide]").click();
  await setMode("display");
  const hiddenRestaurantDisplays = await page.locator(
    '[data-showroom-selection-item^="display:partition1:"]',
  ).count();

  await selectPreset("museum");
  await setMode("mount");
  const museumMounts = await page.locator(
    '[data-showroom-selection-item^="mount:partition"]',
  ).evaluateAll((items) => items.map(
    (item) => item.getAttribute("data-showroom-selection-item"),
  ));
  const museumDisplayKeys = await setMode("display").then(() => (
    page.locator(
      '[data-showroom-selection-item^="display:partition"]',
    ).evaluateAll((items) => items.map(
      (item) => item.getAttribute("data-showroom-selection-item"),
    ))
  ));
  const museumSecondDisplay = await selectDisplay("partition2");
  const partitionMountCount = Number(await page.locator(
    "[data-showroom]",
  ).getAttribute("data-showroom-partition-mount-count"));

  const valid =
    errors.length === 0
    && restaurantMounts.join(",") === "mount:partition1"
    && restaurantBefore.wall === "partition1"
    && restaurantAfter.wall === "partition1"
    && Math.abs(restaurantPartitionRotation) > 0.2
    && hiddenRestaurantDisplays === 0
    && museumMounts.join(",")
      === "mount:partition1,mount:partition2"
    && museumDisplayKeys.includes("display:partition1:0:0")
    && museumDisplayKeys.includes("display:partition2:0:0")
    && museumSecondDisplay.wall === "partition2"
    && partitionMountCount === 2;

  console.log(JSON.stringify({
    valid,
    restaurantMounts,
    restaurantBefore,
    restaurantAfter,
    restaurantPartitionRotation,
    displayMovedWithPartition,
    hiddenRestaurantDisplays,
    museumMounts,
    museumDisplayKeys,
    museumSecondDisplay,
    partitionMountCount,
    errors,
  }, null, 2));
  if (!valid) process.exitCode = 1;
} finally {
  await browser.close();
}

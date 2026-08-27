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

const selectSurface = async (surface) => {
  await page.locator(
    'button[data-showroom-selection-mode="surface"]',
  ).evaluate((button) => button.click());
  await page.locator(
    `[data-showroom-selection-item="surface:${surface}"]`,
  ).evaluate((button) => button.click());
  await page.waitForFunction((expected) => (
    document.querySelector("[data-showroom]")?.getAttribute(
      "data-showroom-selected-room-surface",
    ) === expected
  ), surface);
};

const readState = async () => page.evaluate(() => {
  const showroom = document.querySelector("[data-showroom]");
  const control = document.querySelector(
    "[data-showroom-object-color-control]",
  );
  const floorControl = document.querySelector(
    "[data-showroom-floor-finish-control]",
  );
  return {
    selected:
      showroom?.getAttribute("data-showroom-selected-room-surface") ?? "",
    target:
      showroom?.getAttribute("data-showroom-selected-object-color-target")
      ?? "",
    color:
      showroom?.getAttribute("data-showroom-selected-object-color") ?? "",
    wallLeft:
      showroom?.getAttribute("data-showroom-surface-wall-left-color") ?? "",
    wallBack:
      showroom?.getAttribute("data-showroom-surface-wall-back-color") ?? "",
    wallRight:
      showroom?.getAttribute("data-showroom-surface-wall-right-color") ?? "",
    floor:
      showroom?.getAttribute("data-showroom-surface-floor-color") ?? "",
    ceiling:
      showroom?.getAttribute("data-showroom-surface-ceiling-color") ?? "",
    floorFinish:
      showroom?.getAttribute("data-showroom-floor-finish") ?? "",
    pickerHidden: control?.hasAttribute("hidden") ?? true,
    floorOptionsHidden: floorControl?.hasAttribute("hidden") ?? true,
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

  const presets = [
    "takeaway",
    "restaurant",
    "cafe",
    "barber",
    "beautySalon",
    "physio",
    "cinema",
    "museum",
    "eventHall",
    "outdoorShop",
    "mountainStation",
    "fitnessCenter",
    "fashionStore",
    "electronicsStore",
    "shoppingMall",
  ];
  const roomStates = [];
  for (const preset of presets) {
    await selectPreset(preset);
    await selectSurface("ceiling");
    roomStates.push({ preset, ...await readState() });
  }

  await selectPreset("restaurant");
  await selectSurface("wallLeft");
  await page.locator("[data-showroom-object-color=\"#2374d8\"]").click();
  const restaurantWall = await readState();
  await selectSurface("floor");
  await page.locator("[data-showroom-object-color=\"#d90b32\"]").click();
  await page.locator(
    "button[data-showroom-floor-finish=\"stone\"]",
  ).click();
  const restaurantFloor = await readState();

  await selectPreset("cafe");
  await selectSurface("floor");
  await page.locator("[data-showroom-object-color=\"#319761\"]").click();
  await page.locator(
    "button[data-showroom-floor-finish=\"wood\"]",
  ).click();
  const cafeFloor = await readState();

  await selectPreset("restaurant");
  await selectSurface("wallLeft");
  const restaurantWallRestored = await readState();
  await selectSurface("floor");
  const restaurantFloorRestored = await readState();
  await selectSurface("wallRight");
  const independentWall = await readState();

  await page.locator("[data-showroom-room-reset]").click();
  await page.waitForTimeout(220);
  await selectSurface("floor");
  const restaurantReset = await readState();

  const designedFloorFinishes = {
    takeaway: "stone",
    restaurant: "wood",
    cafe: "wood",
    barber: "stone",
    beautySalon: "carpet",
    physio: "wood",
    cinema: "carpet",
    museum: "stone",
    eventHall: "carpet",
    outdoorShop: "stone",
    mountainStation: "stone",
    fitnessCenter: "carpet",
    fashionStore: "wood",
    electronicsStore: "stone",
    shoppingMall: "stone",
  };
  const everyRoomHasSurfaces = roomStates.every((state) => (
    state.selected === "ceiling"
    && state.target === "surface:ceiling"
    && !state.pickerHidden
    && state.floorFinish === designedFloorFinishes[state.preset]
    && state.wallLeft.startsWith("#")
    && state.wallBack.startsWith("#")
    && state.wallRight.startsWith("#")
    && state.ceiling.startsWith("#")
  ));
  const valid =
    errors.length === 0
    && everyRoomHasSurfaces
    && restaurantWall.wallLeft === "#2374d8"
    && restaurantFloor.floor === "#d90b32"
    && restaurantFloor.floorFinish === "stone"
    && !restaurantFloor.floorOptionsHidden
    && cafeFloor.floor === "#319761"
    && cafeFloor.floorFinish === "wood"
    && restaurantWallRestored.wallLeft === "#2374d8"
    && restaurantFloorRestored.floor === "#d90b32"
    && restaurantFloorRestored.floorFinish === "stone"
    && independentWall.wallRight === "#b7c8c2"
    && restaurantReset.floor === "#8a6f5d"
    && restaurantReset.floorFinish === "wood";

  console.log(JSON.stringify({
    valid,
    errors,
    everyRoomHasSurfaces,
    roomStates,
    restaurantWall,
    restaurantFloor,
    cafeFloor,
    restaurantWallRestored,
    restaurantFloorRestored,
    independentWall,
    restaurantReset,
  }, null, 2));
  if (!valid) process.exitCode = 1;
} finally {
  await browser.close();
}

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

const clickSetting = async (key, value) => {
  await page.locator(
    `[data-showroom-setting="${key}"][data-value="${value}"]`,
  ).first().evaluate((button) => button.click());
  await page.waitForTimeout(180);
};

const selectFurnishing = async (id) => {
  await page.locator(
    `[data-showroom-furnishing-select="${id}"]`,
  ).first().evaluate((button) => button.click());
  await page.waitForTimeout(120);
};

const readState = async () => page.evaluate(() => {
  const showroom = document.querySelector("[data-showroom]");
  return {
    preset: showroom?.getAttribute("data-showroom-preset") ?? "",
    roomSize: showroom?.getAttribute("data-showroom-room-size") ?? "",
    minimumRoomSize:
      showroom?.getAttribute("data-showroom-minimum-room-size") ?? "",
    startViewFits:
      showroom?.getAttribute("data-showroom-start-view-fits") === "true",
    light: showroom?.getAttribute("data-showroom-light") ?? "",
    brightness: Number(
      showroom?.getAttribute("data-showroom-brightness"),
    ),
    selectedFurnishing:
      showroom?.getAttribute("data-showroom-selected-furnishing") ?? "",
    furnishingRotation: Number(
      showroom?.getAttribute("data-showroom-furnishing-rotation"),
    ),
    lastResetPreset:
      showroom?.getAttribute("data-showroom-last-reset-preset") ?? "",
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
  const initialSizes = [];
  for (const preset of presets) {
    await clickSetting("preset", preset);
    const state = await readState();
    initialSizes.push({
      preset,
      roomSize: state.roomSize,
      minimumRoomSize: state.minimumRoomSize,
      startViewFits: state.startViewFits,
    });
  }

  await clickSetting("preset", "restaurant");
  await selectFurnishing("service-counter");
  const restaurantDefault = await readState();
  await page.locator(
    "[data-showroom-furnishing-rotate=\"15\"]",
  ).first().click();
  await clickSetting("roomSize", "standard");
  await clickSetting("light", "day");
  const restaurantChanged = await readState();

  await clickSetting("preset", "cafe");
  await selectFurnishing("service-counter");
  const cafeDefault = await readState();
  await page.locator(
    "[data-showroom-furnishing-rotate=\"15\"]",
  ).first().click();
  await clickSetting("roomSize", "compact");
  await clickSetting("light", "day");
  const cafeChanged = await readState();

  await clickSetting("preset", "restaurant");
  await selectFurnishing("service-counter");
  const restaurantRestored = await readState();

  await page.locator("[data-showroom-room-reset]").click();
  await page.waitForTimeout(300);
  await selectFurnishing("service-counter");
  const restaurantReset = await readState();

  await clickSetting("preset", "cafe");
  await selectFurnishing("service-counter");
  const cafeRestored = await readState();

  const designedSizes = {
    takeaway: "xs",
    restaurant: "small",
    cafe: "xs",
    barber: "xs",
    beautySalon: "small",
    physio: "small",
    cinema: "small",
    museum: "compact",
    eventHall: "compact",
    outdoorShop: "small",
    mountainStation: "small",
    fitnessCenter: "compact",
    fashionStore: "compact",
    electronicsStore: "compact",
    shoppingMall: "standard",
  };
  const allRoomsUseDesignedSize = initialSizes.every(
    (state) => state.roomSize === designedSizes[state.preset]
      && state.roomSize === state.minimumRoomSize
      && state.startViewFits,
  );
  const restaurantPersists =
    restaurantChanged.roomSize === "standard"
    && restaurantChanged.light === "day"
    && restaurantRestored.roomSize === restaurantChanged.roomSize
    && restaurantRestored.light === restaurantChanged.light
    && Math.abs(
      restaurantRestored.furnishingRotation
        - restaurantChanged.furnishingRotation,
    ) < 0.002;
  const restaurantResetValid =
    restaurantReset.roomSize === "small"
    && restaurantReset.light === "warm"
    && restaurantReset.brightness === 92
    && restaurantReset.lastResetPreset === "restaurant"
    && Math.abs(
      restaurantReset.furnishingRotation
        - restaurantDefault.furnishingRotation,
    ) < 0.002;
  const cafePersistsIndependently =
    cafeChanged.roomSize === "compact"
    && cafeChanged.light === "day"
    && cafeRestored.roomSize === cafeChanged.roomSize
    && cafeRestored.light === cafeChanged.light
    && Math.abs(
      cafeRestored.furnishingRotation - cafeChanged.furnishingRotation,
    ) < 0.002
    && Math.abs(
      cafeRestored.furnishingRotation - cafeDefault.furnishingRotation,
    ) > 0.1;
  const valid =
    errors.length === 0
    && allRoomsUseDesignedSize
    && restaurantPersists
    && restaurantResetValid
    && cafePersistsIndependently;

  console.log(JSON.stringify({
    valid,
    errors,
    allRoomsUseDesignedSize,
    restaurantPersists,
    restaurantResetValid,
    cafePersistsIndependently,
    initialSizes,
    restaurantDefault,
    restaurantChanged,
    restaurantRestored,
    restaurantReset,
    cafeDefault,
    cafeChanged,
    cafeRestored,
  }, null, 2));
  if (!valid) process.exitCode = 1;
} finally {
  await browser.close();
}

import { chromium } from "playwright-core";

const executablePath =
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const baseURL =
  process.env.SWISSCOMPACT_BASE_URL ?? "http://127.0.0.1:4173/";
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
  await page.waitForTimeout(140);
};

const selectFurnishing = async (id) => {
  await page.locator(
    `[data-showroom-furnishing-select="${id}"]`,
  ).first().evaluate((button) => button.click());
  await page.waitForFunction((expected) => (
    document.querySelector("[data-showroom]")?.getAttribute(
      "data-showroom-selected-furnishing",
    ) === expected
  ), id);
};

const colorState = async () => page.evaluate(() => {
  const showroom = document.querySelector("[data-showroom]");
  const control = document.querySelector(
    "[data-showroom-object-color-control]",
  );
  return {
    color:
      showroom?.getAttribute("data-showroom-selected-object-color") ?? "",
    target:
      showroom?.getAttribute(
        "data-showroom-selected-object-color-target",
      ) ?? "",
    hidden: control?.hasAttribute("hidden") ?? true,
  };
});

const selectFirstFurnishing = async () => page.evaluate(() => {
  const button = document.querySelector(
    "[data-showroom-furnishing-select]",
  );
  if (!(button instanceof HTMLButtonElement)) return "";
  const id = button.dataset.showroomFurnishingSelect ?? "";
  button.click();
  return id;
});

const selectFirstStructure = async (wall) => {
  await page.waitForFunction((structureWall) => {
    const showroom = document.querySelector("[data-showroom]");
    const prefix = structureWall === "totem"
      ? "data-showroom-totem1-hit-screen-"
      : "data-showroom-stele1-hit-screen-";
    return Number.isFinite(Number(showroom?.getAttribute(`${prefix}x`)))
      && Number.isFinite(Number(showroom?.getAttribute(`${prefix}y`)));
  }, wall);
  await page.evaluate((structureWall) => {
    const showroom = document.querySelector("[data-showroom]");
    const canvas = document.querySelector("[data-showroom-canvas]");
    if (!(canvas instanceof HTMLCanvasElement)) return;
    const prefix = structureWall === "totem"
      ? "data-showroom-totem1-hit-screen-"
      : "data-showroom-stele1-hit-screen-";
    const bounds = canvas.getBoundingClientRect();
    const clientX =
      bounds.left + Number(showroom?.getAttribute(`${prefix}x`));
    const clientY =
      bounds.top + Number(showroom?.getAttribute(`${prefix}y`));
    canvas.dispatchEvent(new PointerEvent("pointerdown", {
      bubbles: true,
      pointerId: 141,
      pointerType: "mouse",
      button: 0,
      clientX,
      clientY,
    }));
  }, wall);
  await page.waitForFunction((expected) => (
    document.querySelector("[data-showroom]")?.getAttribute(
      "data-showroom-selected-structure",
    ) === expected
  ), wall);
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
  const roomPickerStates = [];
  for (const preset of presets) {
    await selectPreset(preset);
    const id = await selectFirstFurnishing();
    await page.waitForTimeout(80);
    roomPickerStates.push({
      preset,
      id,
      ...await colorState(),
    });
  }

  await selectPreset("restaurant");
  await selectFurnishing("restaurant-table-group-1");
  await page.locator(
    "[data-showroom-object-color=\"#2374d8\"]",
  ).click();
  const coloredFurnishing = await colorState();

  await selectPreset("cafe");
  await selectPreset("restaurant");
  await selectFurnishing("restaurant-table-group-1");
  const restoredFurnishing = await colorState();

  await selectFurnishing("service-counter");
  const independentFurnishing = await colorState();

  await selectFirstStructure("totem");
  const structureBefore = await colorState();
  await page.locator(
    "[data-showroom-object-color=\"#319761\"]",
  ).click();
  const coloredStructure = await colorState();

  await selectPreset("cafe");
  await selectPreset("restaurant");
  await selectFirstStructure("totem");
  const restoredStructure = await colorState();

  await page.locator("[data-showroom-select-display]").first().evaluate(
    (button) => button.click(),
  );
  await page.waitForTimeout(100);
  const displayState = await colorState();

  await page.locator("[data-showroom-room-reset]").click();
  await page.waitForTimeout(220);
  await selectFurnishing("restaurant-table-group-1");
  const resetFurnishing = await colorState();

  const everyRoomHasPicker = roomPickerStates.every((state) => (
    state.id
    && !state.hidden
    && state.target === "furnishing"
  ));
  const valid =
    errors.length === 0
    && everyRoomHasPicker
    && coloredFurnishing.color === "#2374d8"
    && restoredFurnishing.color === "#2374d8"
    && independentFurnishing.color === "original"
    && structureBefore.target === "structure"
    && structureBefore.color === "#196f73"
    && coloredStructure.color === "#319761"
    && restoredStructure.color === "#319761"
    && displayState.hidden
    && displayState.target === ""
    && resetFurnishing.color === "original";

  console.log(JSON.stringify({
    valid,
    errors,
    everyRoomHasPicker,
    roomPickerStates,
    coloredFurnishing,
    restoredFurnishing,
    independentFurnishing,
    structureBefore,
    coloredStructure,
    restoredStructure,
    displayState,
    resetFurnishing,
  }, null, 2));
  if (!valid) process.exitCode = 1;
} finally {
  await browser.close();
}

import { chromium } from "playwright-core";

const executablePath =
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const baseURL =
  process.env.SWISSCOMPACT_BASE_URL ?? "http://127.0.0.1:4173/";
const browser = await chromium.launch({ executablePath, headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = [];

page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});
page.on("pageerror", (error) => errors.push(error.message));

await page.goto(baseURL, { waitUntil: "domcontentloaded", timeout: 30_000 });
await page.locator("[data-marketing-target=\"#wirkung\"]").first().click();
await page.waitForTimeout(500);
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

const state = async () => page.evaluate(() => {
  const showroom = document.querySelector("[data-showroom]");
  return {
    wall: showroom?.getAttribute("data-showroom-selected-wall") ?? "",
    roomWidth: Number(showroom?.getAttribute(
      "data-showroom-room-width-metres",
    )),
    roomDepth: Number(showroom?.getAttribute(
      "data-showroom-room-depth-metres",
    )),
    roomHeight: Number(showroom?.getAttribute(
      "data-showroom-room-height-metres",
    )),
    mountWidth: Number(showroom?.getAttribute(
      "data-showroom-mount-width-metres",
    )),
    mountHeight: Number(showroom?.getAttribute(
      "data-showroom-mount-height-metres",
    )),
    counterWidth: Number(showroom?.getAttribute(
      "data-showroom-counter-width-metres",
    )),
    counterHeight: Number(showroom?.getAttribute(
      "data-showroom-counter-height-metres",
    )),
    fit: Number(showroom?.getAttribute("data-showroom-display-fit")),
    maximumScale: Number(showroom?.getAttribute(
      "data-showroom-maximum-display-width-scale",
    )),
    dimensionLabel: document.querySelector(
      "[data-showroom-mount-dimensions]",
    )?.textContent?.trim() ?? "",
  };
});

const selectWall = async (wall) => {
  await page.locator(
    `[data-showroom-setting="wall"][data-value="${wall}"]`,
  ).first().evaluate((button) => button.click());
  await page.waitForFunction((value) => (
    document.querySelector("[data-showroom]")?.getAttribute(
      "data-showroom-selected-wall",
    ) === value
  ), wall);
  return state();
};

const surfaces = {
  menu: await selectWall("menu"),
  sideRight: await selectWall("sideRight"),
  counterFront: await selectWall("counterFront"),
  counterTop: await selectWall("counterTop"),
};

await page.locator(
  "[data-showroom-totem-setup=\"ceilingColumn\"]",
).first().evaluate((button) => button.click());
surfaces.totem = await state();
await page.locator(
  "[data-showroom-totem-setup=\"halfTotem\"]",
).first().evaluate((button) => button.click());
surfaces.stele = await state();

const roomSizes = {};
for (const [size, expectedWidth] of Object.entries({
  xs: 6,
  small: 10.5,
  compact: 16.5,
  standard: 24.6,
})) {
  await page.locator(
    `[data-showroom-setting="roomSize"][data-value="${size}"]`,
  ).first().evaluate((button) => button.click());
  await selectWall("menu");
  roomSizes[size] = {
    expectedWidth,
    ...await state(),
  };
}

await browser.close();

const closeTo = (value, expected, tolerance = 0.011) => (
  Math.abs(value - expected) <= tolerance
);
const expectedSurfaces = {
  menu: [5.6, 2.8],
  sideRight: [5.6, 2.8],
  counterFront: [4.3, 0.56],
  counterTop: [4, 1.1],
  totem: [0.83, 2.82],
  stele: [0.77, 1.22],
};
const surfaceDimensionsValid = Object.entries(expectedSurfaces).every(
  ([wall, [width, height]]) => (
    surfaces[wall].wall === wall
    && closeTo(surfaces[wall].mountWidth, width)
    && closeTo(surfaces[wall].mountHeight, height)
    && surfaces[wall].fit > 0
    && surfaces[wall].fit <= 1
    && surfaces[wall].dimensionLabel.includes("m")
  ),
);
const roomDimensionsValid = Object.values(roomSizes).every((item) => (
  closeTo(item.roomWidth, item.expectedWidth)
  && closeTo(item.roomDepth, item.expectedWidth)
  && closeTo(item.roomHeight, 3.1)
  && closeTo(item.mountWidth, item.expectedWidth - 0.4)
  && closeTo(item.mountHeight, 2.8)
));
const constrainedSurfacesValid =
  surfaces.menu.maximumScale === 4
  && surfaces.counterFront.maximumScale < 4
  && surfaces.counterTop.maximumScale < 4
  && surfaces.totem.maximumScale < 4
  && surfaces.stele.maximumScale < 4;
const valid = errors.length === 0
  && surfaceDimensionsValid
  && roomDimensionsValid
  && constrainedSurfacesValid;

console.log(JSON.stringify({
  valid,
  errors,
  surfaceDimensionsValid,
  roomDimensionsValid,
  constrainedSurfacesValid,
  surfaces,
  roomSizes,
}, null, 2));
if (!valid) process.exitCode = 1;

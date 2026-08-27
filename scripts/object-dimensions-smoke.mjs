import { chromium } from "playwright-core";

const executablePath =
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const baseURL =
  process.env.SWISSCOMPACT_BASE_URL ?? "http://127.0.0.1:4173/";
const browser = await chromium.launch({ executablePath, headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
const errors = [];

page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});
page.on("pageerror", (error) => errors.push(error.message));

await page.goto(baseURL, { waitUntil: "domcontentloaded", timeout: 30_000 });
await page.locator("[data-marketing-target=\"#wirkung\"]").first().click();
await page.waitForTimeout(300);
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

const setDimension = async (key, value) => {
  const input = page.locator(
    `[data-showroom-object-dimension="${key}"]`,
  );
  await input.fill(String(value));
  await input.evaluate((element) => {
    element.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await page.waitForTimeout(120);
};

const state = async () => page.evaluate(() => {
  const showroom = document.querySelector("[data-showroom]");
  const value = (name) => showroom?.getAttribute(name) ?? "";
  return {
    selectedObject: value("data-showroom-selected-object"),
    widthCm: Number(value("data-showroom-selected-object-width-cm")),
    heightCm: Number(value("data-showroom-selected-object-height-cm")),
    depthCm: Number(value("data-showroom-selected-object-depth-cm")),
    diameterCm: Number(value("data-showroom-selected-object-diameter-cm")),
    shape: value("data-showroom-selected-object-shape"),
    renderedShape: value(
      "data-showroom-selected-structure-rendered-shape",
    ),
    counterWidthMetres: Number(
      value("data-showroom-counter-width-metres"),
    ),
    counterHeightMetres: Number(
      value("data-showroom-counter-height-metres"),
    ),
    counterDepthMetres: Number(
      value("data-showroom-counter-depth-metres"),
    ),
    mountWidthMetres: Number(
      value("data-showroom-mount-width-metres"),
    ),
    mountHeightMetres: Number(
      value("data-showroom-mount-height-metres"),
    ),
  };
});

await page.locator("[data-showroom-object-nav=\"menu\"]").click();
await setDimension("widthCm", 450);
await setDimension("heightCm", 240);
const wall = await state();

await page.locator("[data-showroom-object-nav=\"counterFront\"]").click();
await page.waitForTimeout(120);
const counter = await page.evaluate(() => {
  const showroom = document.querySelector("[data-showroom]");
  const flyout = document.querySelector("[data-showroom-object-flyout]");
  return {
    selectedFurnishing:
      showroom?.getAttribute("data-showroom-selected-furnishing") ?? "",
    flyoutHidden: flyout?.hasAttribute("hidden") ?? false,
    visibleHandles: Array.from(
      document.querySelectorAll("[data-showroom-furnishing-resize-handle]"),
    ).filter((element) => !element.hasAttribute("hidden")).length,
  };
});

await page.locator("[data-showroom-object-nav=\"totem\"]").click();
await page.locator("[data-showroom-structure-shape=\"round\"]").click();
await setDimension("diameterCm", 90);
await setDimension("heightCm", 250);
const roundColumn = await state();

await page.locator("[data-showroom-object-nav=\"stele\"]").click();
const steleShapeControlHidden = await page.locator(
  "[data-showroom-structure-shape-group]",
).evaluate((element) => element.hasAttribute("hidden"));
await setDimension("widthCm", 82);
await setDimension("heightCm", 190);
await setDimension("depthCm", 36);
const stele = await state();

await browser.close();

const closeTo = (value, expected, tolerance = 0.011) => (
  Math.abs(value - expected) <= tolerance
);
const wallValid =
  wall.selectedObject === "menu"
  && wall.widthCm === 450
  && wall.heightCm === 240
  && closeTo(wall.mountWidthMetres, 4.5)
  && closeTo(wall.mountHeightMetres, 2.4);
const counterValid =
  counter.selectedFurnishing === "service-counter"
  && counter.flyoutHidden
  && counter.visibleHandles === 1;
const roundColumnValid =
  roundColumn.selectedObject === "totem"
  && roundColumn.shape === "round"
  && roundColumn.renderedShape === "round"
  && roundColumn.diameterCm === 90
  && roundColumn.heightCm === 250
  // Display installations shared by several columns must fit the smallest
  // active mounting face. The existing 75 cm column therefore remains the
  // limiting face while this selected column grows to 90 cm.
  && closeTo(roundColumn.mountWidthMetres, 0.83)
  && closeTo(roundColumn.mountHeightMetres, 2.46);
const steleValid =
  steleShapeControlHidden
  && stele.selectedObject === "stele"
  && stele.shape === "rectangular"
  && stele.renderedShape === "rectangular"
  && stele.widthCm === 82
  && stele.heightCm === 190
  && stele.depthCm === 36;
const valid =
  errors.length === 0
  && wallValid
  && counterValid
  && roundColumnValid
  && steleValid;

console.log(JSON.stringify({
  valid,
  errors,
  wallValid,
  counterValid,
  roundColumnValid,
  steleValid,
  wall,
  counter,
  roundColumn,
  stele,
}, null, 2));
if (!valid) process.exitCode = 1;

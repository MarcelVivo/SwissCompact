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
await page.locator("[data-showroom]").scrollIntoViewIfNeeded();
await page.waitForFunction(() => (
  document.querySelector("[data-showroom]")?.getAttribute(
    "data-showroom-ready",
  ) === "true"
), undefined, { timeout: 45_000 });

await page.locator(
  "[data-showroom-setting=\"wall\"][data-value=\"menu\"]",
).first().evaluate((button) => button.click());
await page.waitForFunction(() => (
  document.querySelector("[data-showroom]")?.getAttribute(
    "data-showroom-selected-wall",
  ) === "menu"
));

const displayMenu = page.locator(".showroom-edge-menu--displays");
await displayMenu.locator("[data-showroom-edge-trigger]").evaluate(
  (button) => button.click(),
);

const setDisplaySize = async (index, size) => {
  await displayMenu.locator(
    `[data-showroom-select-display="${index}"]`,
  ).evaluate((button) => button.click());
  await displayMenu.locator(
    `[data-showroom-setting="displaySize"][data-value="${size}"]`,
  ).evaluate((button) => button.click());
  await page.waitForFunction(({ selectedIndex, selectedSize }) => {
    const showroom = document.querySelector("[data-showroom]");
    return showroom?.getAttribute("data-showroom-selected-display-index")
      === String(selectedIndex)
      && showroom?.getAttribute("data-showroom-selected-display-size")
        === String(selectedSize);
  }, { selectedIndex: index, selectedSize: size });
};

await setDisplaySize(0, 22);
await setDisplaySize(1, 55);
await setDisplaySize(2, 75);

await displayMenu.locator(
  "[data-showroom-select-display=\"1\"]",
).evaluate((button) => button.click());
await displayMenu.locator(
  "[data-showroom-setting=\"orientation\"][data-value=\"portrait\"]",
).evaluate((button) => button.click());
await displayMenu.locator(
  "[data-showroom-select-display=\"0\"]",
).evaluate((button) => button.click());

const state = await page.evaluate(() => {
  const showroom = document.querySelector("[data-showroom]");
  const activeSizeButton = document.querySelector(
    ".showroom-edge-menu--displays "
      + "[data-showroom-setting=\"displaySize\"].is-active",
  );
  return {
    sizes:
      showroom?.getAttribute("data-showroom-display-unit-sizes") ?? "",
    selectedSize:
      showroom?.getAttribute("data-showroom-selected-display-size") ?? "",
    selectedIndex:
      showroom?.getAttribute("data-showroom-selected-display-index") ?? "",
    sizeOptionCount: document.querySelectorAll(
      ".showroom-edge-menu--displays "
        + "[data-showroom-setting=\"displaySize\"]",
    ).length,
    activeSize: activeSizeButton?.getAttribute("data-value") ?? "",
    output: document.querySelector(
      ".showroom-edge-menu--displays "
        + "[data-showroom-display-size-output]",
    )?.textContent?.trim() ?? "",
    edgeSummary: document.querySelector(
      "[data-showroom-edge-value=\"displays\"]",
    )?.textContent?.trim() ?? "",
  };
});

await page.locator(
  "[data-showroom-totem-setup=\"ceilingColumn\"]",
).first().evaluate((button) => button.click());
await page.waitForFunction(() => (
  document.querySelector("[data-showroom]")?.getAttribute(
    "data-showroom-selected-wall",
  ) === "totem"
));
await displayMenu.locator(
  "[data-showroom-setting=\"displaySize\"][data-value=\"65\"]",
).evaluate((button) => button.click());
const totemState = await page.evaluate(() => {
  const showroom = document.querySelector("[data-showroom]");
  return {
    wall: showroom?.getAttribute("data-showroom-selected-wall") ?? "",
    size:
      showroom?.getAttribute("data-showroom-selected-display-size") ?? "",
    sizes:
      showroom?.getAttribute("data-showroom-display-unit-sizes") ?? "",
  };
});

await page.locator(
  "[data-showroom-totem-setup=\"halfTotem\"]",
).first().evaluate((button) => button.click());
await page.waitForFunction(() => (
  document.querySelector("[data-showroom]")?.getAttribute(
    "data-showroom-selected-wall",
  ) === "stele"
));
await displayMenu.locator(
  "[data-showroom-setting=\"displaySize\"][data-value=\"32\"]",
).evaluate((button) => button.click());
const steleState = await page.evaluate(() => {
  const showroom = document.querySelector("[data-showroom]");
  return {
    wall: showroom?.getAttribute("data-showroom-selected-wall") ?? "",
    size:
      showroom?.getAttribute("data-showroom-selected-display-size") ?? "",
    sizes:
      showroom?.getAttribute("data-showroom-display-unit-sizes") ?? "",
  };
});

await page.evaluate(() => {
  document.querySelector("[data-showroom]")?.scrollIntoView({
    block: "start",
    behavior: "instant",
  });
});
await page.waitForTimeout(300);
await page.screenshot({
  path: "/tmp/swisscompact-display-sizes.png",
  fullPage: false,
});

const mobilePage = await browser.newPage({
  viewport: { width: 390, height: 844 },
});
mobilePage.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});
mobilePage.on("pageerror", (error) => errors.push(error.message));
await mobilePage.goto(baseURL, {
  waitUntil: "domcontentloaded",
  timeout: 30_000,
});
await mobilePage.locator(
  "[data-marketing-target=\"#wirkung\"]",
).first().click();
await mobilePage.waitForFunction(() => (
  document.body.classList.contains("is-marketing-view")
), undefined, { timeout: 10_000 });
await mobilePage.evaluate(() => {
  document.querySelector("[data-showroom]")?.scrollIntoView({
    block: "start",
    behavior: "instant",
  });
});
await mobilePage.waitForFunction(() => (
  document.querySelector("[data-showroom]")?.getAttribute(
    "data-showroom-ready",
  ) === "true"
), undefined, { timeout: 45_000 });
await mobilePage.evaluate(() => {
  document.querySelector("[data-showroom]")?.scrollIntoView({
    block: "start",
    behavior: "instant",
  });
});
await mobilePage.locator(
  "[data-showroom-setting=\"wall\"][data-value=\"menu\"]",
).first().evaluate((button) => button.click());
await mobilePage.locator(
  "[data-showroom-select-display=\"0\"]",
).first().evaluate((button) => button.click());
await mobilePage.waitForFunction(() => (
  !document.querySelector("[data-showroom-display-flyout]")
    ?.hasAttribute("hidden")
));
const mobileState = await mobilePage.evaluate(() => {
  const flyout = document.querySelector("[data-showroom-display-flyout]");
  const bounds = flyout?.getBoundingClientRect();
  return {
    flyoutFits: Boolean(
      bounds
      && bounds.left >= 0
      && bounds.right <= window.innerWidth
      && bounds.top >= 0
      && bounds.bottom <= window.innerHeight
    ),
    sizeOptionCount: flyout?.querySelectorAll(
      "[data-showroom-setting=\"displaySize\"]",
    ).length ?? 0,
    horizontalOverflow:
      document.documentElement.scrollWidth > window.innerWidth + 1,
  };
});
await mobilePage.screenshot({
  path: "/tmp/swisscompact-display-sizes-mobile.png",
  fullPage: false,
});
await mobilePage.close();
await browser.close();

const valid = errors.length === 0
  && state.sizes === "22,55,75"
  && state.selectedSize === "22"
  && state.selectedIndex === "0"
  && state.sizeOptionCount === 7
  && state.activeSize === "22"
  && state.output === "22″ · 49 × 27 cm"
  && state.edgeSummary.includes("22″")
  && totemState.wall === "totem"
  && totemState.size === "65"
  && totemState.sizes.split(",").every((size) => (
    size === "32" || size === "65"
  ))
  && steleState.wall === "stele"
  && steleState.size === "32"
  && steleState.sizes.split(",").every((size) => (
    size === "32"
  ))
  && mobileState.flyoutFits
  && mobileState.sizeOptionCount === 7
  && !mobileState.horizontalOverflow;

console.log(JSON.stringify({
  valid,
  errors,
  state,
  totemState,
  steleState,
  mobileState,
}, null, 2));
if (!valid) process.exitCode = 1;

import { chromium } from "playwright-core";

const executablePath =
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const baseURL =
  process.env.SWISSCOMPACT_BASE_URL ?? "http://127.0.0.1:5175/";
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
), undefined, { timeout: 30_000 });

await page.locator("[data-showroom-themes-toggle]").first().click();
await page.waitForTimeout(360);
const modalState = await page.evaluate(() => {
  const dialog = document.querySelector("[data-showroom-themes]");
  return {
    open: dialog?.classList.contains("is-open") ?? false,
    ariaHidden: dialog?.getAttribute("aria-hidden"),
    focusInside: dialog?.contains(document.activeElement) ?? false,
  };
});
await page.screenshot({
  path: "/tmp/swisscompact-showroom-themes.png",
  fullPage: false,
});
await page.locator("[data-showroom-theme-option=\"beauty\"]").click();
await page.waitForFunction(() => {
  const showroom = document.querySelector("[data-showroom]");
  return showroom?.getAttribute("data-showroom-theme") === "beauty"
    && showroom?.getAttribute("data-showroom-preset") === "barber";
});

const presets = ["barber", "beautySalon", "physio"];
const presetStates = [];
for (const preset of presets) {
  await page.locator(
    `.showroom-navbar-dropdown--room-type `
      + `[data-showroom-setting="preset"][data-value="${preset}"]`,
  ).evaluate((button) => button.click());
  await page.waitForFunction((value) => (
    document.querySelector("[data-showroom]")?.getAttribute(
      "data-showroom-preset",
    ) === value
  ), preset);
  await page.waitForTimeout(180);
  await page.evaluate(() => {
    document.querySelector("[data-showroom]")?.scrollIntoView({
      block: "start",
      behavior: "instant",
    });
  });
  await page.waitForTimeout(120);
  await page.screenshot({
    path: `/tmp/swisscompact-beauty-${preset}.png`,
    fullPage: false,
  });
  if (preset === "physio") {
    await page.locator(
      "[data-showroom-object-nav=\"sideLeft\"]",
    ).evaluate((button) => button.click());
    await page.waitForTimeout(900);
    await page.screenshot({
      path: "/tmp/swisscompact-beauty-physio-side-left.png",
      fullPage: false,
    });
  }
  presetStates.push(await page.evaluate(() => ({
    preset: document.querySelector("[data-showroom]")?.getAttribute(
      "data-showroom-preset",
    ),
    architecture: document.querySelector("[data-showroom]")?.getAttribute(
      "data-showroom-architecture",
    ),
    roomType: document.querySelector(
      "[data-showroom-navbar-value=\"preset\"]",
    )?.textContent?.trim(),
    furnishings: document.querySelector("[data-showroom]")?.getAttribute(
      "data-showroom-furnishing-count",
    ),
    visibleFurnishings: document.querySelector("[data-showroom]")?.getAttribute(
      "data-showroom-visible-furnishings",
    ),
    animatedDisplays: document.querySelector("[data-showroom]")?.getAttribute(
      "data-showroom-animated-displays",
    ),
  })));
}

const finalState = await page.evaluate(() => ({
  theme: document.querySelector("[data-showroom]")?.getAttribute(
    "data-showroom-theme",
  ),
  themeLabel: document.querySelector(
    "[data-showroom-theme-label]",
  )?.textContent?.trim(),
  visibleRoomTypes: Array.from(document.querySelectorAll(
    ".showroom-navbar-dropdown--room-type "
      + "[data-showroom-preset-theme]:not([hidden])",
  )).map((button) => button.textContent?.trim()),
  contentLabels: Array.from(document.querySelectorAll(
    ".showroom-display-flyout "
      + "[data-showroom-setting=\"content\"]",
  )).map((button) => button.textContent?.trim()),
  beautyAssets: performance.getEntriesByType("resource")
    .map((entry) => entry.name)
    .filter((name) => name.includes("/showroom/beauty-content/"))
    .length,
  modalAriaHidden: document.querySelector("[data-showroom-themes]")
    ?.getAttribute("aria-hidden"),
}));

await page.evaluate(() => {
  document.querySelector("[data-showroom]")?.scrollIntoView({
    block: "start",
    behavior: "instant",
  });
});
await page.waitForTimeout(260);
await page.screenshot({
  path: "/tmp/swisscompact-beauty-showroom-smoke.png",
  fullPage: false,
});
await browser.close();

const validPresets = presetStates.every((state, index) => (
  state.preset === presets[index]
  && state.architecture === presets[index]
  && Number(state.furnishings) >= 3
  && Number(state.visibleFurnishings) >= 3
  && Number(state.animatedDisplays) >= 1
));
const expectedRoomTypes = [
  "Coiffeur & Barber Shop",
  "Beauty Salon & Kosmetik",
  "Physiotherapie & Medizinische Massage",
];
const valid = errors.length === 0
  && modalState.open
  && modalState.ariaHidden === "false"
  && modalState.focusInside
  && validPresets
  && finalState.theme === "beauty"
  && finalState.themeLabel === "Beauty & Personal Care"
  && finalState.visibleRoomTypes.join("|") === expectedRoomTypes.join("|")
  && finalState.contentLabels.join("|")
    === "Services & Styling|Look & Care|Termin & Empfang"
  && finalState.beautyAssets >= 8
  && finalState.modalAriaHidden === "true";

console.log(JSON.stringify({
  valid,
  errors,
  modalState,
  presetStates,
  finalState,
}, null, 2));
if (!valid) process.exitCode = 1;

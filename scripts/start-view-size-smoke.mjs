import { chromium } from "playwright-core";

const executablePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const baseURL = process.env.SWISSCOMPACT_BASE_URL ?? "http://127.0.0.1:4175/";
const browser = await chromium.launch({ executablePath, headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = [];
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});
page.on("pageerror", (error) => errors.push(error.message));

try {
  await page.goto(baseURL, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.evaluate(() => {
    document.querySelector("[data-showroom]")?.scrollIntoView({
      block: "start",
      behavior: "instant",
    });
  });
  await page.waitForFunction(() => (
    document.querySelector("[data-showroom]")?.getAttribute("data-showroom-ready") === "true"
  ), undefined, { timeout: 45_000 });

  const presets = await page.evaluate(() => Array.from(new Set(Array.from(
    document.querySelectorAll('[data-showroom-setting="preset"][data-value]'),
    (button) => button.getAttribute("data-value"),
  ).filter(Boolean))));
  const states = [];
  for (const preset of presets) {
    await page.locator(`[data-showroom-setting="preset"][data-value="${preset}"]`)
      .first().evaluate((button) => button.click());
    await page.waitForFunction((expected) => {
      const showroom = document.querySelector("[data-showroom]");
      return showroom?.getAttribute("data-showroom-preset") === expected
        && Boolean(showroom?.getAttribute("data-showroom-minimum-room-size"));
    }, preset, { timeout: 12_000 });
    await page.waitForTimeout(80);

    states.push(await page.evaluate(() => {
      const showroom = document.querySelector("[data-showroom]");
      const order = ["xs", "small", "compact", "standard"];
      const selected = showroom?.getAttribute("data-showroom-room-size");
      const minimum = showroom?.getAttribute("data-showroom-minimum-room-size");
      const minimumRank = order.indexOf(minimum);
      const roomButtons = Array.from(
        document.querySelectorAll('[data-showroom-setting="roomSize"][data-value]'),
      );
      return {
        preset: showroom?.getAttribute("data-showroom-preset"),
        selected,
        minimum,
        mode: showroom?.getAttribute("data-showroom-room-size-mode"),
        fits: showroom?.getAttribute("data-showroom-start-view-fits"),
        povView: showroom?.getAttribute("data-showroom-pov-view"),
        requiredZones: Number(showroom?.getAttribute("data-showroom-content-required-zones")),
        measuredObjects: Number(showroom?.getAttribute("data-showroom-measured-object-count")),
        maxAbsX: Number(showroom?.getAttribute("data-showroom-content-max-abs-x")),
        maxZ: Number(showroom?.getAttribute("data-showroom-content-max-z")),
        lowerSizesDisabled: roomButtons.every((button) => {
          const rank = order.indexOf(button.getAttribute("data-value"));
          return rank >= minimumRank || button.disabled;
        }),
      };
    }));
  }

  const valid = errors.length === 0
    && presets.length === 36
    && states.every((state) => (
      state.selected === state.minimum
      && state.mode === "auto"
      && state.fits === "true"
      && state.povView === "total"
      && state.requiredZones >= 1
      && state.measuredObjects > 0
      && Number.isFinite(state.maxAbsX)
      && Number.isFinite(state.maxZ)
      && state.lowerSizesDisabled
    ));
  const distribution = Object.fromEntries(["xs", "small", "compact", "standard"].map(
    (size) => [size, states.filter((state) => state.minimum === size).length],
  ));
  console.log(JSON.stringify({ valid, errors, distribution, states }, null, 2));
  if (!valid) process.exitCode = 1;
} finally {
  await browser.close();
}

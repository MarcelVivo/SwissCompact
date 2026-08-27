import { chromium } from "playwright-core";

const executablePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const baseURL = process.env.SWISSCOMPACT_BASE_URL ?? "http://127.0.0.1:4174/";
const browser = await chromium.launch({ executablePath, headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = [];
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});
page.on("pageerror", (error) => errors.push(error.message));

const presets = ["stationTerminal", "trafficControl", "mobilityHub"];
const expectations = {
  stationTerminal: {
    roomSize: "compact",
    floor: "stone",
    minimumFurnishings: 5,
    minimumDisplays: 8,
    selection: "furnishing:station-terminal-benches",
    label: "Bahnhof & Terminal",
  },
  trafficControl: {
    roomSize: "small",
    floor: "plain",
    minimumFurnishings: 5,
    minimumDisplays: 4,
    selection: "furnishing:traffic-control-desks",
    label: "Verkehrsleitzentrale",
  },
  mobilityHub: {
    roomSize: "compact",
    floor: "stone",
    minimumFurnishings: 5,
    minimumDisplays: 7,
    selection: "furnishing:mobility-hub-chargers",
    label: "Parkhaus & Mobilitätshub",
  },
};

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
  await page.locator("[data-showroom-themes-toggle]").first().click();
  await page.locator('[data-showroom-theme-option="mobility"]').click();
  await page.waitForFunction(() => (
    document.querySelector("[data-showroom]")?.getAttribute("data-showroom-theme") === "mobility"
  ), undefined, { timeout: 10_000 });

  const states = [];
  for (const preset of presets) {
    await page.locator(
      `[data-showroom-setting="preset"][data-value="${preset}"]`,
    ).first().evaluate((button) => button.click());
    await page.waitForFunction((expected) => {
      const showroom = document.querySelector("[data-showroom]");
      return showroom?.getAttribute("data-showroom-preset") === expected
        && showroom?.getAttribute("data-showroom-architecture") === expected
        && showroom?.getAttribute("data-showroom-artwork-ready") === "true";
    }, preset, { timeout: 10_000 });
    await page.waitForTimeout(650);
    await page.screenshot({
      path: `/tmp/swisscompact-mobility-${preset}.png`,
      fullPage: false,
    });
    await page.locator('[data-showroom-focus-tool="layers"]').evaluate(
      (button) => button.click(),
    );
    if (!await page.locator("[data-showroom-selection-menu]").evaluate(
      (panel) => panel.classList.contains("is-open"),
    )) {
      await page.locator('[data-showroom-focus-tool="layers"]').evaluate(
        (button) => button.click(),
      );
    }
    await page.waitForFunction(() => (
      document.querySelector("[data-showroom-selection-menu]")?.classList.contains("is-open")
    ), undefined, { timeout: 10_000 });
    states.push(await page.evaluate(({ expected, expectedPresets }) => {
      const showroom = document.querySelector("[data-showroom]");
      const visiblePresets = Array.from(new Set(Array.from(
        showroom?.querySelectorAll("[data-showroom-preset-theme]:not([hidden])") ?? [],
        (button) => button.getAttribute("data-value"),
      )));
      return {
        preset: showroom?.getAttribute("data-showroom-preset"),
        architecture: showroom?.getAttribute("data-showroom-architecture"),
        theme: showroom?.getAttribute("data-showroom-theme"),
        roomSize: showroom?.getAttribute("data-showroom-room-size"),
        floor: showroom?.getAttribute("data-showroom-floor-finish"),
        furnishingCount: Number(showroom?.getAttribute("data-showroom-furnishing-count")),
        openingCount: Number(showroom?.getAttribute("data-showroom-opening-count")),
        openingDisplayCollisions: Number(showroom?.getAttribute("data-showroom-opening-display-collisions")),
        displayRowOverlaps: Number(showroom?.getAttribute("data-showroom-display-row-overlaps")),
        totalDisplays: Number(showroom?.getAttribute("data-showroom-total-displays")),
        animatedDisplays: Number(showroom?.getAttribute("data-showroom-animated-displays")),
        selectionKeyPresent: Boolean(showroom?.querySelector(
          `[data-showroom-selection-item="${expected.selection}"]`,
        )),
        title: showroom?.querySelector("[data-showroom-room-label]")?.textContent?.trim(),
        visiblePresets,
        expectedPresets,
      };
    }, { expected: expectations[preset], expectedPresets: presets }));
    await page.keyboard.press("Escape");
  }

  const responsive = [];
  for (const viewport of [
    { name: "tablet", width: 820, height: 1180 },
    { name: "mobile", width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await page.waitForTimeout(280);
    responsive.push(await page.evaluate((name) => {
      const showroom = document.querySelector("[data-showroom]");
      return {
        name,
        theme: showroom?.getAttribute("data-showroom-theme"),
        overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
        visibleRoomTypes: Array.from(new Set(Array.from(
          showroom?.querySelectorAll("[data-showroom-preset-theme]:not([hidden])") ?? [],
          (button) => button.textContent?.trim(),
        ))),
      };
    }, viewport.name));
  }

  const valid = errors.length === 0
    && states.map((state) => state.preset).join(",") === presets.join(",")
    && states.every((state) => {
      const expected = expectations[state.preset];
      return state.architecture === state.preset
        && state.theme === "mobility"
        && state.roomSize === expected.roomSize
        && state.floor === expected.floor
        && state.furnishingCount >= expected.minimumFurnishings
        && state.openingCount === 2
        && state.openingDisplayCollisions === 0
        && state.displayRowOverlaps === 0
        && state.totalDisplays >= expected.minimumDisplays
        && state.animatedDisplays > 0
        && state.selectionKeyPresent
        && state.title?.startsWith(expected.label)
        && state.visiblePresets.join(",") === presets.join(",");
    })
    && responsive.every((state) => (
      state.theme === "mobility" && !state.overflow && state.visibleRoomTypes.length === 3
    ));

  console.log(JSON.stringify({ valid, states, responsive, errors }, null, 2));
  if (!valid) process.exitCode = 1;
} finally {
  await browser.close();
}

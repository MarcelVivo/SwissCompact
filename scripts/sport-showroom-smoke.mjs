import { chromium } from "playwright-core";

const executablePath =
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const baseURL =
  process.env.SWISSCOMPACT_BASE_URL ?? "http://127.0.0.1:5173/";
const browser = await chromium.launch({ executablePath, headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = [];

page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});
page.on("pageerror", (error) => errors.push(error.message));

const presets = ["outdoorShop", "mountainStation", "fitnessCenter"];
const expectedFurnishings = {
  outdoorShop: 7,
  mountainStation: 7,
  fitnessCenter: 10,
};
const expectedSelectionKeys = {
  outdoorShop: "furnishing:outdoor-boot-island",
  mountainStation: "furnishing:mountain-turnstile-1",
  fitnessCenter: "furnishing:fitness-treadmill-1",
};

try {
  await page.goto(baseURL, {
    waitUntil: "domcontentloaded",
    timeout: 30_000,
  });
  await page.locator("[data-marketing-target=\"#wirkung\"]").first().click();
  await page.waitForFunction(() => (
    document.body.classList.contains("is-marketing-view")
  ), undefined, { timeout: 10_000 });
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

  await page.locator("[data-showroom-themes-toggle]").first().click();
  await page.locator('[data-showroom-theme-option="sport"]').click();
  await page.waitForFunction(() => (
    document.querySelector("[data-showroom]")?.getAttribute(
      "data-showroom-theme",
    ) === "sport"
  ));

  const states = [];
  for (const preset of presets) {
    await page.locator(
      `[data-showroom-setting="preset"][data-value="${preset}"]`,
    ).first().evaluate((button) => button.click());
    await page.waitForFunction((expected) => {
      const showroom = document.querySelector("[data-showroom]");
      return showroom?.getAttribute("data-showroom-preset") === expected
        && showroom?.getAttribute("data-showroom-architecture") === expected;
    }, preset);
    await page.waitForTimeout(900);
    await page.screenshot({
      path: `/tmp/swisscompact-sport-${preset}.png`,
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
      document.querySelector("[data-showroom-selection-menu]")
        ?.classList.contains("is-open")
    ));
    states.push(await page.evaluate((expectedKey) => {
      const showroom = document.querySelector("[data-showroom]");
      const visiblePresets = Array.from(new Set(Array.from(
        showroom?.querySelectorAll(
          "[data-showroom-preset-theme]:not([hidden])",
        ) ?? [],
        (button) => button.getAttribute("data-value"),
      )));
      return {
        preset: showroom?.getAttribute("data-showroom-preset"),
        architecture: showroom?.getAttribute("data-showroom-architecture"),
        theme: showroom?.getAttribute("data-showroom-theme"),
        contrast: showroom?.getAttribute("data-showroom-lighting-contrast"),
        furnishingCount: Number(showroom?.getAttribute(
          "data-showroom-furnishing-count",
        )),
        animatedDisplays: Number(showroom?.getAttribute(
          "data-showroom-animated-displays",
        )),
        selectionKeyPresent: Boolean(showroom?.querySelector(
          `[data-showroom-selection-item="${expectedKey}"]`,
        )),
        displayMountPresent: Boolean(showroom?.querySelector(
          '[data-showroom-selection-item="mount:menu"]',
        )),
        visiblePresets,
      };
    }, expectedSelectionKeys[preset]));
    await page.keyboard.press("Escape");
  }

  await page.locator(
    '[data-showroom-setting="preset"][data-value="mountainStation"]',
  ).first().evaluate((button) => button.click());
  await page.locator('[data-showroom-opening-wall="back"]').first()
    .evaluate((button) => button.click());
  await page.locator('[data-showroom-opening-add="window"]').first()
    .evaluate((button) => button.click());
  const mountainOpeningCount = Number(await page.locator(
    "[data-showroom]",
  ).getAttribute("data-showroom-opening-count"));
  await page.locator(
    '[data-showroom-setting="preset"][data-value="fitnessCenter"]',
  ).first().evaluate((button) => button.click());
  await page.waitForTimeout(180);
  const fitnessOpeningCount = Number(await page.locator(
    "[data-showroom]",
  ).getAttribute("data-showroom-opening-count"));

  const responsive = [];
  for (const viewport of [
    { name: "tablet", width: 820, height: 1180 },
    { name: "mobile", width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await page.waitForTimeout(260);
    responsive.push(await page.evaluate((name) => {
      const showroom = document.querySelector("[data-showroom]");
      return {
        name,
        theme: showroom?.getAttribute("data-showroom-theme"),
        overflow:
          document.documentElement.scrollWidth
            > document.documentElement.clientWidth + 1,
        visibleRoomTypes: Array.from(new Set(Array.from(
          showroom?.querySelectorAll(
            "[data-showroom-preset-theme]:not([hidden])",
          ) ?? [],
          (button) => button.textContent?.trim(),
        ))),
      };
    }, viewport.name));
  }

  const valid =
    errors.length === 0
    && states.map((state) => state.preset).join(",") === presets.join(",")
    && states.every((state) => (
      state.architecture === state.preset
      && state.theme === "sport"
      && state.contrast === "high"
      && state.furnishingCount >= expectedFurnishings[state.preset]
      && state.animatedDisplays > 0
      && state.selectionKeyPresent
      && state.displayMountPresent
      && state.visiblePresets.join(",") === presets.join(",")
    ))
    && mountainOpeningCount === 3
    && fitnessOpeningCount === 3
    && responsive.every((state) => (
      state.theme === "sport"
      && !state.overflow
      && state.visibleRoomTypes.length === 3
    ));

  console.log(JSON.stringify({
    valid,
    states,
    mountainOpeningCount,
    fitnessOpeningCount,
    responsive,
    errors,
  }, null, 2));
  if (!valid) process.exitCode = 1;
} finally {
  await browser.close();
}

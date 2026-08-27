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
  await page.locator("[data-showroom-theme-option=\"culture\"]").click();
  await page.waitForFunction(() => (
    document.querySelector("[data-showroom]")?.getAttribute(
      "data-showroom-theme",
    ) === "culture"
  ));

  const presets = ["cinema", "museum", "eventHall"];
  const states = [];
  for (const preset of presets) {
    await page.locator(
      `[data-showroom-setting="preset"][data-value="${preset}"]`,
    ).first().evaluate((button) => button.click());
    await page.waitForFunction((expectedPreset) => {
      const showroom = document.querySelector("[data-showroom]");
      return showroom?.getAttribute("data-showroom-preset") === expectedPreset
        && showroom?.getAttribute("data-showroom-architecture")
          === expectedPreset;
    }, preset);
    await page.evaluate(() => {
      document.querySelector("[data-showroom]")?.scrollIntoView({
        block: "start",
        behavior: "instant",
      });
    });
    await page.waitForTimeout(1250);
    await page.screenshot({
      path: `/tmp/swisscompact-culture-${preset}.png`,
      fullPage: false,
    });
    states.push(await page.evaluate(() => {
      const showroom = document.querySelector("[data-showroom]");
      const visiblePresetButtons = Array.from(
        showroom?.querySelectorAll(
          "[data-showroom-preset-theme]:not([hidden])",
        ) ?? [],
      ).map((button) => button.getAttribute("data-value"));
      return {
        preset: showroom?.getAttribute("data-showroom-preset"),
        architecture: showroom?.getAttribute("data-showroom-architecture"),
        theme: showroom?.getAttribute("data-showroom-theme"),
        lightingContrast:
          showroom?.getAttribute("data-showroom-lighting-contrast"),
        furnishings: Number(
          showroom?.getAttribute("data-showroom-furnishing-count"),
        ),
        animatedDisplays: Number(
          showroom?.getAttribute("data-showroom-animated-displays"),
        ),
        openingControls: showroom?.querySelectorAll(
          "[data-showroom-opening-add]",
        ).length,
        structureControls: showroom?.querySelectorAll(
          "[data-showroom-totem-setup]",
        ).length,
        visiblePresetButtons: [...new Set(visiblePresetButtons)],
      };
    }));
  }

  const openingMenu = page.locator("[data-showroom-focus-browser]");
  const addOpening = async (wall, type) => {
    await page.locator('[data-showroom-focus-tool="opening"]').evaluate(
      (button) => button.click(),
    );
    await page.waitForTimeout(100);
    const open = await openingMenu.evaluate(
      (panel) => panel.classList.contains("is-open"),
    );
    if (!open) {
      await page.locator('[data-showroom-focus-tool="opening"]').evaluate(
        (button) => button.click(),
      );
      await page.waitForTimeout(100);
    }
    await openingMenu.locator(
      `[data-showroom-opening-wall="${wall}"]`,
    ).evaluate((button) => button.click());
    await openingMenu.locator(
      `[data-showroom-opening-add="${type}"]`,
    ).evaluate((button) => button.click());
    await page.waitForTimeout(160);
  };
  await addOpening("back", "window");
  await addOpening("left", "singleDoor");
  await addOpening("right", "doubleDoor");
  const eventHallOpeningCount = Number(await page.locator(
    "[data-showroom]",
  ).getAttribute("data-showroom-opening-count"));
  await page.locator(
    "[data-showroom-setting=\"preset\"][data-value=\"museum\"]",
  ).first().evaluate((button) => button.click());
  await page.waitForTimeout(220);
  const museumOpeningCount = Number(await page.locator(
    "[data-showroom]",
  ).getAttribute("data-showroom-opening-count"));

  const responsive = [];
  for (const viewport of [
    { name: "tablet", width: 820, height: 1180 },
    { name: "mobile", width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await page.waitForTimeout(320);
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

  const expectedFurnishings = {
    cinema: 6,
    museum: 6,
    eventHall: 5,
  };
  const valid =
    errors.length === 0
    && states.map((state) => state.preset).join(",")
      === presets.join(",")
    && states.every((state) => (
      state.architecture === state.preset
      && state.theme === "culture"
      && state.lightingContrast === "high"
      && state.furnishings >= expectedFurnishings[state.preset]
      && state.animatedDisplays > 0
      && state.openingControls >= 3
      && state.structureControls >= 6
      && state.visiblePresetButtons.join(",") === presets.join(",")
    ))
    && eventHallOpeningCount === 6
    && museumOpeningCount === 3
    && responsive.every((state) => (
      state.theme === "culture"
      && !state.overflow
      && state.visibleRoomTypes.length === 3
    ));
  console.log(JSON.stringify({
    valid,
    states,
    eventHallOpeningCount,
    museumOpeningCount,
    responsive,
    errors,
  }, null, 2));
  if (!valid) process.exitCode = 1;
} finally {
  await browser.close();
}

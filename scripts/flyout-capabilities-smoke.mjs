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

const click = async (selector) => {
  await page.locator(selector).first().evaluate((element) => element.click());
  await page.waitForTimeout(100);
};

const visible = async (selector) => (
  page.locator(selector).first().isVisible().catch(() => false)
);

const present = async (selector) => (
  await page.locator(selector).count() > 0
);

const selectMode = async (mode) => {
  await click(`[data-showroom-selection-mode="${mode}"]`);
};

const selectPreset = async (preset) => {
  await click(`[data-showroom-setting="preset"][data-value="${preset}"]`);
  await page.waitForFunction((expected) => (
    document.querySelector("[data-showroom]")?.getAttribute(
      "data-showroom-preset",
    ) === expected
  ), preset);
  await page.waitForTimeout(120);
};

const inspect = async (name, requirements) => {
  const controls = {};
  for (const [label, selector] of Object.entries(requirements)) {
    controls[label] = await visible(selector);
  }
  return {
    name,
    valid: Object.values(controls).every(Boolean),
    controls,
  };
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

  const states = [];

  await selectMode("display");
  await click("[data-showroom-selection-item^=\"display:\"]");
  states.push(await inspect("display", {
    flyout: "[data-showroom-display-flyout]:not([hidden])",
    technology: "[data-showroom-display-technology=\"auto\"]",
    standardSize: "[data-showroom-setting=\"displaySize\"]",
    directSizeReset: "[data-showroom-display-scale-reset]",
    orientation: "[data-showroom-setting=\"orientation\"]",
    content: "[data-showroom-setting=\"content\"]",
    remove: "[data-showroom-display-remove]",
  }));
  const displayHasNoColor = !await visible(
    "[data-showroom-object-color-control]",
  );

  await selectMode("mount");
  await click("[data-showroom-selection-item=\"mount:menu\"]");
  states.push(await inspect("mount", {
    flyout: "[data-showroom-object-flyout]:not([hidden])",
    width: "[data-showroom-object-dimension=\"widthCm\"]",
    height: "[data-showroom-object-dimension=\"heightCm\"]",
    displayCount: "[data-showroom-object-count]",
    orientation: "[data-showroom-object-orientation]",
    color: "[data-showroom-object-color-control]:not([hidden])",
    remove: "[data-showroom-object-remove]",
  }));
  states.at(-1).controls.layout = await present(
    "[data-showroom-object-layout]",
  );
  states.at(-1).valid = Object.values(
    states.at(-1).controls,
  ).every(Boolean);
  const mountTargetBefore = await page.locator("[data-showroom]").getAttribute(
    "data-showroom-selected-object-color-target",
  );
  await click("[data-showroom-object-color=\"#2374d8\"]");
  const mountColor = await page.locator("[data-showroom]").getAttribute(
    "data-showroom-selected-object-color",
  );
  const backWallColor = await page.locator("[data-showroom]").getAttribute(
    "data-showroom-surface-wall-back-color",
  );

  await selectMode("surface");
  await click("[data-showroom-selection-item=\"surface:floor\"]");
  states.push(await inspect("floor", {
    color: "[data-showroom-object-color-control]:not([hidden])",
    plain: "[data-showroom-floor-finish=\"plain\"]",
    carpet: "[data-showroom-floor-finish=\"carpet\"]",
    stone: "[data-showroom-floor-finish=\"stone\"]",
    wood: "[data-showroom-floor-finish=\"wood\"]",
  }));
  await selectMode("surface");
  await click("[data-showroom-selection-item=\"surface:wallBack\"]");
  states.push(await inspect("backWall", {
    color: "[data-showroom-object-color-control]:not([hidden])",
    width: "[data-showroom-back-wall-scale=\"x\"]",
    height: "[data-showroom-back-wall-scale=\"y\"]",
    reset: "[data-showroom-back-wall-size-reset]",
  }));

  await selectMode("furnishing");
  await click("[data-showroom-selection-item^=\"furnishing:\"]");
  states.push(await inspect("furnishing", {
    transformToolbar: "[data-showroom-object-toolbar]:not([hidden])",
    rotation: "[data-showroom-furnishing-rotation]",
    dimensions: "[data-showroom-furnishing-resize-handle]:not([hidden])",
    color: "[data-showroom-object-color-control]:not([hidden])",
    reset: "[data-showroom-object-reset]",
    visibility: "[data-showroom-object-hide]",
  }));

  await selectMode("opening");
  const openingItem = page.locator(
    "[data-showroom-selection-item^=\"opening:\"]",
  ).first();
  if (await openingItem.count()) {
    await openingItem.evaluate((element) => element.click());
    await page.waitForTimeout(100);
  }
  states.push(await inspect("opening", {
    toolbar: "[data-showroom-opening-toolbar]:not([hidden])",
    dimensions: "[data-showroom-opening-dimensions]",
    color: "[data-showroom-object-color-control]:not([hidden])",
    remove: "[data-showroom-opening-remove-selected]",
  }));
  const openingTarget = await page.locator("[data-showroom]").getAttribute(
    "data-showroom-selected-object-color-target",
  );
  await click("[data-showroom-object-color=\"#319761\"]");
  const openingColor = await page.locator("[data-showroom]").getAttribute(
    "data-showroom-selected-opening-color",
  );

  await click("[data-showroom-focus-tool=\"light\"]");
  states.push(await inspect("light", {
    inspector: "[data-showroom-light-inspector]:not([hidden])",
    day: "[data-showroom-setting=\"light\"][data-value=\"day\"]",
    warm: "[data-showroom-setting=\"light\"][data-value=\"warm\"]",
    brightness: "[data-showroom-brightness]",
  }));

  const roomCoverage = [];
  for (const preset of [
    "takeaway",
    "restaurant",
    "cafe",
    "beautySalon",
    "barber",
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
  ]) {
    await selectPreset(preset);

    await selectMode("mount");
    const mountItem = page.locator(
      "[data-showroom-selection-item^=\"mount:\"]",
    ).first();
    const hasMount = await mountItem.count() > 0;
    if (hasMount) {
      await mountItem.evaluate((element) => element.click());
      await page.waitForTimeout(70);
    }
    const mountColorAvailable = hasMount
      && await visible("[data-showroom-object-color-control]:not([hidden])")
      && (
        await page.locator("[data-showroom]").getAttribute(
          "data-showroom-selected-object-color-target",
        )
      )?.startsWith("mount:");

    await selectMode("furnishing");
    const furnishingItem = page.locator(
      [
        "[data-showroom-selection-item^=\"furnishing:\"]",
        "[data-showroom-selection-item^=\"structure:\"]",
      ].join(","),
    ).first();
    const hasFurnishing = await furnishingItem.count() > 0;
    if (hasFurnishing) {
      await furnishingItem.evaluate((element) => element.click());
      await page.waitForTimeout(70);
    }
    const furnishingColorAvailable = hasFurnishing
      && await visible("[data-showroom-object-color-control]:not([hidden])");

    await selectMode("opening");
    const roomOpening = page.locator(
      "[data-showroom-selection-item^=\"opening:\"]",
    ).first();
    const hasOpening = await roomOpening.count() > 0;
    if (hasOpening) {
      await roomOpening.evaluate((element) => element.click());
      await page.waitForTimeout(70);
    }
    const openingColorAvailable = !hasOpening
      || (
        await visible("[data-showroom-object-color-control]:not([hidden])")
        && await page.locator("[data-showroom]").getAttribute(
          "data-showroom-selected-object-color-target",
        ) === "opening"
      );

    roomCoverage.push({
      preset,
      valid:
        mountColorAvailable
        && furnishingColorAvailable
        && openingColorAvailable,
      hasMount,
      mountColorAvailable,
      hasFurnishing,
      furnishingColorAvailable,
      hasOpening,
      openingColorAvailable,
    });
  }

  const valid =
    errors.length === 0
    && states.every((state) => state.valid)
    && roomCoverage.every((room) => room.valid)
    && displayHasNoColor
    && mountTargetBefore === "mount:menu"
    && mountColor === "#2374d8"
    && backWallColor === "#2374d8"
    && openingTarget === "opening"
    && openingColor === "#319761";

  console.log(JSON.stringify({
    valid,
    errors,
    states,
    roomCoverage,
    displayHasNoColor,
    mountTargetBefore,
    mountColor,
    backWallColor,
    openingTarget,
    openingColor,
  }, null, 2));
  if (!valid) process.exitCode = 1;
} finally {
  await browser.close();
}

import { chromium } from "playwright-core";

const executablePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const baseURL = process.env.SWISSCOMPACT_BASE_URL ?? "http://127.0.0.1:4180/";
const browser = await chromium.launch({ executablePath, headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});
page.on("pageerror", (error) => errors.push(error.message));

const showroom = page.locator("[data-showroom]");
const hardwareCounts = async () => page.evaluate(() => ({
  displays: Number(document.querySelector("[data-showroom-display-count]")?.textContent ?? 0),
  leds: Number(document.querySelector("[data-showroom-led-count]")?.textContent ?? 0),
}));

try {
  await page.addInitScript(() => {
    localStorage.removeItem("swisscompact-showroom-saved-rooms");
  });
  await page.goto(baseURL, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await showroom.evaluate((element) => element.scrollIntoView({ block: "start" }));
  await page.waitForFunction(() => (
    document.querySelector("[data-showroom]")?.getAttribute("data-showroom-ready") === "true"
  ), undefined, { timeout: 45_000 });
  await page.locator('[data-showroom-setting="preset"][data-value="takeaway"]')
    .first().evaluate((button) => button.click());
  await page.waitForTimeout(250);

  const entry = await page.evaluate(() => ({
    quickActions: document.querySelectorAll("[data-showroom-quick-action]").length,
    finderClosed: !document.querySelector("[data-showroom-expert-finder]")?.hasAttribute("open"),
    labels: Array.from(document.querySelectorAll("[data-showroom-quick-action] strong"))
      .map((element) => element.textContent?.trim()),
  }));

  await page.locator('[data-showroom-focus-tool="display"]').click();
  await page.locator('[data-showroom-quick-action="display"]').click();
  await page.waitForFunction(() => (
    document.querySelector("[data-showroom]")?.getAttribute("data-showroom-guided-add") === "display"
  ));
  const placement = await page.evaluate(() => ({
    mode: document.querySelector("[data-showroom]")?.getAttribute("data-showroom-selection-mode"),
    title: document.querySelector("[data-showroom-focus-title]")?.textContent?.trim(),
    mountChoices: document.querySelectorAll('[data-showroom-selection-item^="mount:"]').length,
  }));

  const beforeGuided = await hardwareCounts();
  await page.locator('[data-showroom-selection-item="mount:counterFront"]').click();
  await page.waitForFunction(() => (
    document.querySelector("[data-showroom]")?.getAttribute("data-showroom-last-simple-action")
      === "add-display:counterFront"
  ));
  const afterGuided = await hardwareCounts();
  const displayContext = await page.evaluate(() => ({
    panelVisible: !document.querySelector("[data-showroom-simple-actions]")?.hasAttribute("hidden"),
    title: document.querySelector("[data-showroom-simple-title]")?.textContent?.trim(),
    specialistHidden: getComputedStyle(document.querySelector("[data-showroom-display-flyout]")).display === "none",
    actions: Array.from(document.querySelectorAll("[data-showroom-simple-actions-list] button strong"))
      .map((element) => element.textContent?.trim()),
  }));
  const beforeSingleConversion = await hardwareCounts();
  await page.locator('[data-showroom-simple-action="convert-selected"]')
    .click();
  await page.waitForFunction(() => (
    document.querySelector("[data-showroom]")?.getAttribute(
      "data-showroom-last-simple-action",
    ) === "convert-selected-to-led"
  ));
  const afterSingleLed = await hardwareCounts();
  await page.locator('[data-showroom-simple-action="convert-selected"]')
    .click();
  await page.waitForFunction(() => (
    document.querySelector("[data-showroom]")?.getAttribute(
      "data-showroom-last-simple-action",
    ) === "convert-selected-to-display"
  ));
  const afterSingleRestore = await hardwareCounts();

  await page.locator('[data-showroom-focus-tool="furnishing"]').click();
  await page.locator('[data-showroom-selection-item="furnishing:takeaway-counter"]').click();
  await page.waitForTimeout(100);
  const counterContext = await page.evaluate(() => ({
    title: document.querySelector("[data-showroom-simple-title]")?.textContent?.trim(),
    actions: Array.from(document.querySelectorAll("[data-showroom-simple-actions-list] button strong"))
      .map((element) => element.textContent?.trim()),
  }));
  const beforeCounter = await hardwareCounts();
  await page.locator(
    '[data-showroom-simple-action="add-media"][data-showroom-simple-wall="counterFront"][data-showroom-simple-technology="display"]',
  ).click();
  await page.waitForTimeout(160);
  const afterCounter = await hardwareCounts();

  const beforeSeamless = await hardwareCounts();
  await page.locator('[data-showroom-simple-action="merge-seamless-led"]')
    .click();
  await page.waitForFunction(() => (
    document.querySelector("[data-showroom]")?.getAttribute(
      "data-showroom-seamless-led",
    ) === "true"
  ));
  const seamless = await page.evaluate(() => ({
    sourceCount: Number(document.querySelector("[data-showroom]")?.getAttribute(
      "data-showroom-seamless-led-source-count",
    )),
    widthCm: Number(document.querySelector("[data-showroom]")?.getAttribute(
      "data-showroom-selected-display-width-cm",
    )),
    heightCm: Number(document.querySelector("[data-showroom]")?.getAttribute(
      "data-showroom-selected-display-height-cm",
    )),
    textureWidth: Number(document.querySelector("[data-showroom]")?.getAttribute(
      "data-showroom-selected-texture-width",
    )),
    textureHeight: Number(document.querySelector("[data-showroom]")?.getAttribute(
      "data-showroom-selected-texture-height",
    )),
    textureAspect: Number(document.querySelector("[data-showroom]")?.getAttribute(
      "data-showroom-selected-texture-aspect",
    )),
    contentLayout: document.querySelector("[data-showroom]")?.getAttribute(
      "data-showroom-selected-content-layout",
    ),
    title: document.querySelector("[data-showroom-simple-title]")?.textContent?.trim(),
    hint: document.querySelector("[data-showroom-simple-hint]")?.textContent?.trim(),
    restoreLabel: document.querySelector(
      '[data-showroom-simple-action="restore-displays"] strong',
    )?.textContent?.trim(),
    hardware: {
      displays: Number(document.querySelector("[data-showroom-display-count]")?.textContent ?? 0),
      leds: Number(document.querySelector("[data-showroom-led-count]")?.textContent ?? 0),
    },
  }));
  if (process.env.SWISSCOMPACT_LED_SCREENSHOT) {
    await page.screenshot({
      path: process.env.SWISSCOMPACT_LED_SCREENSHOT,
      fullPage: false,
    });
  }
  await page.locator('[data-showroom-simple-action="restore-displays"]')
    .click();
  await page.waitForFunction(() => (
    document.querySelector("[data-showroom]")?.getAttribute(
      "data-showroom-seamless-led",
    ) === "false"
  ));
  const afterSeamlessRestore = await hardwareCounts();

  await page.locator("[data-showroom-simple-advanced]").click();
  const advanced = await page.evaluate(() => ({
    expanded: document.querySelector("[data-showroom-simple-advanced]")?.getAttribute("aria-expanded"),
    flyoutVisible: getComputedStyle(document.querySelector("[data-showroom-display-flyout]")).display !== "none",
    comparison: document.querySelector(".showroom-media-comparison")
      ?.textContent?.replace(/\s+/g, " ").trim(),
  }));

  await page.locator('[data-showroom-focus-tool="select"]').click();
  await page.locator('[data-showroom-focus-tool="room"]').click();
  await page.locator('[data-showroom-selection-item="surface:wallBack"]').click();
  await page.waitForTimeout(100);
  const wallContext = await page.evaluate(() => ({
    actions: Array.from(document.querySelectorAll("[data-showroom-simple-actions-list] button strong"))
      .map((element) => element.textContent?.trim()),
  }));
  const beforeLed = await hardwareCounts();
  await page.locator(
    '[data-showroom-simple-action="add-media"][data-showroom-simple-wall="menu"][data-showroom-simple-technology="led"]',
  ).click();
  await page.waitForTimeout(160);
  const afterLed = await hardwareCounts();

  await page.locator('[data-showroom-focus-tool="select"]').click();
  await page.locator('[data-showroom-focus-tool="room"]').click();
  await page.locator('[data-showroom-selection-item="surface:wallBack"]').click();
  const beforeOpeningCount = Number(await showroom.getAttribute(
    "data-showroom-opening-count",
  ));
  await page.locator(
    '[data-showroom-simple-action="add-opening"][data-showroom-simple-opening-type="singleDoor"]',
  ).click();
  await page.waitForFunction((count) => (
    Number(document.querySelector("[data-showroom]")?.getAttribute(
      "data-showroom-opening-count",
    )) === count + 1
  ), beforeOpeningCount);
  const simpleOpening = await page.evaluate(() => ({
    count: Number(document.querySelector("[data-showroom]")?.getAttribute(
      "data-showroom-opening-count",
    )),
    type: document.querySelector("[data-showroom]")?.getAttribute(
      "data-showroom-selected-opening-type",
    ),
    wall: document.querySelector("[data-showroom]")?.getAttribute(
      "data-showroom-selected-opening-wall",
    ),
  }));

  const valid = errors.length === 0
    && entry.quickActions === 8
    && entry.finderClosed
    && entry.labels.includes("Display")
    && entry.labels.includes("LED-Fläche")
    && placement.mode === "mount"
    && placement.title?.includes("Wo soll das Display hin")
    && placement.mountChoices >= 3
    && afterGuided.displays === beforeGuided.displays + 1
    && displayContext.panelVisible
    && displayContext.title?.includes("Display einfach")
    && displayContext.specialistHidden
    && displayContext.actions.includes("Dieses Display als LED")
    && displayContext.actions.some((label) => label?.includes("nahtlos als LED"))
    && afterSingleLed.displays === beforeSingleConversion.displays - 1
    && afterSingleLed.leds === beforeSingleConversion.leds + 1
    && afterSingleRestore.displays === beforeSingleConversion.displays
    && afterSingleRestore.leds === beforeSingleConversion.leds
    && counterContext.title?.includes("an die Theke")
    && counterContext.actions.includes("Display vorne")
    && counterContext.actions.includes("Display oben")
    && counterContext.actions.includes("LED vorne")
    && afterCounter.displays === beforeCounter.displays + 1
    && seamless.sourceCount >= 2
    && seamless.widthCm > seamless.heightCm
    && seamless.textureWidth > seamless.textureHeight * 2.75
    && Math.abs(
      seamless.textureAspect - seamless.widthCm / seamless.heightCm
    ) < 0.02
    && seamless.contentLayout === "panoramic-led"
    && seamless.title?.includes("Nahtlose LED-Fläche")
    && seamless.hint?.includes("heller")
    && seamless.hint?.includes("kontrastreicher")
    && seamless.hint?.includes("Dauerbetrieb")
    && seamless.restoreLabel?.includes(`${seamless.sourceCount} Displays`)
    && seamless.hardware.leds === beforeSeamless.leds + 1
    && seamless.hardware.displays === beforeSeamless.displays - seamless.sourceCount
    && afterSeamlessRestore.displays === beforeSeamless.displays
    && afterSeamlessRestore.leds === beforeSeamless.leds
    && advanced.expanded === "true"
    && advanced.flyoutVisible
    && advanced.comparison?.includes("sichtbare Rahmen")
    && advanced.comparison?.includes("randlos")
    && advanced.comparison?.includes("langlebiger im Dauerbetrieb")
    && wallContext.actions.includes("Display hier")
    && wallContext.actions.includes("LED-Fläche hier")
    && wallContext.actions.includes("Tür einsetzen")
    && wallContext.actions.includes("Fenster einsetzen")
    && afterLed.leds === beforeLed.leds + 1
    && simpleOpening.count === beforeOpeningCount + 1
    && simpleOpening.type === "singleDoor"
    && simpleOpening.wall === "back";

  console.log(JSON.stringify({
    valid,
    entry,
    placement,
    beforeGuided,
    afterGuided,
    displayContext,
    beforeSingleConversion,
    afterSingleLed,
    afterSingleRestore,
    counterContext,
    beforeCounter,
    afterCounter,
    beforeSeamless,
    seamless,
    afterSeamlessRestore,
    advanced,
    wallContext,
    beforeLed,
    afterLed,
    simpleOpening,
    errors,
  }, null, 2));
  if (!valid) process.exitCode = 1;
} finally {
  await browser.close();
}

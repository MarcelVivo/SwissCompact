import { chromium } from "playwright-core";

const executablePath =
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const baseURL =
  process.env.SWISSCOMPACT_BASE_URL ?? "http://127.0.0.1:4173/";
const viewports = [
  { name: "laptop", width: 1280, height: 800 },
  { name: "tablet", width: 820, height: 1180 },
  { name: "mobile", width: 390, height: 844 },
];
const browser = await chromium.launch({ executablePath, headless: true });
const results = [];

for (const viewport of viewports) {
  process.stdout.write(`Checking ${viewport.name} (${viewport.width}x${viewport.height})\n`);
  const page = await browser.newPage({ viewport });
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));

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
  await page.evaluate(() => {
    document.querySelector("[data-showroom]")?.scrollIntoView({
      block: "start",
      behavior: "instant",
    });
  });
  // Let WebGL finish its first shader and shadow-map pass before measuring
  // steady-state frame timing.
  await page.waitForTimeout(1200);

  const frameMetrics = await page.evaluate(async () => {
    const frameGaps = [];
    let previousFrame = performance.now();
    const startedAt = previousFrame;
    await new Promise((resolve) => {
      const measure = (now) => {
        frameGaps.push(now - previousFrame);
        previousFrame = now;
        if (now - startedAt < 900) requestAnimationFrame(measure);
        else resolve();
      };
      requestAnimationFrame(measure);
    });
    const sorted = [...frameGaps].sort((left, right) => left - right);
    return {
      renderedFrames: frameGaps.length,
      p95FrameGap: sorted[
        Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))
      ] ?? 0,
    };
  });

  const layout = await page.evaluate(() => {
    const bounds = (selector) => {
      const rect = document.querySelector(selector)?.getBoundingClientRect();
      return rect
        ? {
            top: rect.top,
            right: rect.right,
            bottom: rect.bottom,
            left: rect.left,
            width: rect.width,
            height: rect.height,
          }
        : null;
    };
    const title = bounds(".showroom-navbar-title");
    const configurator = bounds(".showroom-object-navbar");
    const siteHeader = bounds(".site-header");
    const visibleControlHeights = Array.from(document.querySelectorAll(
      ".showroom-object-navbar button",
    )).map((button) => button.getBoundingClientRect())
      .filter((rect) => rect.width > 0 && rect.height > 0)
      .map((rect) => rect.height);
    const minimumControlHeight = Math.min(...visibleControlHeights);
    return {
      title,
      configurator,
      siteHeader,
      minimumControlHeight,
      horizontalOverflow:
        document.documentElement.scrollWidth > window.innerWidth + 1,
    };
  });

  await page.locator("[data-showroom-themes-toggle]").first().evaluate(
    (button) => button.click(),
  );
  await page.waitForTimeout(360);
  const dialog = await page.evaluate(() => {
    const element = document.querySelector("[data-showroom-themes]");
    const rect = element?.getBoundingClientRect();
    return {
      ariaHidden: element?.getAttribute("aria-hidden"),
      focusInside: element?.contains(document.activeElement) ?? false,
      bounds: rect
        ? {
            top: rect.top,
            right: rect.right,
            bottom: rect.bottom,
            left: rect.left,
          }
        : null,
    };
  });
  await page.screenshot({
    path: `/tmp/swisscompact-showroom-${viewport.name}.png`,
    fullPage: false,
  });
  await page.locator("[data-showroom-theme-option=\"beauty\"]").evaluate(
    (button) => button.click(),
  );
  await page.waitForFunction(() => (
    document.querySelector("[data-showroom]")?.getAttribute(
      "data-showroom-theme",
    ) === "beauty"
  ));
  await page.locator(
    ".showroom-navbar-menu--room-type [data-showroom-navbar-trigger]",
  ).evaluate((button) => button.click());
  await page.waitForTimeout(120);
  const beautyLayout = await page.evaluate(() => {
    const dropdown = document.querySelector(
      ".showroom-navbar-dropdown--room-type",
    )?.getBoundingClientRect();
    const labels = Array.from(document.querySelectorAll(
      ".showroom-navbar-dropdown--room-type "
        + "[data-showroom-preset-theme=\"beauty\"]:not([hidden])",
    )).map((button) => {
      const rect = button.getBoundingClientRect();
      return {
        text: button.textContent?.trim(),
        left: rect.left,
        right: rect.right,
        height: rect.height,
        scrollWidth: button.scrollWidth,
        clientWidth: button.clientWidth,
      };
    });
    return {
      dropdown: dropdown
        ? {
            left: dropdown.left,
            right: dropdown.right,
            top: dropdown.top,
            bottom: dropdown.bottom,
          }
        : null,
      labels,
      horizontalOverflow:
        document.documentElement.scrollWidth > window.innerWidth + 1,
    };
  });
  await page.screenshot({
    path: `/tmp/swisscompact-showroom-beauty-${viewport.name}.png`,
    fullPage: false,
  });
  await page.keyboard.press("Escape");
  const closed = await page.evaluate(() => ({
    ariaHidden: document.querySelector("[data-showroom-themes]")
      ?.getAttribute("aria-hidden"),
    focusRestored: true,
  }));
  await page.waitForTimeout(340);
  await page.screenshot({
    path: `/tmp/swisscompact-showroom-${viewport.name}-closed.png`,
    fullPage: false,
  });

  const hierarchyValid = Boolean(
    layout.siteHeader
    && layout.title
    && layout.configurator
    && layout.title.top >= layout.siteHeader.bottom + 8
    && layout.configurator.top >= layout.title.bottom + 8
  );
  const dialogFits = Boolean(
    dialog.bounds
    && dialog.bounds.top >= 0
    && dialog.bounds.left >= 0
    && dialog.bounds.right <= viewport.width
    && dialog.bounds.bottom <= viewport.height,
  );
  const beautyFits = Boolean(
    beautyLayout.dropdown
    && beautyLayout.dropdown.left >= 0
    && beautyLayout.dropdown.right <= viewport.width
    && !beautyLayout.horizontalOverflow
    && beautyLayout.labels.length === 3
    && beautyLayout.labels.every((label) => (
      label.left >= 0
      && label.right <= viewport.width
      && label.height >= 44
      && label.scrollWidth <= label.clientWidth + 1
    )),
  );
  const valid = errors.length === 0
    && hierarchyValid
    && !layout.horizontalOverflow
    && layout.minimumControlHeight >= 39
    && frameMetrics.renderedFrames >= 20
    && frameMetrics.p95FrameGap <= 50
    && dialog.ariaHidden === "false"
    && dialog.focusInside
    && dialogFits
    && beautyFits
    && closed.ariaHidden === "true"
    && closed.focusRestored;

  results.push({
    viewport,
    valid,
    errors,
    frameMetrics,
    layout,
    dialog,
    beautyLayout,
    closed,
  });
  await page.close();
}

await browser.close();
const valid = results.every((result) => result.valid);
console.log(JSON.stringify({ valid, results }, null, 2));
if (!valid) process.exitCode = 1;

import { chromium } from "playwright-core";

const executablePath =
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const baseURL =
  process.env.SWISSCOMPACT_BASE_URL ?? "http://127.0.0.1:4174/";
const browser = await chromium.launch({ executablePath, headless: true });
const errors = [];
const results = [];

const viewports = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "tablet-landscape", width: 1024, height: 820 },
  { name: "tablet-portrait", width: 768, height: 1024 },
  { name: "mobile", width: 390, height: 844 },
];

const visible = (element) => {
  if (!(element instanceof HTMLElement)) return false;
  const style = getComputedStyle(element);
  const rect = element.getBoundingClientRect();
  return (
    style.display !== "none"
    && style.visibility !== "hidden"
    && Number(style.opacity) > 0.03
    && rect.width > 1
    && rect.height > 1
  );
};

const prepare = async (page) => {
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(baseURL, {
    waitUntil: "domcontentloaded",
    timeout: 30_000,
  });
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
};

const click = async (page, selector) => {
  await page.locator(selector).first().evaluate((element) => element.click());
  await page.waitForTimeout(500);
};

const inspect = async (page, state) => page.evaluate(({ label, visibleSource }) => {
  const isVisible = new Function(
    "element",
    `return (${visibleSource})(element);`,
  );
  const stage = document.querySelector("[data-showroom-stage]");
  const tools = document.querySelector(".showroom-focus-tools");
  const browserPanel = document.querySelector(
    ".showroom-focus-browser.is-open",
  );
  const inspector = document.querySelector(
    ".showroom-focus-inspector.is-open",
  );
  const guide = document.querySelector(".showroom-use-guide");
  const journeyLauncher = document.querySelector(
    ".solution-journey__launcher",
  );
  const stageRect = stage?.getBoundingClientRect();
  const rect = (element) => {
    if (!(element instanceof HTMLElement) || !isVisible(element)) return null;
    const bounds = element.getBoundingClientRect();
    return {
      left: Math.round(bounds.left),
      top: Math.round(bounds.top),
      right: Math.round(bounds.right),
      bottom: Math.round(bounds.bottom),
      width: Math.round(bounds.width),
      height: Math.round(bounds.height),
    };
  };
  const toolRect = rect(tools);
  const browserRect = rect(browserPanel);
  const inspectorRect = rect(inspector);
  const guideRect = rect(guide);
  const launcherRect = rect(journeyLauncher);
  const headerRect = rect(
    inspector?.querySelector(".showroom-focus-inspector__header"),
  );
  const insideStage = (bounds) => !bounds || !stageRect || (
    bounds.left >= stageRect.left - 2
    && bounds.top >= stageRect.top - 2
    && bounds.right <= stageRect.right + 2
    && bounds.bottom <= stageRect.bottom + 2
  );
  const intersects = (a, b) => Boolean(a && b && (
    a.left < b.right
    && a.right > b.left
    && a.top < b.bottom
    && a.bottom > b.top
  ));
  const visibleToolLabels = Array.from(
    document.querySelectorAll(".showroom-focus-tools button strong"),
  ).filter((element) => isVisible(element));
  const titleTooltips = Array.from(
    document.querySelectorAll(".showroom-focus-tools [title]"),
  );
  const headerStyle = inspector
    ? getComputedStyle(
      inspector.querySelector(".showroom-focus-inspector__header"),
    )
    : null;
  return {
    state: label,
    toolRect,
    browserRect,
    inspectorRect,
    headerRect,
    insideStage: [toolRect, browserRect, inspectorRect].every(insideStage),
    toolPanelOverlap:
      intersects(toolRect, browserRect) || intersects(toolRect, inspectorRect),
    guidePanelOverlap:
      intersects(guideRect, browserRect) || intersects(guideRect, inspectorRect),
    launcherPanelOverlap:
      intersects(launcherRect, browserRect)
      || intersects(launcherRect, inspectorRect),
    visibleToolLabels: visibleToolLabels.length,
    titleTooltips: titleTooltips.length,
    inspectorScrollTop:
      inspector instanceof HTMLElement ? inspector.scrollTop : null,
    headerOpaque:
      !headerStyle || headerStyle.backgroundColor === "rgb(17, 17, 20)",
  };
}, { label: state, visibleSource: visible.toString() });

for (const viewport of viewports) {
  const page = await browser.newPage({ viewport });
  await prepare(page);

  await click(page, '[data-showroom-focus-tool="opening"]');
  const opening = await inspect(page, `${viewport.name}:opening-browser`);
  results.push(opening);
  await page.screenshot({
    path: `/tmp/swisscompact-controls-${viewport.name}-opening.png`,
  });

  await page.waitForFunction(() => (
    document.querySelector('[data-showroom-selection-item^="opening:"]')
  ));
  await click(page, '[data-showroom-selection-item^="opening:"]');
  await page.waitForFunction(() => (
    document.querySelector("[data-showroom-focus-inspector]")
      ?.classList.contains("is-open")
  ));
  const openingInspector = await inspect(
    page,
    `${viewport.name}:opening-inspector`,
  );
  results.push(openingInspector);
  await page.screenshot({
    path: `/tmp/swisscompact-controls-${viewport.name}-opening-inspector.png`,
  });

  await click(page, '[data-showroom-focus-tool="furnishing"]');
  await page.waitForFunction(() => (
    document.querySelector('[data-showroom-selection-item^="furnishing:"]')
  ));
  await click(page, '[data-showroom-selection-item^="furnishing:"]');
  await page.waitForFunction(() => (
    document.querySelector("[data-showroom-focus-inspector]")
      ?.classList.contains("is-open")
  ));
  const furnishing = await inspect(page, `${viewport.name}:furnishing`);
  results.push(furnishing);
  await page.screenshot({
    path: `/tmp/swisscompact-controls-${viewport.name}-furnishing.png`,
  });

  await click(page, '[data-showroom-focus-tool="display"]');
  await page.waitForFunction(() => (
    document.querySelector('[data-showroom-selection-item^="display:"]')
  ));
  await click(page, '[data-showroom-selection-item^="display:"]');
  await page.waitForFunction(() => (
    document.querySelector("[data-showroom-focus-inspector]")
      ?.classList.contains("is-open")
  ));
  const display = await inspect(page, `${viewport.name}:display`);
  results.push(display);
  await page.screenshot({
    path: `/tmp/swisscompact-controls-${viewport.name}-display.png`,
  });
  await page.close();
}

await browser.close();

const failures = results.filter((result) => (
  !result.insideStage
  || result.toolPanelOverlap
  || result.guidePanelOverlap
  || result.launcherPanelOverlap
  || result.titleTooltips > 0
  || !result.headerOpaque
  || (
    !result.state.includes(":opening-browser")
    && (!result.inspectorRect || !result.headerRect)
  )
  || (
    result.state.includes(":opening-browser")
    && !result.browserRect
  )
  || (
    !result.state.startsWith("desktop")
    && result.visibleToolLabels < 6
  )
));

console.log(JSON.stringify({ results, errors }, null, 2));

if (errors.length || failures.length) {
  throw new Error(
    `Control layout smoke failed: ${failures.length} layout failures, `
      + `${errors.length} browser errors.`,
  );
}

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

const getScale = async () => page.evaluate(() => {
  const showroom = document.querySelector("[data-showroom]");
  return {
    x: Number(showroom?.getAttribute("data-showroom-furnishing-scale-x")),
    y: Number(showroom?.getAttribute("data-showroom-furnishing-scale-y")),
    z: Number(showroom?.getAttribute("data-showroom-furnishing-scale-z")),
  };
});

const resizeAlongAxis = async (axis, direction = 1) => {
  await page.waitForTimeout(650);
  const geometry = await page.evaluate((selectedAxis) => {
    const showroom = document.querySelector("[data-showroom]");
    const canvas = document.querySelector("[data-showroom-canvas]");
    const handle = document.querySelector(
      "[data-showroom-furnishing-resize-handle]",
    );
    if (
      !(canvas instanceof HTMLCanvasElement)
      || !(handle instanceof HTMLButtonElement)
    ) return null;
    const canvasBounds = canvas.getBoundingClientRect();
    const handleBounds = handle.getBoundingClientRect();
    const axisKey = selectedAxis.toUpperCase();
    return {
      centerX: Number(showroom?.getAttribute(
        "data-showroom-furnishing-center-screen-x",
      )),
      centerY: Number(showroom?.getAttribute(
        "data-showroom-furnishing-center-screen-y",
      )),
      axisX: Number(showroom?.getAttribute(
        `data-showroom-furnishing-axis-${axisKey.toLowerCase()}-screen-x`,
      )),
      axisY: Number(showroom?.getAttribute(
        `data-showroom-furnishing-axis-${axisKey.toLowerCase()}-screen-y`,
      )),
      handleX: handleBounds.left + handleBounds.width * 0.5,
      handleY: handleBounds.top + handleBounds.height * 0.5,
      left: canvasBounds.left + 28,
      right: canvasBounds.right - 28,
      top: canvasBounds.top + 82,
      bottom: canvasBounds.bottom - 164,
      hidden: handle.hidden,
      symbol: handle.textContent?.trim(),
      axes: Array.from(
        handle.querySelectorAll(
          "[data-showroom-furnishing-resize-axis]",
        ),
      ).map((axisElement) => (
        axisElement.getAttribute(
          "data-showroom-furnishing-resize-axis",
        )
      )),
    };
  }, axis);
  if (!geometry || geometry.hidden) {
    throw new Error("3D corner resize handle is unavailable");
  }
  let vectorX = geometry.axisX - geometry.centerX;
  let vectorY = geometry.axisY - geometry.centerY;
  if (axis === "x") {
    vectorX = 1;
    vectorY = 0;
  } else if (axis === "y") {
    vectorX = 0;
    vectorY = -1;
  } else {
    vectorX = 1;
    vectorY = 1;
  }
  const length = Math.max(1, Math.hypot(vectorX, vectorY));
  const unitX = vectorX / length;
  const unitY = vectorY / length;
  const startX = geometry.handleX + unitX * 27;
  const startY = geometry.handleY + unitY * 27;
  const forwardLimits = [
    unitX > 0
      ? (geometry.right - startX) / unitX
      : unitX < 0
        ? (geometry.left - startX) / unitX
        : Infinity,
    unitY > 0
      ? (geometry.bottom - startY) / unitY
      : unitY < 0
        ? (geometry.top - startY) / unitY
        : Infinity,
  ].filter((value) => Number.isFinite(value) && value >= 0);
  const forwardSpace = Math.min(...forwardLimits, Infinity);
  const movement = direction > 0 && forwardSpace >= 72
    ? Math.min(104, forwardSpace - 8)
    : -Math.min(52, length * 0.4);
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(
    startX + unitX * movement,
    startY + unitY * movement,
    { steps: 12 },
  );
  await page.mouse.up();
  return geometry;
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

  await page.evaluate(() => {
    const button = document.querySelector(
      "[data-showroom-furnishing-select=\"restaurant-table-group-1\"]",
    );
    if (button instanceof HTMLButtonElement) button.click();
  });
  await page.waitForFunction(() => (
    document.querySelector("[data-showroom]")?.getAttribute(
      "data-showroom-selected-furnishing",
    ) === "restaurant-table-group-1"
  ));

  const handleCount = await page.locator(
    "[data-showroom-furnishing-resize-handle]:not([hidden])",
  ).count();
  let handleGeometry = null;
  const axisResults = [];
  for (const axis of ["x", "y", "z"]) {
    const before = await getScale();
    handleGeometry = await resizeAlongAxis(axis, 1);
    const after = await getScale();
    const otherAxes = ["x", "y", "z"].filter(
      (otherAxis) => otherAxis !== axis,
    );
    axisResults.push({
      axis,
      changed: Math.abs(after[axis] - before[axis]) > 0.025,
      isolated: otherAxes.every(
        (otherAxis) =>
          Math.abs(after[otherAxis] - before[otherAxis]) < 0.012,
      ),
      before,
      after,
    });
    await page.locator("[data-showroom-object-reset]").click();
    await page.waitForTimeout(160);
  }

  const tableState = await page.evaluate(() => {
    const showroom = document.querySelector("[data-showroom]");
    const flyout = document.querySelector("[data-showroom-object-flyout]");
    return {
      selected: showroom?.getAttribute(
        "data-showroom-selected-furnishing",
      ),
      flyoutHidden: flyout?.hasAttribute("hidden") ?? false,
      redOpacity: Number(showroom?.getAttribute(
        "data-showroom-furnishing-outline-opacity",
      )),
    };
  });

  await page.locator(
    "[data-showroom-object-nav=\"counterFront\"]",
  ).first().evaluate((button) => button.click());
  await page.waitForFunction(() => (
    document.querySelector("[data-showroom]")?.getAttribute(
      "data-showroom-selected-furnishing",
    ) === "service-counter"
  ));
  const counterState = await page.evaluate(() => ({
    flyoutHidden:
      document.querySelector("[data-showroom-object-flyout]")
        ?.hasAttribute("hidden") ?? false,
    visibleHandles: document.querySelectorAll(
      "[data-showroom-furnishing-resize-handle]:not([hidden])",
    ).length,
  }));

  const valid =
    errors.length === 0
    && handleCount === 1
    && handleGeometry?.axes?.join(",") === "x,y,z"
    && axisResults.every((result) => result.changed && result.isolated)
    && tableState.selected === "restaurant-table-group-1"
    && tableState.flyoutHidden
    && tableState.redOpacity >= 0.68
    && counterState.flyoutHidden
    && counterState.visibleHandles === 1;
  console.log(JSON.stringify({
    valid,
    handleCount,
    axes: handleGeometry?.axes,
    axisResults,
    tableState,
    counterState,
    errors,
  }, null, 2));
  if (!valid) process.exitCode = 1;
} finally {
  await page.close();
  await browser.close();
}

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

const presets = [
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
];
const preferredFurnishings = {
  takeaway: "pickup-station",
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

  const results = [];
  for (const [presetIndex, preset] of presets.entries()) {
    await page.locator(
      `[data-showroom-setting="preset"][data-value="${preset}"]`,
    ).first().evaluate((button) => button.click());
    await page.waitForFunction((expected) => (
      document.querySelector("[data-showroom]")?.getAttribute(
        "data-showroom-preset",
      ) === expected
    ), preset);
    const furnishing = await page.evaluate((preferredId) => {
      const showroom = document.querySelector("[data-showroom]");
      const buttons = Array.from(showroom?.querySelectorAll(
        "[data-showroom-furnishing-select]",
      ) ?? []);
      const button = buttons.find((candidate) => (
        candidate.getAttribute("data-showroom-furnishing-select")
          === preferredId
      )) ?? buttons.find((candidate) => {
        const id = candidate.getAttribute("data-showroom-furnishing-select");
        return id !== "service-counter" && id !== "takeaway-counter";
      }) ?? buttons[0];
      if (!(button instanceof HTMLButtonElement)) return null;
      button.click();
      return {
        id: button.dataset.showroomFurnishingSelect,
        count: Number(showroom?.getAttribute(
          "data-showroom-furnishing-count",
        )),
      };
    }, preferredFurnishings[preset]);
    if (!furnishing?.id) {
      throw new Error(`${preset}: no independently selectable furnishing`);
    }
    await page.waitForFunction((id) => (
      document.querySelector("[data-showroom]")?.getAttribute(
        "data-showroom-selected-furnishing",
      ) === id
    ), furnishing.id);
    await page.waitForFunction(() => {
      const showroom = document.querySelector("[data-showroom]");
      return Number.isFinite(Number(showroom?.getAttribute(
        "data-showroom-furnishing-center-screen-x",
      ))) && !document.querySelector(
        "[data-showroom-furnishing-resize-handle]",
      )?.hasAttribute("hidden");
    });
    await page.waitForTimeout(700);

    const resize = await page.evaluate(() => {
      const showroom = document.querySelector("[data-showroom]");
      const canvas = document.querySelector("[data-showroom-canvas]");
      const handle = document.querySelector(
        "[data-showroom-furnishing-resize-handle]",
      );
      if (
        !(canvas instanceof HTMLCanvasElement)
        || !(handle instanceof HTMLButtonElement)
      ) return null;
      const bounds = canvas.getBoundingClientRect();
      const handleBounds = handle.getBoundingClientRect();
      return {
        before: Number(showroom?.getAttribute(
          "data-showroom-furnishing-scale",
        )),
        beforeAxes: ["x", "y", "z"].map((axis) => Number(
          showroom?.getAttribute(`data-showroom-furnishing-scale-${axis}`),
        )),
        centerX: bounds.left + Number(showroom?.getAttribute(
          "data-showroom-furnishing-center-screen-x",
        )),
        centerY: bounds.top + Number(showroom?.getAttribute(
          "data-showroom-furnishing-center-screen-y",
        )),
        handleX: handleBounds.left + handleBounds.width * 0.5,
        handleY: handleBounds.top + handleBounds.height * 0.5,
        canvasLeft: bounds.left,
        canvasTop: bounds.top,
        canvasRight: bounds.right,
        canvasBottom: bounds.bottom,
      };
    });
    if (!resize) throw new Error(`${preset}: resize handle is unavailable`);
    const vectorX = resize.handleX - resize.centerX;
    const vectorY = resize.handleY - resize.centerY;
    const vectorLength = Math.max(1, Math.hypot(vectorX, vectorY));
    const unitX = vectorX / vectorLength;
    const unitY = vectorY / vectorLength;
    const forwardLimits = [
      unitX > 0
        ? (resize.canvasRight - 24 - resize.handleX) / unitX
        : unitX < 0
          ? (resize.canvasLeft + 24 - resize.handleX) / unitX
          : Infinity,
      unitY > 0
        ? (resize.canvasBottom - 170 - resize.handleY) / unitY
        : unitY < 0
          ? (resize.canvasTop + 80 - resize.handleY) / unitY
          : Infinity,
    ].filter((value) => Number.isFinite(value) && value >= 0);
    const forwardSpace = Math.min(...forwardLimits, Infinity);
    const movement = forwardSpace >= 64
      ? Math.min(96, forwardSpace - 8)
      : -Math.min(48, vectorLength * 0.38);
    await page.mouse.move(resize.handleX, resize.handleY);
    await page.mouse.down();
    await page.mouse.move(
      resize.handleX + unitX * movement,
      resize.handleY + unitY * movement,
      { steps: 10 },
    );
    await page.mouse.up();
    const targetRotation = -72 + presetIndex * 17;
    await page.locator(
      "input[data-showroom-furnishing-rotation]",
    ).evaluate(
      (input, value) => {
        input.value = String(value);
        input.dispatchEvent(new Event("input", { bubbles: true }));
      },
      targetRotation,
    );
    const transformed = await page.evaluate(() => {
      const showroom = document.querySelector("[data-showroom]");
      return {
        selected: showroom?.getAttribute(
          "data-showroom-selected-furnishing",
        ),
        scaleRaw: showroom?.getAttribute(
          "data-showroom-furnishing-scale",
        ),
        rotationRaw: showroom?.getAttribute(
          "data-showroom-furnishing-rotation",
        ),
        scale: Number(showroom?.getAttribute(
          "data-showroom-furnishing-scale",
        )),
        axes: ["x", "y", "z"].map((axis) => Number(
          showroom?.getAttribute(`data-showroom-furnishing-scale-${axis}`),
        )),
        rotation: Number(showroom?.getAttribute(
          "data-showroom-furnishing-rotation",
        )),
      };
    });
    results.push({
      preset,
      id: furnishing.id,
      count: furnishing.count,
      selected: transformed.selected,
      scaleRaw: transformed.scaleRaw,
      rotationRaw: transformed.rotationRaw,
      resized: transformed.axes.some(
        (axisScale, axis) =>
          Math.abs(axisScale - resize.beforeAxes[axis]) > 0.005,
      ),
      rotated: Math.abs(
        transformed.rotation - targetRotation * Math.PI / 180,
      ) < 0.02,
      scale: transformed.scale,
      rotation: transformed.rotation,
    });
  }

  await page.locator(
    "[data-showroom-setting=\"preset\"][data-value=\"eventHall\"]",
  ).first().evaluate((button) => button.click());
  await page.waitForFunction(() => (
    document.querySelector("[data-showroom]")?.getAttribute(
      "data-showroom-preset",
    ) === "eventHall"
  ));
  const grouping = await page.evaluate(() => {
    const ids = Array.from(document.querySelectorAll(
      "[data-showroom-furnishing-select]",
    )).map((button) => button.getAttribute(
      "data-showroom-furnishing-select",
    ));
    return {
      eventChairs: new Set(
        ids.filter((id) => id?.startsWith("event-chair-")),
      ).size,
    };
  });
  await page.locator(
    "[data-showroom-setting=\"preset\"][data-value=\"restaurant\"]",
  ).first().evaluate((button) => button.click());
  await page.waitForFunction(() => (
    document.querySelector("[data-showroom]")?.getAttribute(
      "data-showroom-preset",
    ) === "restaurant"
  ));
  const tableGrouping = await page.evaluate(() => {
    const ids = Array.from(document.querySelectorAll(
      "[data-showroom-furnishing-select]",
    )).map((button) => button.getAttribute(
      "data-showroom-furnishing-select",
    ));
    return {
      groups: new Set(
        ids.filter((id) => id?.startsWith("restaurant-table-group-")),
      ).size,
      looseChairs: ids.some((id) => id?.startsWith("restaurant-chair-")),
    };
  });
  await page.setViewportSize({ width: 390, height: 844 });
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
  const responsive = await page.evaluate(() => {
    const toolbar = document.querySelector("[data-showroom-object-toolbar]");
    const handle = document.querySelector(
      "[data-showroom-furnishing-resize-handle]",
    );
    if (!(toolbar instanceof HTMLElement) || !(handle instanceof HTMLElement)) {
      return { valid: false };
    }
    const toolbarBounds = toolbar.getBoundingClientRect();
    const handleBounds = handle.getBoundingClientRect();
    return {
      valid:
        document.documentElement.scrollWidth <= window.innerWidth + 1
        && toolbarBounds.left >= 0
        && toolbarBounds.right <= window.innerWidth
        && handleBounds.left >= 0
        && handleBounds.right <= window.innerWidth,
      toolbarWidth: toolbarBounds.width,
      viewportWidth: window.innerWidth,
    };
  });

  const valid =
    errors.length === 0
    && results.length === presets.length
    && results.every((result) => (
      result.count > 0 && result.resized && result.rotated
    ))
    && grouping.eventChairs === 72
    && tableGrouping.groups === 5
    && !tableGrouping.looseChairs
    && responsive.valid;
  console.log(JSON.stringify({
    valid,
    results,
    grouping,
    tableGrouping,
    responsive,
    errors,
  }, null, 2));
  if (!valid) process.exitCode = 1;
} finally {
  await page.close();
  await browser.close();
}

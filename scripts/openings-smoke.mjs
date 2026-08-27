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
  await page.locator("[data-marketing-target=\"#wirkung\"]").first().evaluate(
    (button) => button.click(),
  );
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
  await page.waitForTimeout(500);

  const menu = page.locator("[data-showroom-focus-browser]");
  const openMenu = async (type) => {
    const tool = type === "window" ? "window" : "door";
    await page.locator(`[data-showroom-focus-tool="${tool}"]`).evaluate(
      (button) => button.click(),
    );
    await page.waitForTimeout(100);
    const open = await menu.evaluate(
      (panel) => panel.classList.contains("is-open"),
    );
    if (!open) {
      await page.locator(`[data-showroom-focus-tool="${tool}"]`).evaluate(
        (button) => button.click(),
      );
      await page.waitForTimeout(100);
    }
  };
  const addOpening = async (wall, type) => {
    await openMenu(type);
    await menu.locator(`[data-showroom-opening-wall="${wall}"]`).evaluate(
      (button) => button.click(),
    );
    await menu.locator(`[data-showroom-opening-add="${type}"]`).evaluate(
      (button) => button.click(),
    );
    await page.waitForTimeout(180);
  };

  await addOpening("back", "window");
  const initialWindow = await page.evaluate(() => {
    const showroom = document.querySelector("[data-showroom]");
    return {
      count: Number(showroom?.getAttribute("data-showroom-opening-count")),
      type: showroom?.getAttribute("data-showroom-selected-opening-type"),
      wall: showroom?.getAttribute("data-showroom-selected-opening-wall"),
      width: Number(
        showroom?.getAttribute("data-showroom-selected-opening-width-cm"),
      ),
      height: Number(
        showroom?.getAttribute("data-showroom-selected-opening-height-cm"),
      ),
      center: Number(
        showroom?.getAttribute("data-showroom-selected-opening-center"),
      ),
      shadowRefreshes: Number(showroom?.getAttribute(
        "data-showroom-opening-shadow-refresh-count",
      )),
      displayCollisions: Number(showroom?.getAttribute(
        "data-showroom-opening-display-collisions",
      )),
    };
  });

  await page.keyboard.press("Escape");
  await page.waitForTimeout(1200);
  await page.waitForFunction(() => {
    const showroom = document.querySelector("[data-showroom]");
    return Number.isFinite(Number(
      showroom?.getAttribute("data-showroom-opening-screen-x"),
    )) && Number.isFinite(Number(
      showroom?.getAttribute("data-showroom-opening-screen-y"),
    ));
  });
  const movePoint = await page.evaluate(() => {
    const showroom = document.querySelector("[data-showroom]");
    const canvas = document.querySelector("[data-showroom-canvas]");
    if (!(canvas instanceof HTMLCanvasElement)) {
      throw new Error("Showroom canvas is missing");
    }
    const bounds = canvas.getBoundingClientRect();
    return {
      x: bounds.left + Number(
        showroom?.getAttribute("data-showroom-opening-screen-x"),
      ),
      y: bounds.top + Number(
        showroom?.getAttribute("data-showroom-opening-screen-y"),
      ),
    };
  });
  await page.mouse.move(movePoint.x, movePoint.y);
  await page.mouse.down();
  await page.mouse.move(movePoint.x + 65, movePoint.y, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(180);
  const movedWindow = await page.evaluate(() => {
    const showroom = document.querySelector("[data-showroom]");
    return {
      center: Number(
        showroom?.getAttribute("data-showroom-selected-opening-center"),
      ),
      shadowRefreshes: Number(showroom?.getAttribute(
        "data-showroom-opening-shadow-refresh-count",
      )),
    };
  });

  await page.waitForFunction(() => {
    const showroom = document.querySelector("[data-showroom]");
    return Number.isFinite(Number(
      showroom?.getAttribute("data-showroom-opening-resize-screen-x"),
    )) && Number.isFinite(Number(
      showroom?.getAttribute("data-showroom-opening-resize-screen-y"),
    ));
  });
  const resizePoint = await page.evaluate(() => {
    const showroom = document.querySelector("[data-showroom]");
    const canvas = document.querySelector("[data-showroom-canvas]");
    if (!(canvas instanceof HTMLCanvasElement)) {
      throw new Error("Showroom canvas is missing");
    }
    const bounds = canvas.getBoundingClientRect();
    return {
      x: bounds.left + Number(
        showroom?.getAttribute("data-showroom-opening-resize-screen-x"),
      ),
      y: bounds.top + Number(
        showroom?.getAttribute("data-showroom-opening-resize-screen-y"),
      ),
    };
  });
  await page.mouse.move(resizePoint.x, resizePoint.y);
  await page.waitForTimeout(80);
  const resizeTargetState = await page.evaluate(({ x, y }) => ({
    element: document.elementFromPoint(x, y)?.getAttribute(
      "data-showroom-canvas",
    ) !== null
      ? "canvas"
      : document.elementFromPoint(x, y)?.className ?? "",
    resizeHover: document.querySelector("[data-showroom]")
      ?.classList.contains("is-opening-resize-hover") ?? false,
  }), resizePoint);
  await page.mouse.down();
  await page.mouse.move(resizePoint.x + 70, resizePoint.y - 55, {
    steps: 8,
  });
  await page.mouse.up();
  await page.waitForTimeout(180);
  const resizedWindow = await page.evaluate(() => {
    const showroom = document.querySelector("[data-showroom]");
    return {
      width: Number(
        showroom?.getAttribute("data-showroom-selected-opening-width-cm"),
      ),
      height: Number(
        showroom?.getAttribute("data-showroom-selected-opening-height-cm"),
      ),
      shadowRefreshes: Number(showroom?.getAttribute(
        "data-showroom-opening-shadow-refresh-count",
      )),
    };
  });

  await addOpening("left", "singleDoor");
  await addOpening("right", "doubleDoor");
  await page.locator('[data-showroom-focus-tool="layers"]').evaluate(
    (button) => button.click(),
  );
  await page.waitForTimeout(100);
  const allWalls = await page.evaluate(() => {
    const showroom = document.querySelector("[data-showroom]");
    return {
      count: Number(showroom?.getAttribute("data-showroom-opening-count")),
      selectedType:
        showroom?.getAttribute("data-showroom-selected-opening-type"),
      selectedWall:
        showroom?.getAttribute("data-showroom-selected-opening-wall"),
      displayCollisions: Number(showroom?.getAttribute(
        "data-showroom-opening-display-collisions",
      )),
      rows: Array.from(
        document.querySelectorAll(
          '[data-showroom-selection-item^="opening:"] strong',
        ),
      ).map((element) => element.textContent ?? ""),
    };
  });

  await page.screenshot({
    path: "/tmp/swisscompact-showroom-openings.png",
    fullPage: false,
  });

  const valid =
    initialWindow.count === 3
    && initialWindow.type === "window"
    && initialWindow.wall === "back"
    && initialWindow.width === 160
    && initialWindow.height === 120
    && initialWindow.displayCollisions === 0
    && movedWindow.center !== initialWindow.center
    && movedWindow.shadowRefreshes > initialWindow.shadowRefreshes
    && resizedWindow.width !== initialWindow.width
    && resizedWindow.height !== initialWindow.height
    && resizedWindow.shadowRefreshes > movedWindow.shadowRefreshes
    && allWalls.count === 5
    // If a wall is completely occupied by openings, the collision guard may
    // hide one display instead of allowing it to overlap a door or window.
    && allWalls.displayCollisions <= 1
    && allWalls.rows.some((row) => row.includes("Rückwand"))
    && allWalls.rows.some((row) => row.includes("Linke Wand"))
    && allWalls.rows.some((row) => row.includes("Rechte Wand"))
    && allWalls.rows.some((row) => row.includes("Doppeltür"))
    && errors.length === 0;

  console.log(JSON.stringify({
    valid,
    initialWindow,
    movedWindow,
    resizedWindow,
    movePoint,
    resizePoint,
    resizeTargetState,
    allWalls,
    errors,
  }, null, 2));
  if (!valid) process.exitCode = 1;
} finally {
  await browser.close();
}

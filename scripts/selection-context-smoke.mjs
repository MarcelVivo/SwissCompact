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

const selectItem = async (id) => {
  await page.locator('[data-showroom-selection-mode="partition"]')
    .first().evaluate((button) => button.click());
  await page.locator(`[data-showroom-selection-item="partition:${id}"]`)
    .evaluate((button) => button.click());
  await page.waitForTimeout(120);
  const selected = await page.locator("[data-showroom]").getAttribute(
    "data-showroom-selected-furnishing",
  );
  if (selected !== id) {
    const debug = await page.evaluate(() => ({
      guard: document.querySelector("[data-showroom]")?.getAttribute(
        "data-showroom-selection-guard",
      ),
      action: document.querySelector("[data-showroom]")?.getAttribute(
        "data-showroom-last-selection-action",
      ),
      items: Array.from(document.querySelectorAll(
        '[data-showroom-selection-item^="partition:"]',
      )).map((item) => item.getAttribute("data-showroom-selection-item")),
    }));
    throw new Error(
      `Expected ${id}, selected ${selected ?? "none"}: ${JSON.stringify(debug)}`,
    );
  }
};
const readSelectedCenter = async () => page.evaluate(() => {
  const root = document.querySelector("[data-showroom]");
  const canvas = document.querySelector("[data-showroom-canvas]");
  if (!(canvas instanceof HTMLCanvasElement)) return null;
  const bounds = canvas.getBoundingClientRect();
  return {
    x: bounds.left + Number(root?.getAttribute(
      "data-showroom-furnishing-center-screen-x",
    )),
    y: bounds.top + Number(root?.getAttribute(
      "data-showroom-furnishing-center-screen-y",
    )),
  };
});

const dispatchCanvasPointer = async (type, point, options = {}) => {
  await page.evaluate(({ eventType, targetPoint, eventOptions }) => {
    const canvas = document.querySelector("[data-showroom-canvas]");
    if (!(canvas instanceof HTMLCanvasElement)) return;
    canvas.dispatchEvent(new PointerEvent(eventType, {
      bubbles: true,
      pointerId: eventOptions.pointerId ?? 71,
      pointerType: eventOptions.pointerType ?? "mouse",
      button: 0,
      buttons: eventType === "pointerup" ? 0 : 1,
      clientX: targetPoint.x,
      clientY: targetPoint.y,
    }));
  }, { eventType: type, targetPoint: point, eventOptions: options });
};
const clickCanvasPoint = async (point, pointerId) => {
  await dispatchCanvasPointer("pointerdown", point, { pointerId });
  await dispatchCanvasPointer("pointerup", point, { pointerId });
  await page.waitForTimeout(80);
};
const selectAutoAtPoint = async (id, point, pointerId) => {
  await page.locator('[data-showroom-selection-mode="auto"]')
    .first().evaluate((button) => button.click());
  await clickCanvasPoint(point, pointerId);
  const selected = await page.locator("[data-showroom]").getAttribute(
    "data-showroom-selected-furnishing",
  );
  if (selected !== id) throw new Error(`Auto canvas selection failed for ${id}`);
};

try {
  await page.goto(baseURL, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.evaluate(() => {
    document.querySelector("[data-showroom]")?.scrollIntoView({ block: "start" });
  });
  await page.waitForFunction(() => (
    document.querySelector("[data-showroom]")?.getAttribute("data-showroom-ready") === "true"
  ), undefined, { timeout: 45_000 });
  await page.locator(
    '[data-showroom-setting="preset"][data-value="cafe"]',
  ).first().evaluate((button) => button.click());
  await page.locator('[data-showroom-focus-tool="partition"]').click();
  await page.locator("[data-showroom-partition-create]").click();
  await page.locator("[data-showroom-partition-create]").click();

  const firstId = "modular-partition-cafe-1";
  await selectItem(firstId);
  const firstPoint = await readSelectedCenter();
  if (!firstPoint) throw new Error("Missing partition screen point");

  await selectAutoAtPoint(firstId, firstPoint, 91);
  const canvasBounds = await page.locator("[data-showroom-canvas]")
    .evaluate((canvas) => {
      const bounds = canvas.getBoundingClientRect();
      return {
        x: bounds.left + bounds.width * 0.5,
        y: bounds.bottom - 10,
      };
    });
  await dispatchCanvasPointer("pointerdown", canvasBounds, { pointerId: 82 });
  await dispatchCanvasPointer("pointerup", canvasBounds, { pointerId: 82 });
  const backgroundDismiss = await page.evaluate(() => ({
    selected: document.querySelector("[data-showroom]")?.getAttribute(
      "data-showroom-selected-furnishing",
    ),
    roomSurface: document.querySelector("[data-showroom]")?.getAttribute(
      "data-showroom-selected-room-surface",
    ),
    action: document.querySelector("[data-showroom]")?.getAttribute(
      "data-showroom-last-selection-action",
    ),
  }));

  await selectAutoAtPoint(firstId, firstPoint, 92);
  await page.keyboard.press("Escape");
  const escapeDismiss = await page.evaluate(() => ({
    selected: document.querySelector("[data-showroom]")?.getAttribute(
      "data-showroom-selected-furnishing",
    ),
    action: document.querySelector("[data-showroom]")?.getAttribute(
      "data-showroom-last-selection-action",
    ),
  }));

  await selectAutoAtPoint(firstId, firstPoint, 93);
  const movedPoint = await readSelectedCenter();
  if (!movedPoint) throw new Error("Missing drag point");
  await dispatchCanvasPointer("pointerdown", movedPoint, { pointerId: 83 });
  await dispatchCanvasPointer(
    "pointermove",
    { x: movedPoint.x + 42, y: movedPoint.y + 12 },
    { pointerId: 83 },
  );
  await dispatchCanvasPointer(
    "pointerup",
    { x: movedPoint.x + 42, y: movedPoint.y + 12 },
    { pointerId: 83 },
  );
  await dispatchCanvasPointer("pointerdown", firstPoint, { pointerId: 84 });
  await dispatchCanvasPointer("pointerup", firstPoint, { pointerId: 84 });
  const guarded = await page.evaluate((expected) => ({
    selected: document.querySelector("[data-showroom]")?.getAttribute(
      "data-showroom-selected-furnishing",
    ),
    selectionGuard: document.querySelector("[data-showroom]")?.getAttribute(
      "data-showroom-selection-guard",
    ),
    action: document.querySelector("[data-showroom]")?.getAttribute(
      "data-showroom-last-selection-action",
    ),
    preserved: document.querySelector("[data-showroom]")?.getAttribute(
      "data-showroom-selected-furnishing",
    ) === expected,
  }), firstId);

  await page.waitForTimeout(340);
  await dispatchCanvasPointer("pointerdown", canvasBounds, { pointerId: 85 });
  await dispatchCanvasPointer("pointerup", canvasBounds, { pointerId: 85 });
  const afterGuard = await page.evaluate(() => ({
    selected: document.querySelector("[data-showroom]")?.getAttribute(
      "data-showroom-selected-furnishing",
    ),
    action: document.querySelector("[data-showroom]")?.getAttribute(
      "data-showroom-last-selection-action",
    ),
  }));

  await selectAutoAtPoint(firstId, firstPoint, 94);
  await page.locator('[data-showroom-focus-tool="partition"]').dispatchEvent(
    "pointerdown",
    { pointerId: 90, pointerType: "mouse", button: 0 },
  );
  const uiBoundary = await page.evaluate(() => ({
    boundary: document.querySelector("[data-showroom]")?.getAttribute(
      "data-showroom-last-pointer-boundary",
    ),
    selected: document.querySelector("[data-showroom]")?.getAttribute(
      "data-showroom-selected-furnishing",
    ),
  }));
  const touchPoint = await readSelectedCenter();
  if (!touchPoint) throw new Error("Missing touch selection point");
  await page.keyboard.press("Escape");
  await dispatchCanvasPointer("pointerdown", touchPoint, {
    pointerId: 96,
    pointerType: "touch",
  });
  await dispatchCanvasPointer("pointerup", touchPoint, {
    pointerId: 96,
    pointerType: "touch",
  });
  const firstTouch = await page.evaluate((expected) => ({
    selected: document.querySelector("[data-showroom]")?.getAttribute(
      "data-showroom-selected-furnishing",
    ),
    action: document.querySelector("[data-showroom]")?.getAttribute(
      "data-showroom-last-selection-action",
    ),
    dragging: document.querySelector("[data-showroom]")?.classList.contains(
      "is-furnishing-dragging",
    ),
    correct: document.querySelector("[data-showroom]")?.getAttribute(
      "data-showroom-selected-furnishing",
    ) === expected,
  }), firstId);
  await dispatchCanvasPointer("pointerdown", touchPoint, {
    pointerId: 97,
    pointerType: "touch",
  });
  const secondTouchDragging = await page.locator("[data-showroom]")
    .evaluate((root) => root.classList.contains("is-furnishing-dragging"));
  await dispatchCanvasPointer("pointerup", touchPoint, {
    pointerId: 97,
    pointerType: "touch",
  });

  const valid = errors.length === 0
    && !backgroundDismiss.selected
    && !backgroundDismiss.roomSurface
    && backgroundDismiss.action === "background-dismiss"
    && !escapeDismiss.selected
    && escapeDismiss.action === "escape-dismiss"
    && guarded.selectionGuard === "drag"
    && guarded.action === "guarded-click"
    && guarded.preserved
    && !afterGuard.selected
    && afterGuard.action === "background-dismiss"
    && uiBoundary.boundary === "ui"
    && uiBoundary.selected === firstId
    && firstTouch.correct
    && firstTouch.action === "touch-select"
    && !firstTouch.dragging
    && secondTouchDragging;
  console.log(JSON.stringify({
    valid,
    backgroundDismiss,
    escapeDismiss,
    guarded,
    afterGuard,
    uiBoundary,
    firstTouch,
    secondTouchDragging,
    errors,
  }, null, 2));
  if (!valid) process.exitCode = 1;
} finally {
  await browser.close();
}

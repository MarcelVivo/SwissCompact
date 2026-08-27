import { chromium } from "playwright-core";

const executablePath =
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const baseURL =
  process.env.SWISSCOMPACT_BASE_URL ?? "http://127.0.0.1:4173/";
const browser = await chromium.launch({ executablePath, headless: true });
const page = await browser.newPage({
  viewport: { width: 1440, height: 900 },
});
const errors = [];

page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});
page.on("pageerror", (error) => errors.push(error.message));

const showroomState = () => {
  const showroom = document.querySelector("[data-showroom]");
  return {
    selected: showroom?.getAttribute("data-showroom-selected-structure") ?? "",
    selectedIndex: Number(showroom?.getAttribute(
      "data-showroom-selected-structure-index",
    )),
    armed:
      showroom?.getAttribute("data-showroom-structure-armed") === "true",
    dragging: showroom?.classList.contains("is-totem-dragging") ?? false,
    x: Number(showroom?.getAttribute("data-showroom-structure-x")),
    z: Number(showroom?.getAttribute("data-showroom-structure-z")),
    opacity: Number(showroom?.getAttribute(
      "data-showroom-structure-outline-opacity",
    )),
  };
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

  await page.locator(
    "[data-showroom-setting=\"preset\"][data-value=\"takeaway\"]",
  ).first().evaluate((button) => button.click());
  await page.locator(
    "[data-showroom-totem-setup=\"halfTotem\"]",
  ).first().evaluate((button) => button.click());
  await page.waitForFunction(() => {
    const showroom = document.querySelector("[data-showroom]");
    const x = showroom?.getAttribute("data-showroom-stele1-hit-screen-x");
    const y = showroom?.getAttribute("data-showroom-stele1-hit-screen-y");
    return x !== null
      && y !== null
      && Number.isFinite(Number(x))
      && Number.isFinite(Number(y));
  }, undefined, { timeout: 10_000 });
  await page.waitForTimeout(500);

  const hit = await page.evaluate(() => {
    const showroom = document.querySelector("[data-showroom]");
    const canvas = document.querySelector("[data-showroom-canvas]");
    if (!(canvas instanceof HTMLCanvasElement)) {
      throw new Error("Showroom canvas is missing");
    }
    const bounds = canvas.getBoundingClientRect();
    return {
      x: bounds.left + Number(showroom?.getAttribute(
        "data-showroom-stele1-hit-screen-x",
      )),
      y: bounds.top + Number(showroom?.getAttribute(
        "data-showroom-stele1-hit-screen-y",
      )),
    };
  });

  await page.evaluate(({ x, y }) => {
    const canvas = document.querySelector("[data-showroom-canvas]");
    canvas?.dispatchEvent(new PointerEvent("pointerdown", {
      bubbles: true,
      pointerId: 93,
      pointerType: "mouse",
      button: 0,
      clientX: x,
      clientY: y,
    }));
    canvas?.dispatchEvent(new PointerEvent("pointerup", {
      bubbles: true,
      pointerId: 93,
      pointerType: "mouse",
      button: 0,
      clientX: x,
      clientY: y,
    }));
  }, hit);
  const selectionAfterHit = await page.evaluate(() => {
    const showroom = document.querySelector("[data-showroom]");
    return {
      structure:
        showroom?.getAttribute("data-showroom-selected-structure") ?? "",
      display:
        showroom?.classList.contains("has-display-selection") ?? false,
      furnishing:
        showroom?.getAttribute("data-showroom-selected-furnishing") ?? "",
    };
  });
  if (selectionAfterHit.structure !== "stele") {
    throw new Error(
      `Stele hit missed at ${hit.x.toFixed(1)}, ${hit.y.toFixed(1)}: `
      + JSON.stringify(selectionAfterHit),
    );
  }
  await page.waitForFunction(() => (
    document.querySelector("[data-showroom]")?.getAttribute(
      "data-showroom-structure-armed",
    ) === "true"
  ), undefined, { timeout: 10_000 });
  const firstClick = await page.evaluate(showroomState);
  await page.waitForTimeout(480);
  const pulseOpacity = await page.evaluate(() => Number(
    document.querySelector("[data-showroom]")?.getAttribute(
      "data-showroom-structure-outline-opacity",
    ),
  ));

  await page.mouse.move(hit.x, hit.y);
  await page.mouse.down();
  await page.mouse.move(hit.x + 115, hit.y - 28, { steps: 10 });
  await page.mouse.up();
  const afterDrag = await page.evaluate(showroomState);

  const movedDisplayHit = await page.evaluate(() => {
    const showroom = document.querySelector("[data-showroom]");
    const canvas = document.querySelector("[data-showroom-canvas]");
    if (!(canvas instanceof HTMLCanvasElement)) {
      throw new Error("Showroom canvas is missing");
    }
    const bounds = canvas.getBoundingClientRect();
    return {
      x: bounds.left + Number(showroom?.getAttribute(
        "data-showroom-display-screen-x",
      )),
      y: bounds.top + Number(showroom?.getAttribute(
        "data-showroom-display-screen-y",
      )),
    };
  });
  await page.mouse.click(movedDisplayHit.x, movedDisplayHit.y);
  const displayStillAccessible = await page.evaluate(() => {
    const showroom = document.querySelector("[data-showroom]");
    return {
      displaySelected:
        showroom?.classList.contains("has-display-selection") ?? false,
      structureCleared:
        !showroom?.getAttribute("data-showroom-selected-structure"),
    };
  });

  const clearedBeside = await page.evaluate(() => {
    const showroom = document.querySelector("[data-showroom]");
    const canvas = document.querySelector("[data-showroom-canvas]");
    if (!(showroom instanceof HTMLElement)
      || !(canvas instanceof HTMLCanvasElement)) return false;
    const bounds = canvas.getBoundingClientRect();
    canvas.dispatchEvent(new PointerEvent("pointerdown", {
      bubbles: true,
      pointerId: 94,
      pointerType: "mouse",
      button: 0,
      clientX: bounds.left + 8,
      clientY: bounds.top + 8,
    }));
    return !showroom.dataset.showroomSelectedStructure;
  });

  await page.locator(
    "[data-showroom-totem-setup=\"midColumn\"]",
  ).first().evaluate((button) => button.click());
  await page.waitForFunction(() => {
    const showroom = document.querySelector("[data-showroom]");
    const x = showroom?.getAttribute("data-showroom-totem1-hit-screen-x");
    const y = showroom?.getAttribute("data-showroom-totem1-hit-screen-y");
    return x !== null
      && y !== null
      && Number.isFinite(Number(x))
      && Number.isFinite(Number(y));
  }, undefined, { timeout: 10_000 });
  await page.waitForTimeout(500);
  const columnHit = await page.evaluate(() => {
    const showroom = document.querySelector("[data-showroom]");
    const canvas = document.querySelector("[data-showroom-canvas]");
    if (!(canvas instanceof HTMLCanvasElement)) {
      throw new Error("Showroom canvas is missing");
    }
    const bounds = canvas.getBoundingClientRect();
    return {
      x: bounds.left + Number(showroom?.getAttribute(
        "data-showroom-totem1-hit-screen-x",
      )),
      y: bounds.top + Number(showroom?.getAttribute(
        "data-showroom-totem1-hit-screen-y",
      )),
    };
  });
  await page.evaluate(({ x, y }) => {
    const canvas = document.querySelector("[data-showroom-canvas]");
    canvas?.dispatchEvent(new PointerEvent("pointerdown", {
      bubbles: true,
      pointerId: 95,
      pointerType: "mouse",
      button: 0,
      clientX: x,
      clientY: y,
    }));
    canvas?.dispatchEvent(new PointerEvent("pointerup", {
      bubbles: true,
      pointerId: 95,
      pointerType: "mouse",
      button: 0,
      clientX: x,
      clientY: y,
    }));
  }, columnHit);
  const columnFirstClick = await page.evaluate(showroomState);

  const pulseIsSubtle =
    firstClick.opacity >= 0.19
    && firstClick.opacity <= 0.37
    && pulseOpacity >= 0.19
    && pulseOpacity <= 0.37
    && Math.abs(pulseOpacity - firstClick.opacity) >= 0.005;
  const failures = [
    firstClick.selected !== "stele"
      || firstClick.selectedIndex !== 0
      || !firstClick.armed
      || firstClick.dragging
      ? "The first column/stele click did not only arm the structure"
      : "",
    !pulseIsSubtle
      ? "The selected structure outline did not pulse subtly"
      : "",
    Math.abs(afterDrag.x - firstClick.x) <= 0.1
      && Math.abs(afterDrag.z - firstClick.z) <= 0.1
      ? "The armed structure did not move on the second interaction"
      : "",
    afterDrag.dragging
      ? "The structure drag state did not release"
      : "",
    !displayStillAccessible.displaySelected
      || !displayStillAccessible.structureCleared
      ? "A second click without movement did not keep the display accessible"
      : "",
    !clearedBeside
      ? "Clicking beside the structure did not clear its selection"
      : "",
    columnFirstClick.selected !== "totem"
      || columnFirstClick.selectedIndex !== 0
      || !columnFirstClick.armed
      || columnFirstClick.dragging
      ? "The first column click did not only arm the column"
      : "",
    errors.length > 0 ? `Browser errors: ${errors.join(" | ")}` : "",
  ].filter(Boolean);
  if (failures.length > 0) throw new Error(failures.join("\n"));

  process.stdout.write(
    "Structure selection smoke passed: arm, pulse, drag, and clear.\n",
  );
} finally {
  await page.close();
  await browser.close();
}

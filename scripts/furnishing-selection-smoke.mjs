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
  await page.waitForTimeout(500);
  await page.locator("[data-journey-open]").click();
  await page.locator(
    '[data-journey-category-id="gastronomy"]',
  ).click();
  await page.locator(
    '[data-journey-room-id="restaurant"]',
  ).click();
  await page.locator("[data-journey-configure]").first().click();
  await page.waitForTimeout(350);
  await page.locator(
    '[data-showroom-selection-mode="auto"]',
  ).first().evaluate((button) => button.click());

  await page.locator(
    '[data-showroom-selection-item="furnishing:service-counter"]',
  ).evaluate((button) => button.click());
  await page.waitForFunction(() => {
    const showroom = document.querySelector("[data-showroom]");
    return showroom?.getAttribute("data-showroom-selected-furnishing")
      === "service-counter"
      && Number.isFinite(Number(
        showroom.getAttribute("data-showroom-furnishing-screen-x"),
      ))
      && Number.isFinite(Number(
        showroom.getAttribute("data-showroom-furnishing-screen-y"),
      ));
  }, undefined, { timeout: 10_000 });

  const initial = await page.evaluate(() => {
    const showroom = document.querySelector("[data-showroom]");
    const canvas = document.querySelector("[data-showroom-canvas]");
    if (!(canvas instanceof HTMLCanvasElement)) {
      throw new Error("Showroom canvas is missing");
    }
    const bounds = canvas.getBoundingClientRect();
    const point = (xKey, yKey) => ({
      x: bounds.left + Number(showroom?.getAttribute(xKey)),
      y: bounds.top + Number(showroom?.getAttribute(yKey)),
    });
    const center = point(
      "data-showroom-furnishing-center-screen-x",
      "data-showroom-furnishing-center-screen-y",
    );
    const axes = ["x", "y", "z"].map((axis) => point(
      `data-showroom-furnishing-axis-${axis}-screen-x`,
      `data-showroom-furnishing-axis-${axis}-screen-y`,
    ));
    return {
      candidates: [
        center,
        ...axes,
        ...axes.map((axis) => ({
          x: center.x + (axis.x - center.x) * 0.7,
          y: center.y + (axis.y - center.y) * 0.7,
        })),
      ],
      x: Number(showroom?.getAttribute("data-showroom-furnishing-x")),
      z: Number(showroom?.getAttribute("data-showroom-furnishing-z")),
    };
  });

  const clearedAfterOutsideClick = await page.evaluate(() => {
    const showroom = document.querySelector("[data-showroom]");
    const canvas = document.querySelector("[data-showroom-canvas]");
    if (!(showroom instanceof HTMLElement)
      || !(canvas instanceof HTMLCanvasElement)) return false;
    const bounds = canvas.getBoundingClientRect();
    canvas.dispatchEvent(new PointerEvent("pointerdown", {
      bubbles: true,
      pointerId: 91,
      pointerType: "mouse",
      button: 0,
      clientX: bounds.left + bounds.width * 0.5,
      clientY: bounds.bottom - 8,
    }));
    return !showroom.dataset.showroomSelectedFurnishing;
  });

  let hitPoint = null;
  for (const candidate of initial.candidates) {
    if (!Number.isFinite(candidate.x) || !Number.isFinite(candidate.y)) {
      continue;
    }
    await page.mouse.move(candidate.x, candidate.y);
    await page.waitForTimeout(70);
    const isFurnishingHit = await page.evaluate(() => (
      document.querySelector("[data-showroom]")
        ?.classList.contains("is-furnishing-hover") ?? false
    ));
    if (isFurnishingHit) {
      hitPoint = candidate;
      break;
    }
  }
  if (!hitPoint) {
    throw new Error("No visible service-counter surface or edge was pickable");
  }
  await page.mouse.move(hitPoint.x, hitPoint.y);
  await page.mouse.down();
  await page.mouse.move(hitPoint.x + 74, hitPoint.y - 18, { steps: 8 });
  await page.mouse.up();
  const selectionAfterFirstClick = await page.evaluate(() => (
    document.querySelector("[data-showroom]")?.getAttribute(
      "data-showroom-selected-furnishing",
    ) ?? ""
  ));
  if (selectionAfterFirstClick !== "service-counter") {
    throw new Error(
      `First object hit missed at ${hitPoint.x.toFixed(1)},`
      + ` ${hitPoint.y.toFixed(1)} (selected:`
      + ` ${selectionAfterFirstClick || "none"})`,
    );
  }
  await page.waitForFunction(() => (
    document.querySelector("[data-showroom]")?.getAttribute(
      "data-showroom-selected-furnishing",
    ) === "service-counter"
  ), undefined, { timeout: 10_000 });
  const firstClickState = await page.evaluate((before) => {
    const showroom = document.querySelector("[data-showroom]");
    const x = Number(showroom?.getAttribute("data-showroom-furnishing-x"));
    const z = Number(showroom?.getAttribute("data-showroom-furnishing-z"));
    return {
      armed:
        showroom?.getAttribute("data-showroom-furnishing-armed") === "true",
      released:
        !showroom?.classList.contains("is-furnishing-dragging"),
      moved:
        Math.abs(x - before.x) > 0.1 || Math.abs(z - before.z) > 0.1,
      outlineOpacity: Number(showroom?.getAttribute(
        "data-showroom-furnishing-outline-opacity",
      )),
    };
  }, initial);
  await page.waitForTimeout(480);
  const nextOutlineOpacity = await page.evaluate(() => Number(
    document.querySelector("[data-showroom]")?.getAttribute(
      "data-showroom-furnishing-outline-opacity",
    ),
  ));

  const pulseIsSubtle =
    firstClickState.outlineOpacity >= 0.68
    && firstClickState.outlineOpacity <= 0.96
    && nextOutlineOpacity >= 0.68
    && nextOutlineOpacity <= 0.96
    && Math.abs(
      nextOutlineOpacity - firstClickState.outlineOpacity,
    ) >= 0.005;
  const failures = [
    !clearedAfterOutsideClick
      ? "Clicking beside a furnishing did not clear its selection"
      : "",
    !firstClickState.armed
      || !firstClickState.released
      || !firstClickState.moved
      ? "The furnishing was not selected and dragged in the first interaction"
      : "",
    !pulseIsSubtle
      ? "The selected furnishing outline was not clearly highlighted in red"
      : "",
    errors.length > 0 ? `Browser errors: ${errors.join(" | ")}` : "",
  ].filter(Boolean);

  if (failures.length > 0) {
    throw new Error(failures.join("\n"));
  }
  process.stdout.write(
    "Furnishing selection smoke passed: first-hit select, drag, highlight, and clear.\n",
  );
} finally {
  await page.close();
  await browser.close();
}

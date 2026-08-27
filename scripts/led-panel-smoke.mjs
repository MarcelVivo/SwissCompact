import { chromium } from "playwright-core";

const executablePath =
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const baseURL =
  process.env.SWISSCOMPACT_BASE_URL ?? "http://127.0.0.1:5177/";
const browser = await chromium.launch({ executablePath, headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];

page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});
page.on("pageerror", (error) => errors.push(error.message));
await page.goto(baseURL, { waitUntil: "domcontentloaded", timeout: 30_000 });
await page.evaluate(() => {
  sessionStorage.clear();
  document.querySelector("[data-showroom]")?.scrollIntoView({
    block: "start",
    behavior: "instant",
  });
});
await page.reload({ waitUntil: "domcontentloaded" });
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

const click = async (selector) => {
  await page.locator(selector).first().evaluate((button) => button.click());
  await page.waitForTimeout(90);
};
const openFirstDisplay = async () => {
  const tool = page.locator('[data-showroom-focus-tool="display"]');
  const active = await tool.evaluate((button) => (
    button.classList.contains("is-active")
  ));
  const browserOpen = await page.locator(
    "[data-showroom-focus-browser]",
  ).evaluate((panel) => panel.classList.contains("is-open"));
  if (!active || !browserOpen) await click(
    '[data-showroom-focus-tool="display"]',
  );
  await page.waitForFunction(() => (
    document.querySelector(
      '[data-showroom-selection-item^="display:"]',
    ) !== null
  ));
  await page.locator(
    '[data-showroom-selection-item^="display:"]',
  ).first().evaluate((button) => button.click());
  await page.waitForTimeout(100);
};
const resetScale = async () => {
  const button = page.locator(
    ".showroom-focus-inspector [data-showroom-display-scale-reset]",
  ).first();
  if (!(await button.isDisabled())) {
    await button.evaluate((element) => element.click());
    await page.waitForFunction(() => (
      document.querySelector("[data-showroom]")?.getAttribute(
        "data-showroom-selected-display-width-scale",
      ) === "1.00"
    ));
  }
};
const growSelectedDisplay = async () => {
  await page.waitForFunction(() => Boolean(
    document.querySelector("[data-showroom]")?.getAttribute(
      "data-showroom-display-resize-screen-x",
    ),
  ));
  const points = await page.evaluate(() => {
    const root = document.querySelector("[data-showroom]");
    const canvas = document.querySelector("[data-showroom-canvas]");
    if (!(canvas instanceof HTMLCanvasElement)) {
      throw new Error("Showroom canvas is missing");
    }
    document.querySelectorAll(
      "[data-showroom-focus-browser], [data-showroom-focus-inspector]",
    ).forEach((element) => {
      element.style.pointerEvents = "none";
    });
    const bounds = canvas.getBoundingClientRect();
    const centreX = Number(
      root?.getAttribute("data-showroom-display-screen-x"),
    );
    const centreY = Number(
      root?.getAttribute("data-showroom-display-screen-y"),
    );
    const handleX = Number(
      root?.getAttribute("data-showroom-display-resize-screen-x"),
    );
    const handleY = Number(
      root?.getAttribute("data-showroom-display-resize-screen-y"),
    );
    return {
      startX: bounds.left + handleX,
      startY: bounds.top + handleY,
      endX: bounds.left + centreX + (handleX - centreX) * 1.35,
      endY: bounds.top + centreY + (handleY - centreY) * 1.35,
    };
  });
  await page.evaluate(({ startX, startY, endX, endY }) => {
    const canvas = document.querySelector("[data-showroom-canvas]");
    const dispatch = (
      type,
      clientX,
      clientY,
      buttons,
    ) => canvas?.dispatchEvent(new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      pointerId: 51,
      pointerType: "mouse",
      button: 0,
      buttons,
      clientX,
      clientY,
    }));
    dispatch("pointerdown", startX, startY, 1);
    dispatch("pointermove", endX, endY, 1);
    dispatch("pointerup", endX, endY, 0);
  }, points);
  await page.evaluate(() => {
    document.querySelectorAll(
      "[data-showroom-focus-browser], [data-showroom-focus-inspector]",
    ).forEach((element) => {
      element.style.pointerEvents = "";
    });
  });
  await page.waitForFunction(() => (
    Number(document.querySelector("[data-showroom]")?.getAttribute(
      "data-showroom-selected-display-width-scale",
    )) > 1
  ));
};
const state = async () => page.evaluate(() => {
  const root = document.querySelector("[data-showroom]");
  return {
    preset: root?.getAttribute("data-showroom-preset"),
    preference: root?.getAttribute(
      "data-showroom-selected-display-technology-preference",
    ),
    technology: root?.getAttribute(
      "data-showroom-selected-display-technology",
    ),
    automatic: root?.getAttribute(
      "data-showroom-selected-display-automatic-led",
    ),
    diagonal: Number(root?.getAttribute(
      "data-showroom-selected-display-diagonal-inches",
    )),
    widthCm: Number(root?.getAttribute(
      "data-showroom-selected-display-width-cm",
    )),
    heightCm: Number(root?.getAttribute(
      "data-showroom-selected-display-height-cm",
    )),
    moduleColumns: Number(root?.getAttribute(
      "data-showroom-selected-led-module-columns",
    )),
    moduleRows: Number(root?.getAttribute(
      "data-showroom-selected-led-module-rows",
    )),
    moduleCount: Number(root?.getAttribute(
      "data-showroom-selected-led-module-count",
    )),
    badge: document.querySelector(
      "[data-showroom-display-technology-badge]",
    )?.textContent?.trim(),
    detail: document.querySelector(
      "[data-showroom-display-technology-detail]",
    )?.textContent?.trim(),
    displayChoiceDisabled: document.querySelector(
      '[data-showroom-display-technology="display"]',
    )?.disabled,
  };
});

await openFirstDisplay();
await click('[data-showroom-display-technology="auto"]');
await click('[data-showroom-setting="displaySize"][data-value="75"]');
await resetScale();
const atThreshold = await state();
await growSelectedDisplay();
const aboveThreshold = await state();
await page.screenshot({
  path: "/tmp/swisscompact-led-panel-auto.png",
  fullPage: false,
});

const sizeStates = [];
for (const size of [22, 24, 27, 32, 55, 65, 75]) {
  await click(`[data-showroom-setting="displaySize"][data-value="${size}"]`);
  await resetScale();
  await click('[data-showroom-display-technology="led"]');
  sizeStates.push({ size, ...await state() });
}

const presetValues = await page.locator(
  "[data-showroom-setting=\"preset\"]",
).evaluateAll((buttons) => (
  [...new Set(buttons.map((button) => button.dataset.value).filter(Boolean))]
));
const presetStates = [];
for (const preset of presetValues) {
  await page.locator(
    `[data-showroom-setting="preset"][data-value="${preset}"]`,
  ).first().evaluate((button) => button.click());
  await page.waitForTimeout(170);
  await openFirstDisplay();
  await click('[data-showroom-display-technology="led"]');
  presetStates.push(await state());
}

const valid =
  errors.length === 0
  && atThreshold.technology === "display"
  && atThreshold.automatic === "false"
  && atThreshold.diagonal === 75
  && aboveThreshold.technology === "led"
  && aboveThreshold.automatic === "true"
  && aboveThreshold.diagonal > 75
  && aboveThreshold.moduleCount > 0
  && aboveThreshold.badge === "LED"
  && aboveThreshold.detail?.includes("Automatisch")
  && aboveThreshold.displayChoiceDisabled
  && sizeStates.every((item) => (
    item.technology === "led"
    && item.preference === "led"
    && item.moduleColumns > 0
    && item.moduleRows > 0
    && item.moduleCount === item.moduleColumns * item.moduleRows
    && item.widthCm % 25 === 0
    && item.heightCm % 25 === 0
  ))
  && presetValues.length === 36
  && presetStates.length === 36
  && presetStates.every((item) => (
    item.technology === "led"
    && item.moduleCount > 0
    && item.badge === "LED"
  ));

console.log(JSON.stringify({
  valid,
  atThreshold,
  aboveThreshold,
  sizeStates,
  presetStates,
  errors,
}, null, 2));

await browser.close();
if (!valid) process.exitCode = 1;

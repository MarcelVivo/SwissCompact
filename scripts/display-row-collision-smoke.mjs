import { chromium } from "playwright-core";

const executablePath =
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const baseURL =
  process.env.SWISSCOMPACT_BASE_URL ?? "http://127.0.0.1:4173/";
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
    const button = page.locator(selector).first();
    await button.evaluate((element) => element.click());
    await page.waitForTimeout(80);
  };
  const checkpoint = async (label) => page.evaluate((name) => {
    const root = document.querySelector("[data-showroom]");
    return {
      label: name,
      wall: root?.getAttribute("data-showroom-selected-wall") ?? "",
      count: Number(root?.getAttribute("data-showroom-display-count")),
      overlaps: Number(root?.getAttribute(
        "data-showroom-display-row-overlaps",
      )),
      verticalOffsets: Number(root?.getAttribute(
        "data-showroom-display-row-vertical-offsets",
      )),
      layoutAvailable:
        root?.getAttribute("data-showroom-layout-available") ?? "",
      positions:
        root?.getAttribute("data-showroom-display-unit-positions") ?? "",
    };
  }, label);

  const states = [];
  await click(
    '[data-showroom-setting="preset"][data-value="restaurant"]',
  );
  await click('[data-showroom-setting="wall"][data-value="menu"]');
  for (let index = 0; index < 7; index += 1) {
    await click('[data-showroom-count="1"]');
  }
  states.push(await checkpoint("six menu displays"));

  for (const size of ["75", "22", "65"]) {
    await click(
      `[data-showroom-setting="displaySize"][data-value="${size}"]`,
    );
    states.push(await checkpoint(`menu size ${size}`));
  }
  for (const orientation of ["portrait", "landscape"]) {
    await click(
      `[data-showroom-setting="orientation"][data-value="${orientation}"]`,
    );
    states.push(await checkpoint(`menu ${orientation}`));
  }
  for (const roomSize of ["xs", "compact", "standard", "small"]) {
    await click(
      `[data-showroom-setting="roomSize"][data-value="${roomSize}"]`,
    );
    states.push(await checkpoint(`room ${roomSize}`));
  }

  await click('[data-showroom-setting="wall"][data-value="counterFront"]');
  for (let index = 0; index < 7; index += 1) {
    await click('[data-showroom-count="1"]');
  }
  await click(
    '[data-showroom-setting="displaySize"][data-value="75"]',
  );
  states.push(await checkpoint("counter front maximum"));

  await click('[data-showroom-totem-setup="ceilingColumn"]');
  for (let index = 0; index < 4; index += 1) {
    await click('[data-showroom-count="1"]');
  }
  states.push(await checkpoint("column faces"));

  const controls = await page.evaluate(() => ({
    invalidLayouts: Array.from(document.querySelectorAll(
      '[data-showroom-setting="layout"], [data-showroom-object-layout]',
    )).filter((element) => {
      const button = element;
      const value =
        button.getAttribute("data-value")
        ?? button.getAttribute("data-showroom-object-layout");
      return value !== "row"
        && (!button.hidden || !button.disabled);
    }).length,
    visibleRowControls: Array.from(document.querySelectorAll(
      "[data-showroom-structure-rows], [data-showroom-direct-rows]",
    )).filter((element) => !element.hidden).length,
  }));

  const valid =
    errors.length === 0
    && states.length > 0
    && states.every((state) => (
      state.overlaps === 0
      && state.verticalOffsets === 0
      && state.layoutAvailable === "false"
    ))
    && controls.invalidLayouts === 0
    && controls.visibleRowControls === 0;

  console.log(JSON.stringify({
    valid,
    errors,
    controls,
    states,
  }, null, 2));
  if (!valid) process.exitCode = 1;
} finally {
  await page.close();
  await browser.close();
}

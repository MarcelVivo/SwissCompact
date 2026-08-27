import { chromium } from "playwright-core";

const executablePath =
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const baseURL =
  process.env.SWISSCOMPACT_BASE_URL ?? "http://127.0.0.1:5173/";
const browser = await chromium.launch({ executablePath, headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
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
  await page.locator("[data-showroom-themes-toggle]").first().click();
  await page.locator("[data-showroom-theme-option=\"culture\"]").click();

  const results = [];
  const presetFilter = process.env.CULTURE_PRESET;
  const wallFilter = process.env.CULTURE_STRUCTURE;
  for (const preset of ["cinema", "museum", "eventHall"].filter(
    (value) => !presetFilter || value === presetFilter,
  )) {
    await page.locator(
      `[data-showroom-setting="preset"][data-value="${preset}"]`,
    ).first().evaluate((button) => button.click());
    await page.waitForFunction((expected) => (
      document.querySelector("[data-showroom]")?.getAttribute(
        "data-showroom-preset",
      ) === expected
    ), preset);
    for (const setup of [
      { wall: "totem", variant: "midColumn" },
      { wall: "stele", variant: "midStele" },
    ].filter((value) => !wallFilter || value.wall === wallFilter)) {
      await page.locator(
        `[data-showroom-totem-setup="${setup.variant}"]`,
      ).first().evaluate((button) => button.click());
      await page.waitForFunction((wall) => {
        const showroom = document.querySelector("[data-showroom]");
        const x = showroom?.getAttribute("data-showroom-display-screen-x");
        const y = showroom?.getAttribute("data-showroom-display-screen-y");
        return showroom?.getAttribute("data-showroom-selected-wall") === wall
          && Number.isFinite(Number(x))
          && Number.isFinite(Number(y));
      }, setup.wall);
      await page.waitForTimeout(420);
      const point = await page.evaluate(() => {
        const showroom = document.querySelector("[data-showroom]");
        const canvas = document.querySelector("[data-showroom-canvas]");
        if (!(canvas instanceof HTMLCanvasElement)) {
          throw new Error("Showroom canvas is missing");
        }
        const bounds = canvas.getBoundingClientRect();
        return {
          x: bounds.left + Number(
            showroom?.getAttribute("data-showroom-display-screen-x"),
          ),
          y: bounds.top + Number(
            showroom?.getAttribute("data-showroom-display-screen-y"),
          ),
        };
      });
      await page.mouse.click(point.x, point.y);
      await page.waitForFunction((wall) => (
        document.querySelector("[data-showroom]")?.getAttribute(
          "data-showroom-selected-structure",
        ) === wall
      ), setup.wall, { timeout: 10_000 });
      const before = await page.evaluate(() => {
        const showroom = document.querySelector("[data-showroom]");
        return {
          x: Number(showroom?.getAttribute("data-showroom-structure-x")),
          z: Number(showroom?.getAttribute("data-showroom-structure-z")),
        };
      });
      await page.mouse.move(point.x, point.y);
      await page.mouse.down();
      await page.mouse.move(point.x + 84, point.y - 24, { steps: 10 });
      await page.mouse.up();
      await page.waitForTimeout(180);
      const after = await page.evaluate(() => {
        const showroom = document.querySelector("[data-showroom]");
        return {
          x: Number(showroom?.getAttribute("data-showroom-structure-x")),
          z: Number(showroom?.getAttribute("data-showroom-structure-z")),
        };
      });
      results.push({
        preset,
        wall: setup.wall,
        moved:
          Math.hypot(after.x - before.x, after.z - before.z) > 0.08,
        before,
        after,
      });
    }
  }

  const valid =
    errors.length === 0
    && results.length === (
      (presetFilter ? 1 : 3) * (wallFilter ? 1 : 2)
    )
    && results.every((result) => result.moved);
  console.log(JSON.stringify({ valid, results, errors }, null, 2));
  if (!valid) process.exitCode = 1;
} finally {
  await browser.close();
}

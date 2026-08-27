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

  const states = [];
  const capture = async (preset) => {
    await page.waitForTimeout(1400);
    await page.screenshot({
      path: `/tmp/swisscompact-contrast-${preset}.png`,
      fullPage: false,
    });
    states.push(await page.evaluate(() => {
      const showroom = document.querySelector("[data-showroom]");
      return {
        preset: showroom?.getAttribute("data-showroom-preset"),
        light: showroom?.querySelector(
          "[data-showroom-navbar-value=\"light\"]",
        )?.textContent,
        contrast:
          showroom?.getAttribute("data-showroom-lighting-contrast"),
        ready: showroom?.getAttribute("data-showroom-ready"),
      };
    }));
  };

  await page.locator(
    "[data-showroom-setting=\"preset\"][data-value=\"restaurant\"]",
  ).first().evaluate((button) => button.click());
  await capture("restaurant");

  await page.locator(
    "[data-showroom-setting=\"preset\"][data-value=\"cafe\"]",
  ).first().evaluate((button) => button.click());
  await capture("cafe");

  await page.locator("[data-showroom-themes-toggle]").first().click();
  await page.locator("[data-showroom-theme-option=\"beauty\"]").click();
  await page.waitForFunction(() => (
    document.querySelector("[data-showroom]")?.getAttribute(
      "data-showroom-preset",
    ) === "barber"
  ));
  await capture("barber");

  const valid =
    states.map((state) => state.preset).join(",")
      === "restaurant,cafe,barber"
    && states.every((state) => (
      state.ready === "true" && state.contrast === "high"
    ))
    && errors.length === 0;
  console.log(JSON.stringify({ valid, states, errors }, null, 2));
  if (!valid) process.exitCode = 1;
} finally {
  await browser.close();
}

import { chromium } from "playwright-core";

const executablePath =
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const baseURL = process.env.SWISSCOMPACT_BASE_URL
  ?? "http://127.0.0.1:5173/";
const browser = await chromium.launch({ executablePath, headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});
page.on("pageerror", (error) => errors.push(error.message));

await page.goto(baseURL, { waitUntil: "domcontentloaded", timeout: 30_000 });
await page.evaluate(() => {
  document.querySelector("[data-showroom]")?.scrollIntoView({
    block: "start",
    behavior: "instant",
  });
});
await page.waitForFunction(() => (
  document.querySelector("[data-showroom]")?.getAttribute(
    "data-showroom-ready"
  ) === "true"
), undefined, { timeout: 45_000 });

const root = page.locator("[data-showroom]");
const initial = {
  columns: Number(await root.getAttribute("data-showroom-totem-count")),
  steles: Number(await root.getAttribute("data-showroom-stele-count")),
};

await page.locator('[data-showroom-focus-tool="column"]').click();
await page.waitForTimeout(80);
const columnPalette = await page.evaluate(() => ({
  activeTool: document.querySelector(
    "[data-showroom-focus-tool].is-active"
  )?.getAttribute("data-showroom-focus-tool"),
  panelVisible: !document.querySelector(
    "[data-showroom-structure-create-panel]"
  )?.hasAttribute("hidden"),
  choices: Array.from(document.querySelectorAll(
    '[data-showroom-structure-create][data-showroom-structure-kind="totem"]'
  )).filter((item) => !item.hasAttribute("hidden")).length,
}));
await page.locator(
  '[data-showroom-structure-create="midColumn"]'
).click();
await page.waitForTimeout(160);
const afterColumn = {
  count: Number(await root.getAttribute("data-showroom-totem-count")),
  selected: await root.getAttribute("data-showroom-selected-structure"),
  index: Number(await root.getAttribute(
    "data-showroom-selected-structure-index"
  )),
};

await page.locator('[data-showroom-focus-tool="stele"]').click();
await page.waitForTimeout(80);
const stelePalette = await page.evaluate(() => ({
  activeTool: document.querySelector(
    "[data-showroom-focus-tool].is-active"
  )?.getAttribute("data-showroom-focus-tool"),
  panelVisible: !document.querySelector(
    "[data-showroom-structure-create-panel]"
  )?.hasAttribute("hidden"),
  choices: Array.from(document.querySelectorAll(
    '[data-showroom-structure-create][data-showroom-structure-kind="stele"]'
  )).filter((item) => !item.hasAttribute("hidden")).length,
}));
await page.locator(
  '[data-showroom-structure-create="midStele"]'
).click();
await page.waitForTimeout(160);
const afterStele = {
  count: Number(await root.getAttribute("data-showroom-stele-count")),
  selected: await root.getAttribute("data-showroom-selected-structure"),
  index: Number(await root.getAttribute(
    "data-showroom-selected-structure-index"
  )),
};

await page.screenshot({
  path: "/tmp/swisscompact-structure-create-tools.png",
  fullPage: false,
});

const valid = errors.length === 0
  && columnPalette.activeTool === "column"
  && columnPalette.panelVisible
  && columnPalette.choices === 3
  && afterColumn.count === initial.columns + 1
  && afterColumn.selected === "totem"
  && afterColumn.index === initial.columns
  && stelePalette.activeTool === "stele"
  && stelePalette.panelVisible
  && stelePalette.choices === 3
  && afterStele.count === initial.steles + 1
  && afterStele.selected === "stele"
  && afterStele.index === initial.steles;

console.log(JSON.stringify({
  valid,
  initial,
  columnPalette,
  afterColumn,
  stelePalette,
  afterStele,
  errors,
}, null, 2));

await browser.close();
if (!valid) process.exitCode = 1;

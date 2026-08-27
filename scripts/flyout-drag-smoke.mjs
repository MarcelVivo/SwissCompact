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

await page.goto(baseURL, { waitUntil: "domcontentloaded", timeout: 30_000 });
await page.locator("[data-marketing-target=\"#wirkung\"]").first().click();
await page.waitForTimeout(500);
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
  "[data-showroom-setting=\"wall\"][data-value=\"menu\"]",
).first().evaluate((button) => button.click());
const displayMenu = page.locator(".showroom-edge-menu--displays");
await displayMenu.locator("[data-showroom-edge-trigger]").evaluate(
  (button) => button.click(),
);
const edgeDisplayPanel = displayMenu.locator(
  "[data-showroom-edge-display-panel]",
);
await edgeDisplayPanel.waitFor({ state: "visible" });
const edgePanelBefore = await edgeDisplayPanel.boundingBox();
const edgePanelHeader = await edgeDisplayPanel.locator(
  "[data-showroom-flyout-drag-handle]",
).boundingBox();
if (!edgePanelBefore || !edgePanelHeader) {
  throw new Error("Kompaktes Display-Panel ist nicht sichtbar.");
}
await page.mouse.move(
  edgePanelHeader.x + 100,
  edgePanelHeader.y + edgePanelHeader.height * 0.55,
);
await page.mouse.down();
await page.mouse.move(
  edgePanelHeader.x - 50,
  edgePanelHeader.y - 55,
  { steps: 8 },
);
await page.mouse.up();
const edgePanelAfter = await edgeDisplayPanel.boundingBox();
const edgePanelState = await page.evaluate(() => {
  const panel = document.querySelector("[data-showroom-edge-display-panel]");
  const stage = document.querySelector("[data-showroom-stage]")
    ?.getBoundingClientRect();
  const bounds = panel?.getBoundingClientRect();
  return {
    positioned: panel?.classList.contains("is-user-positioned") ?? false,
    compact: Boolean(bounds && bounds.width <= 420),
    contained: Boolean(
      bounds
      && stage
      && bounds.left >= stage.left
      && bounds.right <= stage.right
      && bounds.top >= stage.top
      && bounds.bottom <= stage.bottom
    ),
  };
});
await page.screenshot({
  path: "/tmp/swisscompact-display-panel.png",
  fullPage: false,
});
await edgeDisplayPanel.locator("[data-showroom-edge-display-close]").click();
const edgePanelClosed = !await displayMenu.evaluate(
  (menu) => menu.classList.contains("is-open"),
);
await displayMenu.locator("[data-showroom-edge-trigger]").evaluate(
  (button) => button.click(),
);
await displayMenu.locator(
  "[data-showroom-select-display=\"0\"]",
).evaluate((button) => button.click());
await page.evaluate(() => {
  document.querySelector("[data-showroom]")?.scrollIntoView({
    block: "start",
    behavior: "instant",
  });
  document.querySelector(".showroom-edge-menu--displays")
    ?.classList.remove("is-open");
});
await page.waitForTimeout(500);

const displayFlyout = page.locator("[data-showroom-display-flyout]");
const displayHeader = displayFlyout.locator(
  "[data-showroom-flyout-drag-handle]",
);
const displayBefore = await displayFlyout.boundingBox();
const displayHeaderBounds = await displayHeader.boundingBox();
if (!displayBefore || !displayHeaderBounds) {
  throw new Error("Display-Flyout ist nicht sichtbar.");
}
await page.mouse.move(
  displayHeaderBounds.x + 70,
  displayHeaderBounds.y + displayHeaderBounds.height * 0.55,
);
await page.mouse.down();
await page.mouse.move(
  displayHeaderBounds.x + 230,
  displayHeaderBounds.y + displayHeaderBounds.height * 0.55 + 90,
  { steps: 8 },
);
await page.mouse.up();
const displayAfter = await displayFlyout.boundingBox();

await displayFlyout.locator(
  "[data-showroom-setting=\"orientation\"][data-value=\"portrait\"]",
).evaluate((button) => button.click());
const displayState = await page.evaluate(() => {
  const flyout = document.querySelector("[data-showroom-display-flyout]");
  const stage = document.querySelector("[data-showroom-stage]")
    ?.getBoundingClientRect();
  const bounds = flyout?.getBoundingClientRect();
  return {
    positioned: flyout?.classList.contains("is-user-positioned") ?? false,
    dragging:
      document.querySelector("[data-showroom]")?.classList.contains(
        "is-flyout-dragging",
      ) ?? false,
    portraitActive:
      flyout?.querySelector(
        "[data-showroom-setting=\"orientation\"][data-value=\"portrait\"]",
      )?.classList.contains("is-active") ?? false,
    contained: Boolean(
      bounds
      && stage
      && bounds.left >= stage.left
      && bounds.right <= stage.right
      && bounds.top >= stage.top
      && bounds.bottom <= stage.bottom
    ),
  };
});

await displayFlyout.locator(
  "[data-showroom-display-flyout-close]",
).click();
await page.locator(
  "[data-showroom-object-nav=\"menu\"]",
).evaluate((button) => button.click());
const objectFlyout = page.locator("[data-showroom-object-flyout]");
await objectFlyout.waitFor({ state: "visible" });
const objectBefore = await objectFlyout.boundingBox();
const objectHeaderBounds = await objectFlyout.locator(
  "[data-showroom-flyout-drag-handle]",
).boundingBox();
if (!objectBefore || !objectHeaderBounds) {
  throw new Error("Objekt-Flyout ist nicht sichtbar.");
}
await page.mouse.move(
  objectHeaderBounds.x + 70,
  objectHeaderBounds.y + objectHeaderBounds.height * 0.55,
);
await page.mouse.down();
await page.mouse.move(
  objectHeaderBounds.x - 100,
  objectHeaderBounds.y + objectHeaderBounds.height * 0.55 + 75,
  { steps: 8 },
);
await page.mouse.up();
const objectAfter = await objectFlyout.boundingBox();
const countBefore = Number(
  await objectFlyout.locator("[data-showroom-object-count-output]")
    .textContent(),
);
await objectFlyout.locator("[data-showroom-object-count=\"1\"]").click();
const countAfter = Number(
  await objectFlyout.locator("[data-showroom-object-count-output]")
    .textContent(),
);
const objectState = await page.evaluate(() => {
  const flyout = document.querySelector("[data-showroom-object-flyout]");
  const stage = document.querySelector("[data-showroom-stage]")
    ?.getBoundingClientRect();
  const bounds = flyout?.getBoundingClientRect();
  return {
    positioned: flyout?.classList.contains("is-user-positioned") ?? false,
    contained: Boolean(
      bounds
      && stage
      && bounds.left >= stage.left
      && bounds.right <= stage.right
      && bounds.top >= stage.top
      && bounds.bottom <= stage.bottom
    ),
  };
});

await page.screenshot({
  path: "/tmp/swisscompact-movable-flyouts.png",
  fullPage: false,
});
await browser.close();

const displayMoved = Boolean(
  displayAfter
  && Math.hypot(
    displayAfter.x - displayBefore.x,
    displayAfter.y - displayBefore.y,
  ) > 80,
);
const edgePanelMoved = Boolean(
  edgePanelAfter
  && Math.hypot(
    edgePanelAfter.x - edgePanelBefore.x,
    edgePanelAfter.y - edgePanelBefore.y,
  ) > 80,
);
const objectMoved = Boolean(
  objectAfter
  && Math.hypot(
    objectAfter.x - objectBefore.x,
    objectAfter.y - objectBefore.y,
  ) > 80,
);
const valid = errors.length === 0
  && edgePanelMoved
  && edgePanelState.positioned
  && edgePanelState.compact
  && edgePanelState.contained
  && edgePanelClosed
  && displayMoved
  && displayState.positioned
  && !displayState.dragging
  && displayState.portraitActive
  && displayState.contained
  && objectMoved
  && objectState.positioned
  && objectState.contained
  && countAfter === countBefore + 1;

console.log(JSON.stringify({
  valid,
  errors,
  edgePanelMoved,
  edgePanelState,
  edgePanelClosed,
  displayMoved,
  displayState,
  objectMoved,
  objectState,
  countBefore,
  countAfter,
}, null, 2));
if (!valid) process.exitCode = 1;

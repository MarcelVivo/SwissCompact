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

const ready = async () => {
  try {
    await page.waitForFunction(() => (
      document.querySelector("[data-showroom]")?.getAttribute("data-showroom-ready") === "true"
    ), undefined, { timeout: 45_000 });
  } catch (error) {
    console.error(JSON.stringify({
      readyFailure: true,
      errors,
      state: await page.evaluate(() => ({
        ready: document.querySelector("[data-showroom]")
          ?.getAttribute("data-showroom-ready"),
        loading: document.querySelector("[data-showroom-loading]")
          ?.textContent?.replace(/\s+/g, " ").trim(),
      })),
    }, null, 2));
    throw error;
  }
};

try {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem("swisscompact-partition-create-ready")) {
      localStorage.removeItem("swisscompact-showroom-saved-rooms");
      sessionStorage.setItem("swisscompact-partition-create-ready", "true");
    }
  });
  await page.goto(baseURL, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.evaluate(() => {
    document.querySelector("[data-showroom]")?.scrollIntoView({ block: "start" });
  });
  await ready();
  await page.locator(
    '[data-showroom-setting="preset"][data-value="cafe"]',
  ).first().evaluate((button) => button.click());
  await page.waitForTimeout(200);
  await page.locator('[data-showroom-focus-tool="partition"]').click();
  await page.waitForFunction(() => (
    !document.querySelector("[data-showroom-partition-create-panel]")
      ?.hasAttribute("hidden")
  ));

  const before = await page.evaluate(() => ({
    activeTool: document.querySelector("[data-showroom]")
      ?.getAttribute("data-showroom-active-tool"),
    availableText: document.querySelector("[data-showroom-partition-create-status]")
      ?.textContent?.trim(),
    listCount: document.querySelectorAll(
      '[data-showroom-selection-item^="partition:"]',
    ).length,
    buttonEnabled: !(document.querySelector(
      "[data-showroom-partition-create]",
    )?.hasAttribute("disabled")),
    mountCount: document.querySelector("[data-showroom]")
      ?.getAttribute("data-showroom-partition-mount-count"),
  }));

  await page.locator("[data-showroom-partition-create]").click();
  await page.waitForFunction(() => (
    document.querySelector("[data-showroom]")
      ?.getAttribute("data-showroom-last-created-partition")
  ));
  const first = await page.evaluate(() => ({
    id: document.querySelector("[data-showroom]")
      ?.getAttribute("data-showroom-last-created-partition"),
    mountCount: document.querySelector("[data-showroom]")
      ?.getAttribute("data-showroom-partition-mount-count"),
    selected: document.querySelector("[data-showroom]")
      ?.getAttribute("data-showroom-selected-furnishing"),
    availableText: document.querySelector("[data-showroom-partition-create-status]")
      ?.textContent?.trim(),
  }));

  await page.locator("[data-showroom-partition-create]").click();
  await page.waitForFunction(() => (
    document.querySelector("[data-showroom]")
      ?.getAttribute("data-showroom-partition-mount-count") === "2"
  ));
  const second = await page.evaluate(() => ({
    id: document.querySelector("[data-showroom]")
      ?.getAttribute("data-showroom-last-created-partition"),
    mountCount: document.querySelector("[data-showroom]")
      ?.getAttribute("data-showroom-partition-mount-count"),
    createDisabled: document.querySelector("[data-showroom-partition-create]")
      ?.hasAttribute("disabled"),
    status: document.querySelector("[data-showroom-partition-create-status]")
      ?.textContent?.trim(),
    visiblePartitionItems: Array.from(document.querySelectorAll(
      '[data-showroom-selection-item^="partition:"]',
    )).filter((item) => !item.textContent?.includes("Ausgeblendet")).length,
  }));

  await page.locator("[data-showroom-room-save]").click();
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    document.querySelector("[data-showroom]")?.scrollIntoView({ block: "start" });
  });
  await ready();
  const persisted = await page.evaluate(() => ({
    preset: document.querySelector("[data-showroom]")
      ?.getAttribute("data-showroom-preset"),
    mountCount: document.querySelector("[data-showroom]")
      ?.getAttribute("data-showroom-partition-mount-count"),
    visibleStates: Object.entries(JSON.parse(
      localStorage.getItem("swisscompact-showroom-saved-rooms") ?? "{}",
    ).rooms?.cafe?.furnishings ?? {})
      .filter(([id, state]) => id.includes("modular-partition") && state.visible)
      .length,
  }));

  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('[data-showroom-focus-tool="partition"]').click();
  await page.waitForTimeout(180);
  const mobile = await page.evaluate(() => {
    const panel = document.querySelector("[data-showroom-partition-create-panel]");
    const rect = panel?.getBoundingClientRect();
    return {
      visible: panel instanceof HTMLElement
        && getComputedStyle(panel).display !== "none",
      insideViewport: Boolean(rect && rect.left >= 0 && rect.right <= innerWidth),
      noHorizontalOverflow: document.documentElement.scrollWidth <= innerWidth,
    };
  });
  await page.screenshot({
    path: "/tmp/swisscompact-partition-create-mobile.png",
    fullPage: false,
  });

  const valid = errors.length === 0
    && before.activeTool === "partition"
    && before.listCount === 2
    && before.buttonEnabled
    && before.availableText?.includes("2 Trennwände")
    && first.id?.includes("modular-partition-cafe-1")
    && first.mountCount === "1"
    && first.selected === first.id
    && first.availableText?.includes("1 Trennwand")
    && second.id?.includes("modular-partition-cafe-2")
    && second.mountCount === "2"
    && second.createDisabled
    && second.status?.includes("Maximal zwei")
    && second.visiblePartitionItems === 2
    && persisted.preset === "cafe"
    && persisted.mountCount === "2"
    && persisted.visibleStates === 2
    && mobile.visible
    && mobile.insideViewport
    && mobile.noHorizontalOverflow;
  console.log(JSON.stringify({
    valid,
    before,
    first,
    second,
    persisted,
    mobile,
    errors,
  }, null, 2));
  if (!valid) process.exitCode = 1;
} finally {
  await browser.close();
}

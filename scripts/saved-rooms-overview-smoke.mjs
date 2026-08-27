import { chromium } from "playwright-core";

const executablePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const baseURL = process.env.SWISSCOMPACT_BASE_URL ?? "http://127.0.0.1:4180/";
const browser = await chromium.launch({ executablePath, headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await context.addInitScript(() => {
  if (!sessionStorage.getItem("swisscompact-saved-rooms-test-ready")) {
    localStorage.removeItem("swisscompact-showroom-saved-rooms");
    sessionStorage.setItem("swisscompact-saved-rooms-test-ready", "true");
  }
});
const page = await context.newPage();
const errors = [];
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});
page.on("pageerror", (error) => errors.push(error.message));

const waitForShowroom = async () => {
  await page.waitForFunction(() => (
    document.querySelector("[data-showroom]")?.getAttribute("data-showroom-ready") === "true"
  ), undefined, { timeout: 45_000 });
};

const selectRoom = async (preset) => {
  await page.locator(
    `[data-showroom-setting="preset"][data-value="${preset}"]`,
  ).first().evaluate((button) => button.click());
  await page.waitForTimeout(180);
};

const saveRoom = async () => {
  await page.locator("[data-showroom-room-save]").click();
  await page.waitForTimeout(220);
};

try {
  await page.goto(baseURL, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.evaluate(() => {
    document.querySelector("[data-showroom]")?.scrollIntoView({
      block: "start",
      behavior: "instant",
    });
  });
  await waitForShowroom();

  await selectRoom("restaurant");
  await saveRoom();
  await selectRoom("cafe");
  await saveRoom();

  const storageAfterSave = await page.evaluate(() => {
    const payload = JSON.parse(
      localStorage.getItem("swisscompact-showroom-saved-rooms") ?? "{}",
    );
    return {
      version: payload.version,
      count: payload.entries?.length ?? 0,
      ids: payload.entries?.map((entry) => entry.id) ?? [],
      previewCount: payload.entries?.filter(
        (entry) => typeof entry.preview === "string"
          && entry.preview.startsWith("data:image/jpeg"),
      ).length ?? 0,
    };
  });

  await page.locator("[data-showroom-saved-rooms-open]").click();
  await page.waitForFunction(() => (
    !document.querySelector("[data-showroom-saved-rooms-panel]")?.hasAttribute("hidden")
  ));
  const overview = await page.evaluate(() => ({
    cardCount: document.querySelectorAll("[data-showroom-saved-room-card]").length,
    countBadge: document.querySelector("[data-showroom-saved-rooms-count]")?.textContent,
    summaryText: document.querySelector("[data-showroom-saved-rooms-summary]")
      ?.textContent?.replace(/\s+/g, " ").trim(),
    thumbnailCount: document.querySelectorAll(
      ".showroom-saved-room-card__visual img",
    ).length,
  }));
  await page.screenshot({
    path: "/tmp/swisscompact-meine-raeume-desktop.png",
    fullPage: false,
  });

  await page.locator('[data-showroom-saved-room-duplicate="restaurant"]').click();
  await page.waitForFunction(() => (
    document.querySelectorAll("[data-showroom-saved-room-card]").length === 3
  ));
  const duplicateId = await page.evaluate(() => (
    Array.from(document.querySelectorAll("[data-showroom-saved-room-card]"))
      .map((card) => card.getAttribute("data-showroom-saved-room-card"))
      .find((id) => id?.startsWith("restaurant-variant-"))
  ));
  if (duplicateId) {
    await page.locator(
      `[data-showroom-saved-room-delete="${duplicateId}"]`,
    ).click();
  }
  await page.waitForFunction(() => (
    document.querySelectorAll("[data-showroom-saved-room-card]").length === 2
  ));

  await page.locator('[data-showroom-saved-room-open="restaurant"]').click();
  await page.waitForFunction(() => (
    document.querySelector("[data-showroom]")?.getAttribute("data-showroom-preset") === "restaurant"
  ));
  const openResult = await page.locator("[data-showroom]").evaluate((root) => ({
    preset: root.getAttribute("data-showroom-preset"),
    openedId: root.getAttribute("data-showroom-opened-saved-room"),
    panelClosed: document.querySelector("[data-showroom-saved-rooms-panel]")
      ?.hasAttribute("hidden"),
  }));

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    document.querySelector("[data-showroom]")?.scrollIntoView({
      block: "start",
      behavior: "instant",
    });
  });
  await waitForShowroom();
  const persistedPreset = await page.locator("[data-showroom]").getAttribute(
    "data-showroom-preset",
  );
  await page.locator("[data-showroom-saved-rooms-open]").click();
  const persistedCount = await page.locator(
    "[data-showroom-saved-room-card]",
  ).count();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(250);
  const mobile = await page.evaluate(() => {
    const header = document.querySelector("[data-showroom-focus-header]");
    const panel = document.querySelector("[data-showroom-saved-rooms-panel]");
    const headerRect = header?.getBoundingClientRect();
    const panelRect = panel?.getBoundingClientRect();
    return {
      noHorizontalOverflow: document.documentElement.scrollWidth <= innerWidth,
      headerInsideViewport: Boolean(
        headerRect && headerRect.left >= 0 && headerRect.right <= innerWidth,
      ),
      panelInsideViewport: Boolean(
        panelRect
        && panelRect.left >= 0
        && panelRect.right <= innerWidth
        && panelRect.bottom <= innerHeight,
      ),
    };
  });
  await page.screenshot({
    path: "/tmp/swisscompact-meine-raeume-mobile.png",
    fullPage: false,
  });

  await page.locator("[data-showroom-saved-rooms-consult]").click();
  await page.waitForFunction(() => (
    !document.querySelector("[data-journey-consult-panel]")?.hasAttribute("hidden")
  ));
  const consultationOpen = await page.evaluate(() => (
    !document.querySelector("[data-journey-consult-panel]")?.hasAttribute("hidden")
    && Boolean(document.querySelector("[data-journey-lead-form]"))
  ));

  const valid = errors.length === 0
    && storageAfterSave.version === 2
    && storageAfterSave.count === 2
    && storageAfterSave.ids.includes("restaurant")
    && storageAfterSave.ids.includes("cafe")
    && storageAfterSave.previewCount === 2
    && overview.cardCount === 2
    && overview.countBadge === "2"
    && overview.thumbnailCount === 2
    && overview.summaryText?.includes("Displays")
    && overview.summaryText?.includes("LED-Flächen")
    && Boolean(duplicateId)
    && openResult.preset === "restaurant"
    && openResult.openedId === "restaurant"
    && openResult.panelClosed
    && persistedPreset === "restaurant"
    && persistedCount === 2
    && mobile.noHorizontalOverflow
    && mobile.headerInsideViewport
    && mobile.panelInsideViewport
    && consultationOpen;
  console.log(JSON.stringify({
    valid,
    storageAfterSave,
    overview,
    duplicateId,
    openResult,
    persistedPreset,
    persistedCount,
    mobile,
    consultationOpen,
    errors,
  }, null, 2));
  if (!valid) process.exitCode = 1;
} finally {
  await browser.close();
}

import { chromium } from "playwright-core";

const executablePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const baseURL = process.env.SWISSCOMPACT_BASE_URL ?? "http://127.0.0.1:4178/";
const browser = await chromium.launch({ executablePath, headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});
page.on("pageerror", (error) => errors.push(error.message));

const prepare = async (clearStorage = false) => {
  if (clearStorage) {
    await page.addInitScript(() => {
      if (!sessionStorage.getItem("swisscompact-room-save-test-ready")) {
        localStorage.removeItem("swisscompact-showroom-saved-rooms");
        sessionStorage.setItem("swisscompact-room-save-test-ready", "true");
      }
    });
  }
  await page.goto(baseURL, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.evaluate(() => {
    document.querySelector("[data-showroom]")?.scrollIntoView({
      block: "start",
      behavior: "instant",
    });
  });
  await page.waitForFunction(() => (
    document.querySelector("[data-showroom]")?.getAttribute("data-showroom-ready") === "true"
  ), undefined, { timeout: 45_000 });
};

const clickSetting = async (key, value) => {
  await page.locator(
    `[data-showroom-setting="${key}"][data-value="${value}"]`,
  ).first().evaluate((button) => button.click());
  await page.waitForTimeout(140);
};

const readRoom = async () => page.locator("[data-showroom]").evaluate((root) => ({
  preset: root.getAttribute("data-showroom-preset"),
  roomSize: root.getAttribute("data-showroom-room-size"),
  light: root.getAttribute("data-showroom-light"),
  savedPreset: root.getAttribute("data-showroom-saved-preset"),
  saveState: root.getAttribute("data-showroom-save-state"),
}));

try {
  await prepare(true);
  await clickSetting("preset", "restaurant");
  await clickSetting("roomSize", "standard");
  await clickSetting("light", "day");

  const headerPlacement = await page.evaluate(() => {
    const header = document.querySelector("[data-showroom-focus-header]");
    const save = header?.querySelector("[data-showroom-room-save]");
    const reset = header?.querySelector("[data-showroom-room-reset]");
    const saveRect = save?.getBoundingClientRect();
    const resetRect = reset?.getBoundingClientRect();
    return {
      inHeader: Boolean(save),
      nextToReset: Boolean(
        saveRect
        && resetRect
        && saveRect.right <= resetRect.left
        && resetRect.left - saveRect.right < 12
      ),
    };
  });

  await page.locator("[data-showroom-room-save]").click();
  await page.waitForFunction(() => (
    document.querySelector("[data-showroom]")?.getAttribute("data-showroom-save-state") === "saved"
    && !document.querySelector("[data-journey-saved-cta]")?.hasAttribute("hidden")
  ));
  const saved = await readRoom();
  const persisted = await page.evaluate(() => {
    const payload = JSON.parse(
      localStorage.getItem("swisscompact-showroom-saved-rooms") ?? "{}",
    );
    const cta = document.querySelector("[data-journey-saved-cta]");
    const rect = cta?.getBoundingClientRect();
    const ctaStyle = cta instanceof HTMLElement ? getComputedStyle(cta) : null;
    return {
      restaurantSize: payload.rooms?.restaurant?.roomSize,
      restaurantLight: payload.rooms?.restaurant?.light,
      ctaVisible: cta instanceof HTMLElement
        && ctaStyle?.display !== "none"
        && ctaStyle?.visibility !== "hidden"
        && Number(ctaStyle?.opacity) > 0.03
        && (rect?.width ?? 0) > 1,
      ctaDisplay: ctaStyle?.display,
      ctaVisibility: ctaStyle?.visibility,
      ctaOpacity: ctaStyle?.opacity,
      ctaRect: rect ? {
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
      } : null,
      ctaCentered: Boolean(
        rect && Math.abs((rect.left + rect.right) / 2 - innerWidth / 2) < 3
      ),
      ctaInLowerHalf: Boolean(rect && rect.top > innerHeight * 0.5),
      ctaText: cta?.textContent?.replace(/\s+/g, " ").trim(),
    };
  });
  await page.screenshot({
    path: "/tmp/swisscompact-room-save-funnel.png",
    fullPage: false,
  });

  await clickSetting("preset", "cafe");
  await clickSetting("preset", "restaurant");
  const afterRoomVisit = await readRoom();

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    document.querySelector("[data-showroom]")?.scrollIntoView({
      block: "start",
      behavior: "instant",
    });
  });
  await page.waitForFunction(() => (
    document.querySelector("[data-showroom]")?.getAttribute("data-showroom-ready") === "true"
  ), undefined, { timeout: 45_000 });
  const afterReload = await readRoom();

  await page.locator("[data-showroom-room-save]").click();
  await page.waitForFunction(() => (
    !document.querySelector("[data-journey-saved-cta]")?.hasAttribute("hidden")
  ));
  await page.locator("[data-journey-saved-cta]").evaluate((button) => button.click());
  await page.waitForFunction(() => (
    !document.querySelector("[data-journey-consult-panel]")?.hasAttribute("hidden")
  ));
  const funnel = await page.evaluate(() => ({
    consultationOpen:
      !document.querySelector("[data-journey-consult-panel]")?.hasAttribute("hidden"),
    ctaHidden: document.querySelector("[data-journey-saved-cta]")
      ?.hasAttribute("hidden"),
    formPresent: Boolean(document.querySelector("[data-journey-lead-form]")),
  }));

  const valid = errors.length === 0
    && headerPlacement.inHeader
    && headerPlacement.nextToReset
    && saved.savedPreset === "restaurant"
    && saved.saveState === "saved"
    && persisted.restaurantSize === "standard"
    && persisted.restaurantLight === "day"
    && persisted.ctaVisible
    && persisted.ctaCentered
    && persisted.ctaInLowerHalf
    && persisted.ctaText?.includes("Restaurant jetzt besprechen")
    && afterRoomVisit.preset === "restaurant"
    && afterRoomVisit.roomSize === "standard"
    && afterRoomVisit.light === "day"
    && afterReload.preset === "restaurant"
    && afterReload.roomSize === "standard"
    && afterReload.light === "day"
    && funnel.consultationOpen
    && funnel.ctaHidden
    && funnel.formPresent;
  console.log(JSON.stringify({
    valid,
    headerPlacement,
    saved,
    persisted,
    afterRoomVisit,
    afterReload,
    funnel,
    errors,
  }, null, 2));
  if (!valid) process.exitCode = 1;
} finally {
  await browser.close();
}

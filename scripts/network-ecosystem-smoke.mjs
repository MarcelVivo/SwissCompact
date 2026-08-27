import { chromium } from "playwright-core";

const executablePath =
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const baseURL =
  process.env.SWISSCOMPACT_BASE_URL ?? "http://127.0.0.1:5173/";
const browser = await chromium.launch({ executablePath, headless: true });
const errors = [];

const prepare = async (page) => {
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    localStorage.removeItem("swisscompact-network-state");
    localStorage.removeItem("swisscompact-showroom-use-mode");
  });
  await page.goto(baseURL, {
    waitUntil: "domcontentloaded",
    timeout: 30_000,
  });
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
};

const click = async (page, selector) => {
  await page.locator(selector).first().evaluate((button) => button.click());
  await page.waitForTimeout(100);
};

const desktop = await browser.newPage({
  viewport: { width: 1440, height: 900 },
});
await prepare(desktop);

const seeded = await desktop.evaluate(() => {
  const root = document.querySelector("[data-showroom]");
  return {
    enabled: root?.getAttribute("data-showroom-network-enabled"),
    approved: Number(
      root?.getAttribute("data-showroom-network-approved-count"),
    ),
    campaigns: Number(
      root?.getAttribute("data-showroom-network-campaign-count"),
    ),
    mode: root?.getAttribute("data-showroom-selected-display-network-mode"),
    partner: root?.getAttribute(
      "data-showroom-selected-display-network-partner",
    ),
  };
});
const headerPlacement = await desktop.evaluate(() => {
  const header = document.querySelector("[data-showroom-focus-header]");
  const button = header?.querySelector("[data-showroom-network-open]");
  const headerRect = header?.getBoundingClientRect();
  const buttonRect = button?.getBoundingClientRect();
  return {
    inMainHeader: Boolean(button),
    additionalBarRemoved: !document.querySelector("[data-showroom-use-guide]"),
    insideHeader: Boolean(
      headerRect
      && buttonRect
      && buttonRect.left >= headerRect.left
      && buttonRect.right <= headerRect.right
      && buttonRect.top >= headerRect.top
      && buttonRect.bottom <= headerRect.bottom
    ),
  };
});

await click(desktop, "[data-showroom-network-open]");
const dashboard = await desktop.evaluate(() => ({
  open: !document.querySelector("[data-showroom-network-panel]")
    ?.hasAttribute("hidden"),
  room: document.querySelector(
    "[data-showroom-network-current-room]",
  )?.textContent?.trim(),
  mapPartners: document.querySelectorAll(
    "[data-showroom-network-partner-jump]",
  ).length,
  fitnessStatus: document.querySelector(
    '[data-showroom-network-partner-card="fitnessCenter"]',
  )?.className,
  overview: (() => {
    const element = document.querySelector(".showroom-network-overview");
    const map = document.querySelector("[data-showroom-network-map]");
    const rect = element?.getBoundingClientRect();
    const mapRect = map?.getBoundingClientRect();
    return {
      display: element instanceof HTMLElement
        ? getComputedStyle(element).display
        : "",
      height: rect?.height ?? 0,
      mapHeight: mapRect?.height ?? 0,
      childCount: map?.children.length ?? 0,
    };
  })(),
}));
await desktop.waitForTimeout(800);
await desktop.screenshot({
  path: "/tmp/swisscompact-network-dashboard.png",
  fullPage: false,
});
await click(desktop, "[data-showroom-network-close]");

await click(desktop, '[data-showroom-focus-tool="display"]');
await desktop.waitForFunction(() => (
  document.querySelector(
    '[data-showroom-selection-item^="display:sideRight:"]',
  ) !== null
));
await click(
  desktop,
  '[data-showroom-selection-item^="display:sideRight:"]',
);
await desktop.waitForFunction(() => (
  document.querySelector("[data-showroom-focus-inspector]")
    ?.classList.contains("is-open")
));
const displayNetwork = await desktop.evaluate(() => ({
  mode: document.querySelector("[data-showroom]")
    ?.getAttribute("data-showroom-selected-display-network-mode"),
  partner: document.querySelector("[data-showroom]")
    ?.getAttribute("data-showroom-selected-display-network-partner"),
  partnerControlVisible: !document.querySelector(
    "[data-showroom-display-network-partner]",
  )?.hasAttribute("hidden"),
  badge: document.querySelector(
    "[data-showroom-display-network-badge]",
  )?.textContent?.trim(),
}));
await desktop.locator("[data-showroom-display-network]").scrollIntoViewIfNeeded();
await desktop.screenshot({
  path: "/tmp/swisscompact-network-display-editor.png",
  fullPage: false,
});

await desktop.locator("select[data-showroom-network-partner]").evaluate(
  (select) => {
    select.value = "cinema";
    select.dispatchEvent(new Event("change", { bubbles: true }));
  },
);
await click(desktop, '[data-showroom-network-mode="partner"]');
const unapprovedFallback = await desktop.evaluate(() => ({
  mode: document.querySelector("[data-showroom]")
    ?.getAttribute("data-showroom-selected-display-network-mode"),
  partner: document.querySelector("[data-showroom]")
    ?.getAttribute("data-showroom-selected-display-network-partner"),
  badge: document.querySelector(
    "[data-showroom-display-network-badge]",
  )?.textContent?.trim(),
}));

await click(desktop, ".showroom-display-network [data-showroom-network-open]");
await click(
  desktop,
  '[data-showroom-network-action="request"][data-showroom-network-partner="cinema"]',
);
const pending = await desktop.evaluate(() => (
  document.querySelector(
    '[data-showroom-network-partner-card="cinema"]',
  )?.classList.contains("is-pending")
));
await click(
  desktop,
  '[data-showroom-network-action="approve"][data-showroom-network-partner="cinema"]',
);
const approved = await desktop.evaluate(() => ({
  cardApproved: document.querySelector(
    '[data-showroom-network-partner-card="cinema"]',
  )?.classList.contains("is-approved"),
  campaignCount: Number(
    document.querySelector("[data-showroom]")
      ?.getAttribute("data-showroom-network-campaign-count"),
  ),
  selectedMode: document.querySelector("[data-showroom]")
    ?.getAttribute("data-showroom-selected-display-network-mode"),
  selectedPartner: document.querySelector("[data-showroom]")
    ?.getAttribute("data-showroom-selected-display-network-partner"),
}));

await click(desktop, "[data-showroom-network-membership]");
const paused = await desktop.evaluate(() => ({
  enabled: document.querySelector("[data-showroom]")
    ?.getAttribute("data-showroom-network-enabled"),
  membership: document.querySelector(
    "[data-showroom-network-membership]",
  )?.getAttribute("aria-pressed"),
}));
await click(desktop, "[data-showroom-network-membership]");

await click(desktop, "[data-showroom-network-close]");
await desktop.locator(
  '[data-showroom-setting="preset"][data-value="fitnessCenter"]',
).first().evaluate((button) => button.click());
await desktop.waitForFunction(() => (
  document.querySelector("[data-showroom]")?.getAttribute(
    "data-showroom-preset",
  ) === "fitnessCenter"
));
await click(desktop, "[data-showroom-network-open]");
const reciprocal = await desktop.evaluate(() => ({
  room: document.querySelector(
    "[data-showroom-network-current-room]",
  )?.textContent?.trim(),
  restaurantApproved: document.querySelector(
    '[data-showroom-network-partner-card="restaurant"]',
  )?.classList.contains("is-approved"),
  campaigns: Number(
    document.querySelector("[data-showroom]")
      ?.getAttribute("data-showroom-network-campaign-count"),
  ),
}));

const mobile = await browser.newPage({
  viewport: { width: 390, height: 844 },
});
await prepare(mobile);
await click(mobile, "[data-showroom-network-open]");
const mobileLayout = await mobile.evaluate(() => {
  const panel = document.querySelector("[data-showroom-network-panel]");
  const rect = panel?.getBoundingClientRect();
  const headerButton = document.querySelector(
    "[data-showroom-focus-header] [data-showroom-network-open]",
  );
  return {
    open: !panel?.hasAttribute("hidden"),
    insideViewport: Boolean(
      rect
      && rect.left >= 0
      && rect.right <= innerWidth
      && rect.top >= 0
      && rect.bottom <= innerHeight
    ),
    noHorizontalOverflow:
      document.documentElement.scrollWidth <= innerWidth,
    headerButtonVisible: headerButton instanceof HTMLElement
      && getComputedStyle(headerButton).display !== "none"
      && headerButton.getBoundingClientRect().width > 1,
  };
});
await mobile.screenshot({
  path: "/tmp/swisscompact-network-mobile.png",
  fullPage: false,
});

const valid =
  errors.length === 0
  && seeded.enabled === "true"
  && seeded.approved >= 1
  && seeded.campaigns >= 1
  && seeded.mode === "mix"
  && seeded.partner === "fitnessCenter"
  && headerPlacement.inMainHeader
  && headerPlacement.additionalBarRemoved
  && headerPlacement.insideHeader
  && dashboard.open
  && dashboard.room === "Restaurant"
  && dashboard.mapPartners === 4
  && dashboard.fitnessStatus?.includes("is-approved")
  && dashboard.overview.height > 100
  && dashboard.overview.mapHeight > 80
  && displayNetwork.mode === "mix"
  && displayNetwork.partner === "fitnessCenter"
  && displayNetwork.partnerControlVisible
  && displayNetwork.badge?.includes("Partnercontent")
  && unapprovedFallback.mode === "partner"
  && unapprovedFallback.partner === "cinema"
  && unapprovedFallback.badge === "Freigabe erforderlich"
  && pending
  && approved.cardApproved
  && approved.campaignCount >= 1
  && approved.selectedMode === "mix"
  && approved.selectedPartner === "cinema"
  && paused.enabled === "false"
  && paused.membership === "false"
  && reciprocal.room?.includes("Fitness")
  && reciprocal.restaurantApproved
  && reciprocal.campaigns >= 1
  && mobileLayout.open
  && mobileLayout.insideViewport
  && mobileLayout.noHorizontalOverflow
  && mobileLayout.headerButtonVisible;

console.log(JSON.stringify({
  valid,
  seeded,
  headerPlacement,
  dashboard,
  displayNetwork,
  unapprovedFallback,
  pending,
  approved,
  paused,
  reciprocal,
  mobileLayout,
  errors,
}, null, 2));

await desktop.close();
await mobile.close();
await browser.close();
if (!valid) process.exitCode = 1;

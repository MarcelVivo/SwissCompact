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

const openSelectionMenu = async (page) => {
  const menu = page.locator("[data-showroom-selection-menu]");
  const isOpen = await menu.evaluate((element) => (
    element.classList.contains("is-open")
  ));
  if (!isOpen) {
    await menu.locator("[data-showroom-navbar-trigger]").evaluate(
      (button) => button.click(),
    );
  }
  await page.waitForFunction(() => (
    document.querySelector("[data-showroom-selection-menu]")
      ?.classList.contains("is-open")
  ));
};

const setMode = async (page, mode) => {
  await openSelectionMenu(page);
  await page.locator(
    `button[data-showroom-selection-mode="${mode}"]`,
  ).click();
  await page.waitForFunction((expected) => (
    document.querySelector("[data-showroom]")?.getAttribute(
      "data-showroom-selection-mode",
    ) === expected
  ), mode);
};

const selectPreset = async (page, preset) => {
  await page.locator(
    `[data-showroom-setting="preset"][data-value="${preset}"]`,
  ).first().evaluate((button) => button.click());
  await page.waitForFunction((expected) => (
    document.querySelector("[data-showroom]")?.getAttribute(
      "data-showroom-preset",
    ) === expected
  ), preset);
  await page.waitForTimeout(90);
};

const visiblePanels = async (page) => page.evaluate(() => {
  const selectors = {
    furnishing: "[data-showroom-object-toolbar]",
    color: "[data-showroom-object-color-control]",
    opening: "[data-showroom-opening-toolbar]",
    display: "[data-showroom-display-flyout]",
    mount: "[data-showroom-object-flyout]",
  };
  return Object.fromEntries(Object.entries(selectors).map(([key, selector]) => {
    const element = document.querySelector(selector);
    if (!(element instanceof HTMLElement) || element.hidden) {
      return [key, { visible: false }];
    }
    const style = getComputedStyle(element);
    const inspector = element.closest(".showroom-focus-inspector");
    const bounds = key === "display" && inspector instanceof HTMLElement
      ? inspector.getBoundingClientRect()
      : element.getBoundingClientRect();
    return [key, {
      visible:
        style.display !== "none"
        && style.visibility !== "hidden"
        && bounds.width > 0
        && bounds.height > 0,
      left: bounds.left,
      right: bounds.right,
      top: bounds.top,
      bottom: bounds.bottom,
    }];
  }));
});

const panelInsideViewport = (panel, width = 1440, height = 900) => (
  !panel.visible
  || (
    panel.left >= 0
    && panel.right <= width
    && panel.top >= 0
    && panel.bottom <= height
  )
);

const panelsOverlap = (first, second) => (
  first.visible
  && second.visible
  && first.left < second.right
  && first.right > second.left
  && first.top < second.bottom
  && first.bottom > second.top
);

const desktop = await browser.newPage({
  viewport: { width: 1440, height: 900 },
});

try {
  await prepare(desktop);
  await openSelectionMenu(desktop);
  await desktop.locator(
    'button[data-showroom-selection-mode="auto"]',
  ).evaluate((button) => button.click());
  const autoState = await desktop.evaluate(() => ({
    mode:
      document.querySelector("[data-showroom]")?.getAttribute(
        "data-showroom-selection-mode",
      ) ?? "",
    count: Number(
      document.querySelector("[data-showroom]")?.getAttribute(
        "data-showroom-selection-list-count",
      ),
    ),
    groups: Array.from(
      document.querySelectorAll(
        "[data-showroom-selection-list] .showroom-selection-group > span",
      ),
      (element) => element.textContent ?? "",
    ),
  }));

  const presets = [
    "takeaway",
    "restaurant",
    "cafe",
    "barber",
    "beautySalon",
    "physio",
    "cinema",
    "museum",
    "eventHall",
    "outdoorShop",
    "mountainStation",
    "fitnessCenter",
    "fashionStore",
    "electronicsStore",
    "shoppingMall",
  ];
  const roomCoverage = [];
  for (const preset of presets) {
    await selectPreset(desktop, preset);
    await desktop.locator(
      'button[data-showroom-selection-mode="auto"]',
    ).evaluate((button) => button.click());
    roomCoverage.push(await desktop.evaluate((room) => ({
      preset: room,
      count: Number(
        document.querySelector("[data-showroom]")?.getAttribute(
          "data-showroom-selection-list-count",
        ),
      ),
      groups: Array.from(
        document.querySelectorAll(
          "[data-showroom-selection-list] .showroom-selection-group > span",
        ),
        (element) => element.textContent ?? "",
      ),
    }), preset));
  }
  await selectPreset(desktop, "restaurant");

  await setMode(desktop, "furnishing");
  await desktop.locator(
    '[data-showroom-selection-item="furnishing:service-counter"]',
  ).click();
  await desktop.waitForFunction(() => (
    document.querySelector("[data-showroom]")?.getAttribute(
      "data-showroom-selected-furnishing",
    ) === "service-counter"
  ));
  const furnishingState = {
    mode: await desktop.locator("[data-showroom]").getAttribute(
      "data-showroom-selection-mode",
    ),
    panels: await visiblePanels(desktop),
  };

  await setMode(desktop, "display");
  const displayItem = desktop.locator(
    '[data-showroom-selection-item^="display:"]',
  ).first();
  const displayKey = await displayItem.getAttribute(
    "data-showroom-selection-item",
  );
  await displayItem.click();
  await desktop.waitForFunction(() => (
    document.querySelector("[data-showroom]")
      ?.classList.contains("has-display-selection")
  ));
  const displayState = {
    key: displayKey,
    mode: await desktop.locator("[data-showroom]").getAttribute(
      "data-showroom-selection-mode",
    ),
    panels: await visiblePanels(desktop),
  };

  await setMode(desktop, "mount");
  const mountKeys = await desktop.locator(
    '[data-showroom-selection-item^="mount:"]',
  ).evaluateAll((items) => items.map(
    (item) => item.getAttribute("data-showroom-selection-item"),
  ));
  await desktop.locator(
    '[data-showroom-selection-item="mount:menu"]',
  ).click();
  await desktop.waitForFunction(() => (
    document.querySelector("[data-showroom]")?.getAttribute(
      "data-showroom-selected-object",
    ) === "menu"
  ));
  const mountState = {
    keys: mountKeys,
    selected:
      await desktop.locator("[data-showroom]").getAttribute(
        "data-showroom-selected-object",
      ),
    mode: await desktop.locator("[data-showroom]").getAttribute(
      "data-showroom-selection-mode",
    ),
    panels: await visiblePanels(desktop),
  };

  await setMode(desktop, "surface");
  await desktop.locator(
    '[data-showroom-selection-item="surface:floor"]',
  ).click();
  await desktop.waitForFunction(() => (
    document.querySelector("[data-showroom]")?.getAttribute(
      "data-showroom-selected-room-surface",
    ) === "floor"
  ));
  const surfaceState = {
    mode: await desktop.locator("[data-showroom]").getAttribute(
      "data-showroom-selection-mode",
    ),
    panels: await visiblePanels(desktop),
    floorOptionsHidden: await desktop.locator(
      "[data-showroom-floor-finish-control]",
    ).getAttribute("hidden"),
  };

  await desktop.locator("[data-showroom-opening-add=\"window\"]").first()
    .evaluate((button) => button.click());
  await desktop.waitForTimeout(120);
  await setMode(desktop, "opening");
  const openingItem = desktop.locator(
    '[data-showroom-selection-item^="opening:"]',
  ).first();
  const openingKey = await openingItem.getAttribute(
    "data-showroom-selection-item",
  );
  await openingItem.click();
  await desktop.waitForFunction(() => (
    document.querySelector("[data-showroom-opening-toolbar]")
      ?.hasAttribute("hidden") === false
  ));
  const openingState = {
    key: openingKey,
    mode: await desktop.locator("[data-showroom]").getAttribute(
      "data-showroom-selection-mode",
    ),
    panels: await visiblePanels(desktop),
  };

  const mobile = await browser.newPage({
    viewport: { width: 390, height: 844 },
  });
  await prepare(mobile);
  await openSelectionMenu(mobile);
  const mobileLayout = await mobile.evaluate(() => {
    const dropdown = document.querySelector(
      ".showroom-focus-browser__body",
    );
    const list = document.querySelector("[data-showroom-selection-list]");
    if (!(dropdown instanceof HTMLElement) || !(list instanceof HTMLElement)) {
      return null;
    }
    const bounds = dropdown.getBoundingClientRect();
    return {
      left: bounds.left,
      right: bounds.right,
      top: bounds.top,
      bottom: bounds.bottom,
      listScrollable: list.scrollHeight >= list.clientHeight,
      viewportWidth: innerWidth,
      viewportHeight: innerHeight,
    };
  });
  await mobile.close();

  const valid =
    errors.length === 0
    && autoState.mode === "auto"
    && autoState.count > 10
    && autoState.groups.some((label) => label.startsWith("Möbel & Objekte"))
    && autoState.groups.some((label) => label.startsWith("Displays"))
    && autoState.groups.some((label) => label.startsWith("Raumflächen"))
    && roomCoverage.every((room) => (
      room.count > 5
      && room.groups.some((label) => label.startsWith("Möbel & Objekte"))
      && room.groups.some((label) => label.startsWith("Displays"))
      && room.groups.some((label) => label.startsWith("Raumflächen"))
    ))
    && furnishingState.mode === "furnishing"
    && furnishingState.panels.furnishing.visible
    && furnishingState.panels.color.visible
    && !furnishingState.panels.display.visible
    && panelInsideViewport(furnishingState.panels.furnishing)
    && panelInsideViewport(furnishingState.panels.color)
    && !panelsOverlap(
      furnishingState.panels.furnishing,
      furnishingState.panels.color,
    )
    && displayState.key?.startsWith("display:")
    && displayState.mode === "display"
    && displayState.panels.display.visible
    && !displayState.panels.furnishing.visible
    && !displayState.panels.color.visible
    && panelInsideViewport(displayState.panels.display)
    && mountState.mode === "mount"
    && mountState.selected === "menu"
    && mountState.keys.includes("mount:menu")
    && mountState.keys.includes("mount:counterTop")
    && mountState.panels.mount.visible
    && !mountState.panels.display.visible
    && mountState.panels.color.visible
    && panelInsideViewport(mountState.panels.mount)
    && panelInsideViewport(mountState.panels.color)
    && !panelsOverlap(mountState.panels.mount, mountState.panels.color)
    && surfaceState.mode === "surface"
    && surfaceState.panels.color.visible
    && !surfaceState.panels.display.visible
    && panelInsideViewport(surfaceState.panels.color)
    && surfaceState.floorOptionsHidden === null
    && openingState.key?.startsWith("opening:")
    && openingState.mode === "opening"
    && openingState.panels.opening.visible
    && openingState.panels.color.visible
    && !openingState.panels.display.visible
    && panelInsideViewport(openingState.panels.opening)
    && panelInsideViewport(openingState.panels.color)
    && !panelsOverlap(openingState.panels.opening, openingState.panels.color)
    && mobileLayout
    && mobileLayout.left >= 0
    && mobileLayout.right <= mobileLayout.viewportWidth
    && mobileLayout.top >= 0
    && mobileLayout.bottom <= mobileLayout.viewportHeight + 8;

  console.log(JSON.stringify({
    valid,
    errors,
    autoState,
    roomCoverage,
    furnishingState,
    displayState,
    mountState,
    surfaceState,
    openingState,
    mobileLayout,
  }, null, 2));
  if (!valid) process.exitCode = 1;
} finally {
  await browser.close();
}

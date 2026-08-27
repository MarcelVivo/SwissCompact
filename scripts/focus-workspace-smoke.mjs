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

const click = async (page, selector) => {
  await page.locator(selector).first().evaluate((button) => button.click());
  await page.waitForTimeout(80);
};

const desktop = await browser.newPage({
  viewport: { width: 1440, height: 900 },
});
await prepare(desktop);
const defaultExperience = await desktop.evaluate(() => {
  const story = document.querySelector("[data-showroom-display-story]");
  return {
    useMode: document.querySelector("[data-showroom]")?.getAttribute(
      "data-showroom-use-mode",
    ),
    mode: document.querySelector("[data-showroom]")?.getAttribute(
      "data-showroom-selection-mode",
    ),
    activeTool: document.querySelector(
      "[data-showroom-focus-tool].is-active",
    )?.getAttribute("data-showroom-focus-tool"),
    storyVisible: story instanceof HTMLElement
      && getComputedStyle(story).display !== "none",
    screenCount: Number(
      document.querySelector(
        "[data-showroom-display-star-count]",
      )?.textContent,
    ),
    browserOpen: document.querySelector(
      "[data-showroom-focus-browser]",
    )?.classList.contains("is-open"),
    guideTitle: document.querySelector(
      "[data-showroom-guide-title]",
    )?.textContent?.trim(),
    visibleTools: Array.from(
      document.querySelectorAll("[data-showroom-focus-tool]"),
    ).filter((tool) => (
      tool instanceof HTMLElement
      && getComputedStyle(tool).display !== "none"
    )).length,
  };
});
await desktop.screenshot({
  path: "/tmp/swisscompact-display-first-desktop.png",
  fullPage: false,
});
const normalExperience = await desktop.evaluate(() => ({
  useMode: document.querySelector("[data-showroom]")?.getAttribute(
    "data-showroom-use-mode",
  ),
  mode: document.querySelector("[data-showroom]")?.getAttribute(
    "data-showroom-selection-mode",
  ),
  browserOpen: document.querySelector(
    "[data-showroom-focus-browser]",
  )?.classList.contains("is-open"),
  visibleTools: Array.from(
    document.querySelectorAll("[data-showroom-focus-tool]"),
  ).filter((tool) => (
    tool instanceof HTMLElement
    && getComputedStyle(tool).display !== "none"
  )).length,
}));
await desktop.keyboard.press("8");
const normalToolShortcut = await desktop.evaluate(() => ({
  activeTool: document.querySelector(
    "[data-showroom-focus-tool].is-active",
  )?.getAttribute("data-showroom-focus-tool"),
  browserOpen: document.querySelector(
    "[data-showroom-focus-browser]",
  )?.classList.contains("is-open"),
}));
await desktop.keyboard.press("/");
await desktop.waitForTimeout(40);
const normalSearchShortcut = await desktop.evaluate(() => ({
  activeTool: document.querySelector(
    "[data-showroom-focus-tool].is-active",
  )?.getAttribute("data-showroom-focus-tool"),
  searchFocused: document.activeElement?.matches(
    "[data-showroom-selection-search]",
  ),
}));
await desktop.locator("[data-showroom-selection-search]").fill(
  "Service-Theke",
);
await desktop.waitForTimeout(100);
const globalSearch = await desktop.evaluate(() => {
  const result = document.querySelector(
    '[data-showroom-selection-item="furnishing:service-counter"]',
  );
  return {
    mode: document.querySelector("[data-showroom]")?.getAttribute(
      "data-showroom-selection-mode",
    ),
    resultVisible: result instanceof HTMLElement
      && getComputedStyle(result).display !== "none",
  };
});
await click(desktop, "[data-showroom-selection-search-clear]");
await click(desktop, '[data-showroom-focus-tool="display"]');
await desktop.waitForFunction(() => (
  document.querySelector(
    '[data-showroom-selection-item^="display:totem:"]',
  ) !== null
));
await click(
  desktop,
  '[data-showroom-selection-item^="display:totem:"]',
);
await desktop.waitForFunction(() => (
  document.querySelector("[data-showroom-focus-inspector]")
    ?.classList.contains("is-open")
));
const displayOwnership = await desktop.evaluate(() => {
  const parentButton = document.querySelector(
    "[data-showroom-display-parent-edit]",
  );
  return {
    title: document.querySelector(
      "[data-showroom-focus-inspector-title]",
    )?.textContent?.trim(),
    parentLabel: document.querySelector(
      "[data-showroom-display-parent-label]",
    )?.textContent?.trim(),
    parentButtonVisible: parentButton instanceof HTMLElement
      && !parentButton.hidden
      && getComputedStyle(parentButton).display !== "none",
  };
});
await desktop.screenshot({
  path: "/tmp/swisscompact-display-ownership.png",
  fullPage: false,
});
await click(desktop, "[data-showroom-display-parent-edit]");
const parentTransition = await desktop.evaluate(() => ({
  title: document.querySelector(
    "[data-showroom-focus-inspector-title]",
  )?.textContent?.trim(),
  selectedStructure: document.querySelector("[data-showroom]")?.getAttribute(
    "data-showroom-selected-structure",
  ),
}));
await desktop.waitForTimeout(120);
const structureMoveHandleBox = await desktop.locator(
  "[data-showroom-structure-move-handle]",
).boundingBox();
const structureDragStart = await desktop.evaluate(() => {
  const root = document.querySelector("[data-showroom]");
  return {
    x: Number(root?.getAttribute("data-showroom-structure-x")),
    z: Number(root?.getAttribute("data-showroom-structure-z")),
  };
});
structureDragStart.screenX =
  (structureMoveHandleBox?.x ?? 0)
  + (structureMoveHandleBox?.width ?? 0) * 0.5;
structureDragStart.screenY =
  (structureMoveHandleBox?.y ?? 0)
  + (structureMoveHandleBox?.height ?? 0) * 0.5;
await desktop.mouse.move(
  structureDragStart.screenX,
  structureDragStart.screenY,
);
await desktop.mouse.down();
await desktop.mouse.move(
  structureDragStart.screenX + 70,
  structureDragStart.screenY + 18,
  { steps: 8 },
);
await desktop.mouse.up();
await desktop.waitForTimeout(100);
const structureDrag = await desktop.evaluate((start) => {
  const root = document.querySelector("[data-showroom]");
  const x = Number(root?.getAttribute("data-showroom-structure-x"));
  const z = Number(root?.getAttribute("data-showroom-structure-z"));
  return {
    startX: start.x,
    startZ: start.z,
    screenX: start.screenX,
    screenY: start.screenY,
    handleVisible: Boolean(start.screenX && start.screenY),
    x,
    z,
    moved: Math.hypot(x - start.x, z - start.z) > 0.02,
  };
}, structureDragStart);

await click(desktop, '[data-showroom-focus-tool="display"]');
await desktop.waitForFunction(() => (
  document.querySelector(
    '[data-showroom-selection-item^="display:totem:"]',
  ) !== null
));
await click(
  desktop,
  '[data-showroom-selection-item^="display:totem:"]',
);
await desktop.waitForTimeout(120);
const displayDragStart = await desktop.evaluate(() => {
  const root = document.querySelector("[data-showroom]");
  const canvas = document.querySelector("[data-showroom-canvas]");
  const bounds = canvas?.getBoundingClientRect();
  return {
    u: Number(root?.getAttribute("data-showroom-selected-display-offset-u")),
    v: Number(root?.getAttribute("data-showroom-selected-display-offset-v")),
    screenX:
      (bounds?.left ?? 0)
      + Number(root?.getAttribute("data-showroom-display-screen-x")),
    screenY:
      (bounds?.top ?? 0)
      + Number(root?.getAttribute("data-showroom-display-screen-y")),
  };
});
await desktop.mouse.move(displayDragStart.screenX, displayDragStart.screenY);
await desktop.mouse.down();
await desktop.mouse.move(
  displayDragStart.screenX + 32,
  displayDragStart.screenY + 82,
  { steps: 8 },
);
await desktop.mouse.up();
await desktop.waitForTimeout(100);
const displayDrag = await desktop.evaluate((start) => {
  const root = document.querySelector("[data-showroom]");
  const u = Number(
    root?.getAttribute("data-showroom-selected-display-offset-u"),
  );
  const v = Number(
    root?.getAttribute("data-showroom-selected-display-offset-v"),
  );
  return {
    startU: start.u,
    startV: start.v,
    screenX: start.screenX,
    screenY: start.screenY,
    u,
    v,
    moved: Math.hypot(u - start.u, v - start.v) > 0.02,
  };
}, displayDragStart);

await desktop.waitForTimeout(80);
const directStructureDragStart = await desktop.evaluate(() => {
  const root = document.querySelector("[data-showroom]");
  const canvas = document.querySelector("[data-showroom-canvas]");
  const bounds = canvas?.getBoundingClientRect();
  return {
    x: Number(root?.getAttribute("data-showroom-totem1-x")),
    z: Number(root?.getAttribute("data-showroom-totem1-z")),
    screenX:
      (bounds?.left ?? 0)
      + Number(root?.getAttribute("data-showroom-totem1-hit-screen-x")),
    screenY:
      (bounds?.top ?? 0)
      + Number(root?.getAttribute("data-showroom-totem1-hit-screen-y")),
  };
});
await desktop.mouse.move(
  directStructureDragStart.screenX,
  directStructureDragStart.screenY,
);
await desktop.mouse.down();
await desktop.mouse.move(
  directStructureDragStart.screenX + 54,
  directStructureDragStart.screenY - 14,
  { steps: 7 },
);
await desktop.mouse.up();
await desktop.waitForTimeout(100);
const directStructureDrag = await desktop.evaluate((start) => {
  const root = document.querySelector("[data-showroom]");
  const x = Number(root?.getAttribute("data-showroom-totem1-x"));
  const z = Number(root?.getAttribute("data-showroom-totem1-z"));
  return {
    modeBefore: "display",
    startX: start.x,
    startZ: start.z,
    x,
    z,
    moved: Math.hypot(x - start.x, z - start.z) > 0.02,
  };
}, directStructureDragStart);

const inspectorBefore = await desktop.locator(
  "[data-showroom-focus-inspector]",
).boundingBox();
const inspectorHeader = await desktop.locator(
  ".showroom-focus-inspector__header",
).boundingBox();
if (inspectorHeader) {
  await desktop.mouse.move(
    inspectorHeader.x + inspectorHeader.width * 0.5,
    inspectorHeader.y + inspectorHeader.height * 0.5,
  );
  await desktop.mouse.down();
  await desktop.mouse.move(
    inspectorHeader.x + inspectorHeader.width * 0.5 - 110,
    inspectorHeader.y + inspectorHeader.height * 0.5,
    { steps: 6 },
  );
  await desktop.mouse.up();
}
const inspectorAfter = await desktop.locator(
  "[data-showroom-focus-inspector]",
).boundingBox();
const inspectorDrag = {
  startLeft: inspectorBefore?.x,
  left: inspectorAfter?.x,
  moved: Boolean(
    inspectorBefore
    && inspectorAfter
    && Math.abs(inspectorAfter.x - inspectorBefore.x) > 40
  ),
};
await click(desktop, "[data-showroom-focus-inspector-close]");
const inspectorClose = await desktop.evaluate(() => ({
  mode: document.querySelector("[data-showroom]")?.getAttribute(
    "data-showroom-selection-mode",
  ),
  activeTool: document.querySelector(
    "[data-showroom-focus-tool].is-active",
  )?.getAttribute("data-showroom-focus-tool"),
}));
await click(desktop, '[data-showroom-focus-tool="layers"]');

const initial = await desktop.evaluate(() => {
  const stage = document.querySelector("[data-showroom-stage]");
  const browserPanel = document.querySelector("[data-showroom-focus-browser]");
  const tools = document.querySelector("[data-showroom-focus-tools]")
    ?? document.querySelector(".showroom-focus-tools");
  const legacy = [
    ".showroom-object-navbar",
    ".showroom-edge-navigation",
    ".showroom-config",
  ];
  const bounds = (element) => {
    const rect = element.getBoundingClientRect();
    return {
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height,
    };
  };
  return {
    toolCount: document.querySelectorAll("[data-showroom-focus-tool]").length,
    activeTool: document.querySelector(
      "[data-showroom-focus-tool].is-active",
    )?.getAttribute("data-showroom-focus-tool"),
    browserOpen: browserPanel?.classList.contains("is-open"),
    displayStory: document.querySelector(
      "[data-showroom-display-story]",
    )?.textContent?.replace(/\s+/g, " ").trim(),
    stage: stage instanceof HTMLElement ? bounds(stage) : null,
    browser: browserPanel instanceof HTMLElement ? bounds(browserPanel) : null,
    tools: tools instanceof HTMLElement ? bounds(tools) : null,
    legacyHidden: legacy.every((selector) => {
      const element = document.querySelector(selector);
      return element instanceof HTMLElement
        && getComputedStyle(element).display === "none";
    }),
  };
});

await click(desktop, '[data-showroom-focus-tool="furnishing"]');
await desktop.waitForFunction(() => (
  document.querySelectorAll(
    '[data-showroom-selection-item^="furnishing:"]',
  ).length > 0
));
await click(
  desktop,
  '[data-showroom-selection-item^="furnishing:"]',
);
await desktop.waitForFunction(() => (
  document.querySelector("[data-showroom-focus-inspector]")
    ?.classList.contains("is-open")
));

const selection = await desktop.evaluate(() => {
  const inspector = document.querySelector("[data-showroom-focus-inspector]");
  const color = document.querySelector("[data-showroom-object-color-control]");
  const rect = inspector?.getBoundingClientRect();
  return {
    inspectorOpen: inspector?.classList.contains("is-open"),
    title: document.querySelector(
      "[data-showroom-focus-inspector-title]",
    )?.textContent?.trim(),
    colorInInspector: Boolean(
      inspector && color && inspector.contains(color) && !color.hidden,
    ),
    insideViewport: Boolean(
      rect
      && rect.left >= 0
      && rect.top >= 0
      && rect.right <= innerWidth
      && rect.bottom <= innerHeight
    ),
  };
});

await click(desktop, '[data-showroom-focus-tool="layers"]');
await desktop.locator("[data-showroom-selection-search]").fill("theke");
await desktop.waitForTimeout(80);
const search = await desktop.evaluate(() => ({
  visible: Array.from(
    document.querySelectorAll(
      "[data-showroom-selection-list] .showroom-selection-item",
    ),
  ).filter((item) => !item.hidden).length,
  computedVisible: Array.from(
    document.querySelectorAll(
      "[data-showroom-selection-list] .showroom-selection-item",
    ),
  ).filter((item) => (
    item instanceof HTMLElement
    && getComputedStyle(item).display !== "none"
  )).length,
  total: Number(
    document.querySelector("[data-showroom]")?.getAttribute(
      "data-showroom-selection-list-count",
    ),
  ),
}));

await click(desktop, '[data-showroom-focus-tool="light"]');
const light = await desktop.evaluate(() => ({
  activeTool: document.querySelector(
    "[data-showroom-focus-tool].is-active",
  )?.getAttribute("data-showroom-focus-tool"),
  inspectorOpen: document.querySelector(
    "[data-showroom-focus-inspector]",
  )?.classList.contains("is-open"),
  lightVisible: !document.querySelector(
    "[data-showroom-light-inspector]",
  )?.hasAttribute("hidden"),
}));

await click(desktop, '[data-showroom-setting="roomSize"][data-value="compact"]');
await desktop.waitForTimeout(120);
const history = await desktop.evaluate(() => ({
  length: Number(
    document.querySelector("[data-showroom]")?.getAttribute(
      "data-showroom-history-length",
    ),
  ),
  undoEnabled: !document.querySelector(
    "[data-showroom-history-undo]",
  )?.hasAttribute("disabled"),
  changedSize: document.querySelector("[data-showroom]")?.getAttribute(
    "data-showroom-room-size",
  ),
}));
await click(desktop, "[data-showroom-history-undo]");
const undoneSize = await desktop.locator("[data-showroom]").getAttribute(
  "data-showroom-room-size",
);
await click(desktop, "[data-showroom-history-redo]");
const redoneSize = await desktop.locator("[data-showroom]").getAttribute(
  "data-showroom-room-size",
);

await desktop.screenshot({
  path: "/tmp/swisscompact-focus-workspace-desktop.png",
  fullPage: false,
});

const mobile = await browser.newPage({
  viewport: { width: 390, height: 844 },
});
await prepare(mobile);
await click(mobile, '[data-showroom-focus-tool="door"]');
const mobileLayout = await mobile.evaluate(() => {
  const stage = document.querySelector("[data-showroom-stage]");
  const browserPanel = document.querySelector("[data-showroom-focus-browser]");
  const toolRail = document.querySelector(".showroom-focus-tools");
  const search = document.querySelector(".showroom-focus-search");
  const searchInput = document.querySelector(
    "[data-showroom-selection-search]",
  );
  const panelRect = browserPanel?.getBoundingClientRect();
  const toolsRect = toolRail?.getBoundingClientRect();
  const searchRect = search?.getBoundingClientRect();
  const searchInputRect = searchInput?.getBoundingClientRect();
  return {
    browserOpen: browserPanel?.classList.contains("is-open"),
    openingActionsVisible: !document.querySelector(
      "[data-showroom-focus-opening-actions]",
    )?.hasAttribute("hidden"),
    visibleDoorActions: Array.from(document.querySelectorAll(
      '[data-showroom-opening-kind="door"]',
    )).filter((item) => !item.hasAttribute("hidden")).length,
    visibleWindowActions: Array.from(document.querySelectorAll(
      '[data-showroom-opening-kind="window"]',
    )).filter((item) => !item.hasAttribute("hidden")).length,
    noHorizontalOverflow:
      document.documentElement.scrollWidth <= innerWidth
      && stage instanceof HTMLElement
      && stage.scrollWidth <= stage.clientWidth,
    panelInside: Boolean(
      panelRect
      && panelRect.left >= 0
      && panelRect.right <= innerWidth
      && panelRect.top >= 0
      && panelRect.bottom <= innerHeight
    ),
    toolsInside: Boolean(
      toolsRect
      && toolsRect.left >= 0
      && toolsRect.right <= innerWidth
      && toolsRect.bottom <= innerHeight
    ),
    searchHeight: searchRect?.height ?? 0,
    searchInputHeight: searchInputRect?.height ?? 0,
  };
});
await mobile.screenshot({
  path: "/tmp/swisscompact-focus-workspace-mobile.png",
  fullPage: false,
});

const valid =
  errors.length === 0
  && initial.toolCount === 10
  && initial.activeTool === "layers"
  && initial.browserOpen
  && initial.displayStory?.includes("Content-Produktion")
  && defaultExperience.useMode === "normal"
  && defaultExperience.mode === "auto"
  && defaultExperience.activeTool === "select"
  && !defaultExperience.storyVisible
  && !defaultExperience.browserOpen
  && defaultExperience.guideTitle
    === "Mit dem 360°-Ring navigieren"
  && defaultExperience.visibleTools === 10
  && defaultExperience.screenCount > 0
  && normalExperience.useMode === "normal"
  && normalExperience.mode === "auto"
  && !normalExperience.browserOpen
  && normalExperience.visibleTools === 10
  && normalToolShortcut.activeTool === "furnishing"
  && normalToolShortcut.browserOpen
  && normalSearchShortcut.activeTool === "layers"
  && normalSearchShortcut.searchFocused
  && globalSearch.mode === "auto"
  && globalSearch.resultVisible
  && displayOwnership.title?.includes("Säule")
  && displayOwnership.title?.includes("Displayfläche")
  && displayOwnership.parentLabel?.includes("Säule")
  && displayOwnership.parentButtonVisible
  && parentTransition.title?.includes("Säule")
  && parentTransition.selectedStructure === "totem"
  && structureDrag.moved
  && displayDrag.moved
  && directStructureDrag.moved
  && inspectorDrag.moved
  && inspectorClose.mode === "auto"
  && inspectorClose.activeTool === "select"
  && initial.legacyHidden
  && selection.inspectorOpen
  && selection.colorInInspector
  && selection.insideViewport
  && search.visible > 0
  && search.visible < search.total
  && search.computedVisible === search.visible
  && light.activeTool === "light"
  && light.inspectorOpen
  && light.lightVisible
  && history.length > 1
  && history.undoEnabled
  && history.changedSize === "compact"
  && undoneSize !== history.changedSize
  && redoneSize === history.changedSize
  && mobileLayout.browserOpen
  && mobileLayout.openingActionsVisible
  && mobileLayout.visibleDoorActions === 2
  && mobileLayout.visibleWindowActions === 0
  && mobileLayout.noHorizontalOverflow
  && mobileLayout.panelInside
  && mobileLayout.toolsInside
  && mobileLayout.searchHeight >= 40
  && mobileLayout.searchInputHeight >= 38;

console.log(JSON.stringify({
  valid,
  defaultExperience,
  normalExperience,
  normalToolShortcut,
  normalSearchShortcut,
  globalSearch,
  displayOwnership,
  parentTransition,
  structureDrag,
  displayDrag,
  directStructureDrag,
  inspectorDrag,
  inspectorClose,
  initial,
  selection,
  search,
  light,
  history,
  undoneSize,
  redoneSize,
  mobileLayout,
  errors,
}, null, 2));

await browser.close();
if (!valid) process.exitCode = 1;

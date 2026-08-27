import { chromium } from "playwright-core";

const executablePath =
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const baseURL =
  process.env.SWISSCOMPACT_BASE_URL ?? "http://127.0.0.1:5177/";
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
  await page.locator(selector).first().evaluate((element) => element.click());
  await page.waitForTimeout(70);
};

const inspectPanelSize = async (page, state) => page.evaluate((label) => {
  const panel = document.querySelector("[data-showroom-focus-inspector]");
  if (!(panel instanceof HTMLElement)) {
    return {
      state: label,
      height: 0,
      clientHeight: 0,
      scrollHeight: 0,
      emptyGap: 0,
    };
  }
  const panelRect = panel.getBoundingClientRect();
  const visibleChildren = Array.from(panel.children).filter((child) => {
    if (!(child instanceof HTMLElement)) return false;
    const style = getComputedStyle(child);
    const rect = child.getBoundingClientRect();
    return (
      style.display !== "none"
      && style.visibility !== "hidden"
      && rect.width > 1
      && rect.height > 1
    );
  });
  const contentBottom = Math.max(
    panelRect.top,
    ...visibleChildren.map((child) => child.getBoundingClientRect().bottom),
  );
  return {
    state: label,
    height: Math.round(panelRect.height),
    clientHeight: panel.clientHeight,
    scrollHeight: panel.scrollHeight,
    emptyGap: Math.max(
      0,
      Math.round(panelRect.bottom - Math.min(contentBottom, panelRect.bottom)),
    ),
  };
}, state);

const pointerClick = async (page, selector) => {
  await page.locator(selector).first().click();
  await page.waitForTimeout(70);
};

const scanVisibleUI = async (page, state) => page.evaluate((label) => {
  const showroom = document.querySelector("[data-showroom]");
  const stage = document.querySelector("[data-showroom-stage]");
  const stageBounds = stage?.getBoundingClientRect();
  const parse = (value) => {
    const match = value.match(
      /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+))?\s*\)/,
    );
    if (!match) return { r: 0, g: 0, b: 0, a: 0 };
    return {
      r: Number(match[1]),
      g: Number(match[2]),
      b: Number(match[3]),
      a: match[4] === undefined ? 1 : Number(match[4]),
    };
  };
  const blend = (front, back) => ({
    r: front.r * front.a + back.r * (1 - front.a),
    g: front.g * front.a + back.g * (1 - front.a),
    b: front.b * front.a + back.b * (1 - front.a),
    a: 1,
  });
  const luminance = (color) => {
    const convert = (channel) => {
      const value = channel / 255;
      return value <= 0.04045
        ? value / 12.92
        : ((value + 0.055) / 1.055) ** 2.4;
    };
    return (
      0.2126 * convert(color.r)
      + 0.7152 * convert(color.g)
      + 0.0722 * convert(color.b)
    );
  };
  const contrast = (a, b) => {
    const first = luminance(a);
    const second = luminance(b);
    return (
      (Math.max(first, second) + 0.05)
      / (Math.min(first, second) + 0.05)
    );
  };
  const visible = (element) => {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return (
      style.display !== "none"
      && style.visibility !== "hidden"
      && Number(style.opacity) > 0.03
      && rect.width > 1
      && rect.height > 1
    );
  };
  const roots = Array.from(document.querySelectorAll(
    [
      ".showroom-focus-header",
      ".showroom-focus-tools",
      ".showroom-focus-browser.is-open",
      ".showroom-focus-inspector.is-open",
      ".showroom-object-toolbar:not([hidden])",
      ".showroom-structure-direct-controls:not([hidden])",
      ".showroom-structure-move-handle:not([hidden])",
    ].join(","),
  )).filter((element) => visible(element));
  const candidates = new Set();
  roots.forEach((root) => {
    [root, ...root.querySelectorAll("*")].forEach((element) => {
      if (!(element instanceof HTMLElement) || !visible(element)) return;
      const directText = Array.from(element.childNodes).some((node) => (
        node.nodeType === Node.TEXT_NODE && node.textContent?.trim()
      ));
      if (directText) candidates.add(element);
    });
  });
  const contrastFailures = [];
  candidates.forEach((element) => {
    const path = [];
    let ancestor = element;
    while (ancestor && ancestor !== showroom?.parentElement) {
      path.unshift(ancestor);
      ancestor = ancestor.parentElement;
    }
    let background = { r: 20, g: 20, b: 24, a: 1 };
    path.forEach((item) => {
      const layer = parse(getComputedStyle(item).backgroundColor);
      if (layer.a > 0) background = blend(layer, background);
    });
    const style = getComputedStyle(element);
    const rawForeground = parse(style.color);
    if (rawForeground.a < 0.05) return;
    const foreground = blend(rawForeground, background);
    const ratio = contrast(foreground, background);
    if (ratio < 2.35) {
      contrastFailures.push({
        element: element.tagName.toLowerCase(),
        className: element.className,
        text: element.textContent?.replace(/\s+/g, " ").trim().slice(0, 90),
        color: style.color,
        background: style.backgroundColor,
        ratio: Number(ratio.toFixed(2)),
      });
    }
  });
  const panelOverflow = roots.flatMap((element) => {
    if (!stageBounds) return [];
    const rect = element.getBoundingClientRect();
    const outside = (
      rect.left < stageBounds.left - 2
      || rect.right > stageBounds.right + 2
      || rect.top < stageBounds.top - 2
      || rect.bottom > stageBounds.bottom + 2
    );
    return outside
      ? [{
        className: element.className,
        left: Math.round(rect.left),
        top: Math.round(rect.top),
        right: Math.round(rect.right),
        bottom: Math.round(rect.bottom),
      }]
      : [];
  });
  const inspector = document.querySelector(
    ".showroom-focus-inspector.is-open",
  );
  const overlapFailures = [];
  if (inspector instanceof HTMLElement) {
    const textOrControl = Array.from(inspector.querySelectorAll(
      "button, strong, span, small, output, legend, label",
    )).filter((element) => {
      if (!(element instanceof HTMLElement) || !visible(element)) return false;
      return element.matches("button")
        || Array.from(element.childNodes).some((node) => (
          node.nodeType === Node.TEXT_NODE && node.textContent?.trim()
        ));
    });
    const bounds = textOrControl.map((element) => ({
      element,
      rect: element.getBoundingClientRect(),
    }));
    for (let first = 0; first < bounds.length; first += 1) {
      for (let second = first + 1; second < bounds.length; second += 1) {
        const a = bounds[first];
        const b = bounds[second];
        if (
          a.element.contains(b.element)
          || b.element.contains(a.element)
          || (
            a.element.closest("button")
            && a.element.closest("button") === b.element.closest("button")
          )
        ) continue;
        const width = Math.min(a.rect.right, b.rect.right)
          - Math.max(a.rect.left, b.rect.left);
        const height = Math.min(a.rect.bottom, b.rect.bottom)
          - Math.max(a.rect.top, b.rect.top);
        if (width <= 2 || height <= 2) continue;
        overlapFailures.push({
          first: a.element.textContent?.replace(/\s+/g, " ").trim().slice(0, 70),
          second: b.element.textContent?.replace(/\s+/g, " ").trim().slice(0, 70),
          width: Math.round(width),
          height: Math.round(height),
        });
        if (overlapFailures.length >= 20) break;
      }
      if (overlapFailures.length >= 20) break;
    }
  }
  return {
    state: label,
    preset: showroom?.getAttribute("data-showroom-preset"),
    contrastFailures,
    panelOverflow,
    overlapFailures,
  };
}, state);

const desktop = await browser.newPage({
  viewport: { width: 1440, height: 900 },
});
await prepare(desktop);

const toolStates = [];
for (const tool of [
  "display",
  "room",
  "furnishing",
  "opening",
  "light",
  "layers",
  "select",
]) {
  const selector = `[data-showroom-focus-tool="${tool}"]`;
  const activeBefore = await desktop.locator(selector).evaluate(
    (button) => button.classList.contains("is-active"),
  );
  if (!activeBefore) await pointerClick(desktop, selector);
  const openAfterFirst = await desktop.evaluate(() => Boolean(
    document.querySelector("[data-showroom-focus-browser].is-open")
    || document.querySelector("[data-showroom-focus-inspector].is-open"),
  ));
  await pointerClick(desktop, selector);
  const closedAfterSecond = await desktop.evaluate(() => (
    !document.querySelector("[data-showroom-focus-browser]")
      ?.classList.contains("is-open")
    && !document.querySelector("[data-showroom-focus-inspector]")
      ?.classList.contains("is-open")
  ));
  await pointerClick(desktop, selector);
  const reopenedAfterThird = await desktop.evaluate(() => Boolean(
    document.querySelector("[data-showroom-focus-browser].is-open")
    || document.querySelector("[data-showroom-focus-inspector].is-open"),
  ));
  toolStates.push({
    tool,
    openAfterFirst,
    closedAfterSecond,
    reopenedAfterThird,
  });
}

const auditStates = [];
await pointerClick(
  desktop,
  ".showroom-focus-size-menu > [data-showroom-navbar-trigger]",
);
await desktop.waitForTimeout(180);
auditStates.push(await scanVisibleUI(desktop, "header:size-menu"));
const sizeMenuLabels = await desktop.locator(
  ".showroom-focus-size-menu .showroom-navbar-dropdown > button",
).evaluateAll((buttons) => buttons.map((button) => ({
  text: button.textContent?.trim(),
  visible: getComputedStyle(button).visibility !== "hidden"
    && Number(getComputedStyle(button).opacity) > 0,
  color: getComputedStyle(button).color,
  background: getComputedStyle(button).backgroundColor,
})));
await desktop.screenshot({
  path: "/tmp/swisscompact-size-menu-contrast.png",
  fullPage: false,
});
await pointerClick(
  desktop,
  ".showroom-focus-size-menu > [data-showroom-navbar-trigger]",
);
for (const tool of ["display", "room", "furnishing", "opening", "layers"]) {
  await click(desktop, `[data-showroom-focus-tool="${tool}"]`);
  const browserOpen = await desktop.locator(
    "[data-showroom-focus-browser]",
  ).evaluate((panel) => panel.classList.contains("is-open"));
  if (!browserOpen) {
    await click(desktop, `[data-showroom-focus-tool="${tool}"]`);
  }
  const firstItem = desktop.locator(
    "[data-showroom-selection-list] .showroom-selection-item:not([hidden])",
  ).first();
  if (await firstItem.count()) {
    await firstItem.evaluate((button) => button.click());
    await desktop.waitForTimeout(80);
  }
  auditStates.push(await scanVisibleUI(desktop, `tool:${tool}`));
}

await click(desktop, '[data-showroom-focus-tool="display"]');
let browserOpen = await desktop.locator(
  "[data-showroom-focus-browser]",
).evaluate((panel) => panel.classList.contains("is-open"));
if (!browserOpen) {
  await click(desktop, '[data-showroom-focus-tool="display"]');
}
await click(desktop, '[data-showroom-selection-mode="mount"]');
const firstMount = desktop.locator(
  '[data-showroom-selection-item^="mount:"]:not([hidden])',
).first();
if (await firstMount.count()) {
  await firstMount.evaluate((button) => button.click());
  await desktop.waitForTimeout(100);
  auditStates.push(await scanVisibleUI(desktop, "panel:mount"));
}

await click(desktop, '[data-showroom-focus-tool="furnishing"]');
browserOpen = await desktop.locator(
  "[data-showroom-focus-browser]",
).evaluate((panel) => panel.classList.contains("is-open"));
if (!browserOpen) {
  await click(desktop, '[data-showroom-focus-tool="furnishing"]');
}
const firstStructure = desktop.locator(
  '[data-showroom-selection-item^="structure:"]:not([hidden])',
).first();
if (await firstStructure.count()) {
  await firstStructure.evaluate((button) => button.click());
  await desktop.waitForTimeout(100);
  auditStates.push(await scanVisibleUI(desktop, "panel:structure"));
}

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
for (const preset of presets) {
  await desktop.locator(
    `[data-showroom-setting="preset"][data-value="${preset}"]`,
  ).first().evaluate((button) => button.click());
  await desktop.waitForTimeout(180);
  await click(desktop, '[data-showroom-focus-tool="layers"]');
  const browserOpen = await desktop.locator(
    "[data-showroom-focus-browser]",
  ).evaluate((panel) => panel.classList.contains("is-open"));
  if (!browserOpen) {
    await click(desktop, '[data-showroom-focus-tool="layers"]');
  }
  auditStates.push(await scanVisibleUI(desktop, `preset:${preset}`));
}

const compactPanelStates = [];
for (const [surface, state] of [
  ["wallLeft", "compact:wall-color"],
  ["floor", "compact:floor"],
  ["wallBack", "compact:back-wall"],
]) {
  await click(desktop, '[data-showroom-focus-tool="room"]');
  const surfaceItem = desktop.locator(
    `[data-showroom-selection-item="surface:${surface}"]`,
  );
  if (await surfaceItem.count()) {
    await surfaceItem.evaluate((button) => button.click());
    await desktop.waitForTimeout(230);
  }
  compactPanelStates.push(await inspectPanelSize(desktop, state));
  if (surface === "wallLeft") {
    await desktop.screenshot({
      path: "/tmp/swisscompact-compact-color-flyout.png",
      fullPage: false,
    });
  }
}
await click(desktop, '[data-showroom-focus-tool="light"]');
compactPanelStates.push(await inspectPanelSize(desktop, "compact:light"));
await click(desktop, '[data-showroom-focus-tool="opening"]');
const compactOpening = desktop.locator(
  '[data-showroom-selection-item^="opening:"]',
).first();
if (await compactOpening.count()) {
  await compactOpening.evaluate((button) => button.click());
  await desktop.waitForTimeout(90);
  compactPanelStates.push(
    await inspectPanelSize(desktop, "compact:opening"),
  );
}
await desktop.locator("[data-showroom-focus-inspector]").evaluate((panel) => {
  panel.style.height = "900px";
  panel.style.maxHeight = "900px";
});
await click(desktop, '[data-showroom-focus-tool="furnishing"]');
const compactFurnishing = desktop.locator(
  '[data-showroom-selection-item^="furnishing:"]',
).first();
if (await compactFurnishing.count()) {
  await compactFurnishing.evaluate((button) => button.click());
  await desktop.waitForTimeout(230);
  compactPanelStates.push(
    await inspectPanelSize(desktop, "compact:furnishing-after-large-panel"),
  );
}

await desktop.screenshot({
  path: "/tmp/swisscompact-ui-audit-desktop.png",
  fullPage: false,
});

const landscape = await browser.newPage({
  viewport: { width: 732, height: 429 },
});
await prepare(landscape);
await landscape.locator(
  '[data-showroom-setting="preset"][data-value="eventHall"]',
).first().evaluate((button) => button.click());
await landscape.waitForTimeout(220);
await landscape.locator(
  '[data-showroom-selection-item="display:sideRight:0:0"]',
).evaluate((button) => button.click());
await landscape.waitForTimeout(100);
await landscape.locator("[data-showroom-focus-inspector]").evaluate(
  (panel) => {
    panel.scrollTop = 90;
  },
);
await landscape.locator(
  '[data-showroom-selection-item="display:menu:0:0"]',
).evaluate((button) => button.click());
await landscape.waitForTimeout(120);
const landscapeAudit = await scanVisibleUI(
  landscape,
  "landscape:display-long-title",
);
const landscapePanelAudits = [landscapeAudit];
const landscapeState = await landscape.evaluate(() => {
  const inspector = document.querySelector(
    "[data-showroom-focus-inspector]",
  );
  return {
    title: document.querySelector(
      "[data-showroom-focus-inspector-title]",
    )?.textContent?.trim(),
    scrollTop: inspector?.scrollTop ?? -1,
    nativeTitles: Array.from(
      inspector?.querySelectorAll("[title]") ?? [],
    ).filter((element) => (
      !element.matches("[data-showroom-flyout-drag-handle]")
      && getComputedStyle(element).display !== "none"
      && getComputedStyle(element).visibility !== "hidden"
      && element.getBoundingClientRect().width > 0
      && element.getBoundingClientRect().height > 0
    )).map((element) => element.getAttribute("title")),
  };
});
await landscape.screenshot({
  path: "/tmp/swisscompact-ui-audit-landscape-flyout.png",
  fullPage: false,
});
const auditLandscapeSelection = async (
  tool,
  itemSelector,
  state,
) => {
  await click(landscape, `[data-showroom-focus-tool="${tool}"]`);
  const item = landscape.locator(itemSelector).first();
  if (await item.count()) {
    await item.evaluate((button) => button.click());
    await landscape.waitForTimeout(90);
  }
  landscapePanelAudits.push(await scanVisibleUI(landscape, state));
};
await auditLandscapeSelection(
  "furnishing",
  '[data-showroom-selection-item^="furnishing:"]',
  "landscape:furnishing",
);
await auditLandscapeSelection(
  "furnishing",
  '[data-showroom-selection-item^="structure:"]',
  "landscape:structure",
);
await auditLandscapeSelection(
  "room",
  '[data-showroom-selection-item^="surface:"]',
  "landscape:surface",
);
await auditLandscapeSelection(
  "opening",
  '[data-showroom-selection-item^="opening:"]',
  "landscape:opening",
);
await click(landscape, '[data-showroom-focus-tool="light"]');
landscapePanelAudits.push(
  await scanVisibleUI(landscape, "landscape:light"),
);
await click(landscape, '[data-showroom-focus-tool="display"]');
await click(landscape, '[data-showroom-selection-mode="mount"]');
const landscapeMount = landscape.locator(
  '[data-showroom-selection-item^="mount:"]',
).first();
if (await landscapeMount.count()) {
  await landscapeMount.evaluate((button) => button.click());
  await landscape.waitForTimeout(90);
}
landscapePanelAudits.push(
  await scanVisibleUI(landscape, "landscape:mount"),
);

const mobile = await browser.newPage({
  viewport: { width: 390, height: 844 },
});
await prepare(mobile);
await click(mobile, '[data-showroom-focus-tool="furnishing"]');
const mobileFirst = mobile.locator(
  "[data-showroom-selection-list] .showroom-selection-item:not([hidden])",
).first();
if (await mobileFirst.count()) {
  await mobileFirst.evaluate((button) => button.click());
  await mobile.waitForTimeout(450);
}
const mobileAudit = await scanVisibleUI(mobile, "mobile:furnishing");
await click(mobile, '[data-showroom-focus-tool="room"]');
const mobileWall = mobile.locator(
  '[data-showroom-selection-item="surface:wallLeft"]',
);
if (await mobileWall.count()) {
  await mobileWall.evaluate((button) => button.click());
  await mobile.waitForTimeout(230);
}
const mobileCompactPanel = await inspectPanelSize(
  mobile,
  "mobile:wall-color",
);
const mobileDocument = await mobile.evaluate(() => ({
  horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
  width: document.documentElement.scrollWidth,
  viewport: innerWidth,
}));
await mobile.setViewportSize({ width: 680, height: 1100 });
await mobile.evaluate(() => {
  document.querySelector("[data-showroom]")?.scrollIntoView({
    block: "start",
    behavior: "instant",
  });
});
await mobile.waitForTimeout(180);
await mobile.locator("[data-showroom-focus-inspector]").evaluate((panel) => {
  panel.style.height = "1000px";
  panel.style.maxHeight = "1000px";
});
await click(mobile, '[data-showroom-focus-tool="furnishing"]');
const narrowFurnishing = mobile.locator(
  '[data-showroom-selection-item^="furnishing:"]',
).first();
if (await narrowFurnishing.count()) {
  await narrowFurnishing.evaluate((button) => button.click());
  await mobile.waitForTimeout(230);
}
const narrowFurnishingPanel = await inspectPanelSize(
  mobile,
  "narrow:furnishing-after-large-panel",
);
const narrowLayering = await mobile.evaluate(() => {
  const inspector = document.querySelector(
    "[data-showroom-focus-inspector]",
  )?.getBoundingClientRect();
  const toolbar = document.querySelector(
    "[data-showroom-object-toolbar]:not([hidden])",
  )?.getBoundingClientRect();
  const color = document.querySelector(
    "[data-showroom-object-color-control]:not([hidden])",
  )?.getBoundingClientRect();
  return {
    inspectorBottom: Math.round(inspector?.bottom ?? 0),
    toolbarTop: Math.round(toolbar?.top ?? 0),
    overlapHeight: inspector && toolbar
      ? Math.max(0, Math.round(
        Math.min(inspector.bottom, toolbar.bottom)
          - Math.max(inspector.top, toolbar.top),
      ))
      : -1,
    colorInsideInspector: Boolean(
      inspector
      && color
      && color.top >= inspector.top
      && color.bottom <= inspector.bottom + 1,
    ),
  };
});
const narrowAudit = await scanVisibleUI(
  mobile,
  "narrow:furnishing-after-large-panel",
);
const narrowDocument = await mobile.evaluate(() => ({
  horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
  width: document.documentElement.scrollWidth,
  viewport: innerWidth,
}));
await mobile.screenshot({
  path: "/tmp/swisscompact-ui-audit-narrow-furnishing.png",
  fullPage: false,
});

const contrastFailures = auditStates.flatMap((state) => (
  state.contrastFailures.map((failure) => ({
    state: state.state,
    ...failure,
  }))
));
const overflowFailures = auditStates.flatMap((state) => (
  state.panelOverflow.map((failure) => ({
    state: state.state,
    ...failure,
  }))
));
const overlapFailures = auditStates.flatMap((state) => (
  state.overlapFailures.map((failure) => ({
    state: state.state,
    ...failure,
  }))
));
const valid = (
  errors.length === 0
  && toolStates.every((state) => (
    state.openAfterFirst
    && state.closedAfterSecond
    && state.reopenedAfterThird
  ))
  && contrastFailures.length === 0
  && overflowFailures.length === 0
  && overlapFailures.length === 0
  && sizeMenuLabels.length === 4
  && sizeMenuLabels.every((item) => item.visible)
  && landscapePanelAudits.every((state) => (
    state.contrastFailures.length === 0
    && state.panelOverflow.length === 0
    && state.overlapFailures.length === 0
  ))
  && landscapeState.scrollTop === 0
  && landscapeState.nativeTitles.length === 0
  && mobileAudit.contrastFailures.length === 0
  && mobileAudit.panelOverflow.length === 0
  && mobileAudit.overlapFailures.length === 0
  && !mobileDocument.horizontalOverflow
  && mobileCompactPanel.height > 0
  && mobileCompactPanel.height <= 280
  && mobileCompactPanel.emptyGap <= 2
  && narrowFurnishingPanel.height > 0
  && narrowFurnishingPanel.height <= 280
  && narrowFurnishingPanel.emptyGap <= 2
  && narrowLayering.overlapHeight === 0
  && narrowLayering.colorInsideInspector
  && !narrowDocument.horizontalOverflow
  && narrowAudit.contrastFailures.length === 0
  && narrowAudit.panelOverflow.length === 0
  && narrowAudit.overlapFailures.length === 0
  && compactPanelStates.every((state) => (
    state.height > 0
    && state.emptyGap <= 2
    && state.height <= 520
  ))
  && compactPanelStates.find(
    (state) => state.state === "compact:wall-color",
  )?.height <= 280
  && compactPanelStates.find(
    (state) => state.state === "compact:furnishing-after-large-panel",
  )?.height <= 280
);

console.log(JSON.stringify({
  valid,
  toolStates,
  presetCount: presets.length,
  sizeMenuLabels,
  contrastFailures,
  overflowFailures,
  overlapFailures,
  compactPanelStates,
  landscapePanelAudits,
  landscapeState,
  mobileAudit,
  mobileCompactPanel,
  mobileDocument,
  narrowFurnishingPanel,
  narrowLayering,
  narrowAudit,
  narrowDocument,
  errors,
}, null, 2));

await browser.close();
if (!valid) process.exitCode = 1;

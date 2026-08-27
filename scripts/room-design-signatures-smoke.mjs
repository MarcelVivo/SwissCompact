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

const expectations = {
  takeaway: {
    roomSize: "xs",
    floorFinish: "stone",
    brightness: 96,
    totems: 0,
    steles: 1,
    openings: 2,
  },
  restaurant: {
    roomSize: "small",
    floorFinish: "wood",
    brightness: 92,
    totems: 2,
    steles: 0,
    openings: 2,
  },
  cafe: {
    roomSize: "xs",
    floorFinish: "wood",
    brightness: 94,
    totems: 0,
    steles: 2,
    openings: 2,
  },
  barber: {
    roomSize: "xs",
    floorFinish: "stone",
    brightness: 94,
    totems: 1,
    steles: 1,
    openings: 2,
  },
  beautySalon: {
    roomSize: "small",
    floorFinish: "carpet",
    brightness: 98,
    totems: 0,
    steles: 3,
    openings: 3,
  },
  physio: {
    roomSize: "small",
    floorFinish: "wood",
    brightness: 100,
    totems: 1,
    steles: 0,
    openings: 3,
  },
  cinema: {
    roomSize: "small",
    floorFinish: "carpet",
    brightness: 96,
    totems: 3,
    steles: 1,
    openings: 2,
  },
  museum: {
    roomSize: "compact",
    floorFinish: "stone",
    brightness: 100,
    totems: 0,
    steles: 2,
    openings: 3,
  },
  eventHall: {
    roomSize: "compact",
    floorFinish: "carpet",
    brightness: 98,
    totems: 2,
    steles: 2,
    openings: 3,
  },
  outdoorShop: {
    roomSize: "small",
    floorFinish: "stone",
    brightness: 100,
    totems: 2,
    steles: 1,
    openings: 3,
  },
  mountainStation: {
    roomSize: "small",
    floorFinish: "stone",
    brightness: 100,
    totems: 3,
    steles: 0,
    openings: 2,
  },
  fitnessCenter: {
    roomSize: "compact",
    floorFinish: "carpet",
    brightness: 100,
    totems: 0,
    steles: 3,
    openings: 3,
  },
  fashionStore: {
    roomSize: "small",
    floorFinish: "wood",
    brightness: 96,
    totems: 0,
    steles: 2,
    openings: 3,
  },
  electronicsStore: {
    roomSize: "compact",
    floorFinish: "stone",
    brightness: 100,
    totems: 2,
    steles: 1,
    openings: 3,
  },
  shoppingMall: {
    roomSize: "standard",
    floorFinish: "stone",
    brightness: 100,
    totems: 2,
    steles: 3,
    openings: 3,
  },
};

try {
  await page.goto(baseURL, {
    waitUntil: "domcontentloaded",
    timeout: 30_000,
  });
  await page.locator("[data-marketing-target=\"#wirkung\"]").first().click();
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
  for (const [preset, expected] of Object.entries(expectations)) {
    await page.locator(
      `[data-showroom-setting="preset"][data-value="${preset}"]`,
    ).first().evaluate((button) => button.click());
    await page.waitForFunction((value) => (
      document.querySelector("[data-showroom]")?.getAttribute(
        "data-showroom-preset",
      ) === value
    ), preset);
    await page.waitForTimeout(600);
    await page.evaluate(() => {
      document.querySelector("[data-showroom]")?.scrollIntoView({
        block: "start",
        behavior: "instant",
      });
    });
    await page.screenshot({
      path: `/tmp/swisscompact-room-design-${preset}.png`,
      fullPage: false,
    });
    states.push(await page.evaluate(({ preset, expected }) => {
      const showroom = document.querySelector("[data-showroom]");
      const state = {
        preset,
        roomSize:
          showroom?.getAttribute("data-showroom-room-size") ?? "",
        floorFinish:
          showroom?.getAttribute("data-showroom-floor-finish") ?? "",
        brightness: Number(
          showroom?.getAttribute("data-showroom-brightness"),
        ),
        totems: Number(showroom?.getAttribute("data-showroom-totem-count")),
        steles: Number(showroom?.getAttribute("data-showroom-stele-count")),
        openings: Number(
          showroom?.getAttribute("data-showroom-opening-count"),
        ),
        openingDisplayCollisions: Number(
          showroom?.getAttribute(
            "data-showroom-opening-display-collisions",
          ),
        ),
        openingDisplayRepositions: Number(
          showroom?.getAttribute(
            "data-showroom-opening-display-repositions",
          ),
        ),
        displays: Number(
          showroom?.getAttribute("data-showroom-total-displays"),
        ),
        wallLeft:
          showroom?.getAttribute("data-showroom-surface-wall-left-color")
          ?? "",
        wallBack:
          showroom?.getAttribute("data-showroom-surface-wall-back-color")
          ?? "",
        wallRight:
          showroom?.getAttribute("data-showroom-surface-wall-right-color")
          ?? "",
      };
      return {
        ...state,
        valid:
          state.roomSize === expected.roomSize
          && state.floorFinish === expected.floorFinish
          && state.brightness === expected.brightness
          && state.totems === expected.totems
          && state.steles === expected.steles
          && state.openings === expected.openings
          && state.openingDisplayCollisions === 0
          && state.displays > 0
          && state.wallLeft.startsWith("#")
          && state.wallBack.startsWith("#")
          && state.wallRight.startsWith("#"),
      };
    }, { preset, expected }));
  }

  const signatures = states.map((state) => [
    state.roomSize,
    state.floorFinish,
    state.brightness,
    state.totems,
    state.steles,
    state.openings,
    state.displays,
    state.wallLeft,
    state.wallBack,
    state.wallRight,
  ].join("|"));
  const uniqueSignatures = new Set(signatures).size;
  const valid =
    errors.length === 0
    && states.every((state) => state.valid)
    && uniqueSignatures === states.length;

  console.log(JSON.stringify({
    valid,
    uniqueSignatures,
    states,
    errors,
  }, null, 2));
  if (!valid) process.exitCode = 1;
} finally {
  await browser.close();
}

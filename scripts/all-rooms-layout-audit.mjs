import { chromium } from "playwright-core";
import { writeFileSync } from "node:fs";

const executablePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const baseURL = process.env.SWISSCOMPACT_BASE_URL ?? "http://127.0.0.1:4174/";
const browser = await chromium.launch({ executablePath, headless: true });
let page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = [];
const attachPageListeners = () => {
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
};
const initializePage = async () => {
  await page.goto(baseURL, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.evaluate(() => {
    document.querySelector("[data-showroom]")?.scrollIntoView({ block: "start", behavior: "instant" });
  });
  await page.waitForFunction(() => (
    document.querySelector("[data-showroom]")?.getAttribute("data-showroom-ready") === "true"
  ), undefined, { timeout: 45_000 });
};
attachPageListeners();

const expectedStructures = {
  takeaway: [0, 1], restaurant: [2, 0], cafe: [0, 2],
  beautySalon: [0, 3], barber: [1, 1], physio: [1, 0],
  cinema: [0, 4], museum: [2, 0], eventHall: [3, 2],
  outdoorShop: [2, 1], mountainStation: [1, 3], fitnessCenter: [0, 2],
  fashionStore: [3, 1], electronicsStore: [2, 2], shoppingMall: [4, 3],
  corporateLobby: [1, 2], corporateMeeting: [0, 1], corporateCanteen: [2, 0],
  hotelLobby: [1, 3], spaWellness: [0, 2], guestSuite: [0, 0],
  stationTerminal: [4, 2], trafficControl: [0, 1], mobilityHub: [3, 0],
  clinicReception: [1, 2], waitingTreatment: [0, 1], careCenter: [2, 2],
  campusFoyer: [3, 1], classroom: [0, 0], libraryZone: [1, 4],
  productionHall: [2, 1], logisticsCenter: [4, 2], industrialControl: [0, 0],
  realEstateLounge: [1, 2], modelApartment: [0, 1], brandShowroom: [3, 4],
};
const expectedPartitions = {
  restaurant: 1, beautySalon: 1, cinema: 1, museum: 2, eventHall: 2,
  outdoorShop: 1, mountainStation: 1, fitnessCenter: 1, fashionStore: 2,
  electronicsStore: 2, shoppingMall: 2, corporateLobby: 1,
  corporateCanteen: 1, hotelLobby: 1, spaWellness: 1, stationTerminal: 2,
  trafficControl: 1, mobilityHub: 1, clinicReception: 1,
  waitingTreatment: 1, careCenter: 1, campusFoyer: 1, libraryZone: 2,
  productionHall: 1, logisticsCenter: 2, realEstateLounge: 1, brandShowroom: 2,
};
const expectedCounters = new Set([
  "takeaway", "restaurant", "cafe", "beautySalon", "barber", "cinema",
  "museum", "eventHall", "outdoorShop", "mountainStation", "fitnessCenter",
  "fashionStore", "electronicsStore", "shoppingMall",
]);
const screenshotPresets = new Set([
  "restaurant", "beautySalon", "eventHall", "mountainStation",
  "shoppingMall", "corporateLobby", "hotelLobby", "stationTerminal",
  "clinicReception", "campusFoyer", "logisticsCenter", "brandShowroom",
]);

try {
  await initializePage();

  const presets = await page.evaluate(() => Array.from(new Set(Array.from(
    document.querySelectorAll('[data-showroom-setting="preset"][data-value]'),
    (button) => button.getAttribute("data-value"),
  ).filter(Boolean))));
  const states = [];
  for (let presetIndex = 0; presetIndex < presets.length; presetIndex += 1) {
    const preset = presets[presetIndex];
    if (presetIndex > 0 && presetIndex % 6 === 0) {
      await page.close();
      page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
      attachPageListeners();
      await initializePage();
    }
    await page.locator(`[data-showroom-setting="preset"][data-value="${preset}"]`)
      .first().evaluate((button) => button.click());
    await page.waitForFunction((expected) => {
      const showroom = document.querySelector("[data-showroom]");
      return showroom?.getAttribute("data-showroom-preset") === expected
        && showroom?.getAttribute("data-showroom-architecture") === expected;
    }, preset, { timeout: 10_000 });
    await page.waitForTimeout(120);

    const partitionTool = page.locator('[data-showroom-focus-tool="partition"]');
    await partitionTool.evaluate((button) => button.click());
    await page.waitForFunction(() => (
      document.querySelector("[data-showroom]")?.getAttribute("data-showroom-selection-mode") === "partition"
    ));
    const partitionItems = page.locator('[data-showroom-selection-item^="partition:"]');
    const partitionItemCount = await partitionItems.count();
    let partitionRotationWorks = true;
    if (partitionItemCount > 0) {
      await partitionItems.first().evaluate((button) => button.click());
      const before = await page.locator("[data-showroom]").getAttribute("data-showroom-furnishing-rotation");
      await page.locator('[data-showroom-furnishing-rotate="15"]').evaluate((button) => button.click());
      const after = await page.locator("[data-showroom]").getAttribute("data-showroom-furnishing-rotation");
      partitionRotationWorks = before !== after;
      await page.locator("[data-showroom-object-reset]").evaluate((button) => button.click());
      await page.keyboard.press("Escape");
    }

    const state = await page.locator("[data-showroom]").evaluate((showroom) => ({
      preset: showroom.getAttribute("data-showroom-preset"),
      architecture: showroom.getAttribute("data-showroom-architecture"),
      theme: showroom.getAttribute("data-showroom-theme"),
      totalDisplays: Number(showroom.getAttribute("data-showroom-total-displays")),
      professionalDisplays: Number(showroom.getAttribute("data-showroom-professional-display-count")),
      ledSurfaces: Number(showroom.getAttribute("data-showroom-led-surface-count")),
      displayAccent: showroom.getAttribute("data-showroom-display-accent"),
      ledAccent: showroom.getAttribute("data-showroom-led-accent"),
      animatedDisplays: Number(showroom.getAttribute("data-showroom-animated-displays")),
      totems: Number(showroom.getAttribute("data-showroom-reviewed-totem-count")),
      steles: Number(showroom.getAttribute("data-showroom-reviewed-stele-count")),
      partitions: Number(showroom.getAttribute("data-showroom-reviewed-partition-count")),
      partitionMounts: Number(showroom.getAttribute("data-showroom-partition-mount-count")),
      counterPresent: showroom.getAttribute("data-showroom-counter-present") === "true",
      counterPose: showroom.getAttribute("data-showroom-counter-pose"),
      openingDisplayCollisions: Number(showroom.getAttribute("data-showroom-opening-display-collisions")),
      displayRowOverlaps: Number(showroom.getAttribute("data-showroom-display-row-overlaps")),
      openingCount: Number(showroom.getAttribute("data-showroom-opening-count")),
      layoutSignature: showroom.getAttribute("data-showroom-layout-signature"),
    }));
    state.partitionItemCount = partitionItemCount;
    state.partitionRotationWorks = partitionRotationWorks;
    states.push(state);

    if (screenshotPresets.has(preset)) {
      await page.evaluate(() => {
        document.querySelector("[data-showroom]")?.scrollIntoView({ block: "start", behavior: "instant" });
      });
      await page.screenshot({ path: `/tmp/swisscompact-room-audit-${preset}.png`, fullPage: false });
    }
  }

  const signatures = states.map((state) => state.layoutSignature);
  const responsive = [];
  for (const viewport of [
    { name: "tablet", width: 820, height: 1180 },
    { name: "mobile", width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await page.waitForTimeout(240);
    responsive.push(await page.evaluate((name) => {
      const tools = document.querySelector(".showroom-focus-tools");
      return {
        name,
        documentOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
        toolRailScrollable: tools ? tools.scrollWidth >= tools.clientWidth : false,
        partitionToolPresent: Boolean(document.querySelector('[data-showroom-focus-tool="partition"]')),
      };
    }, viewport.name));
  }

  const valid = errors.length === 0
    && presets.length === Object.keys(expectedStructures).length
    && states.every((state) => {
      const expected = expectedStructures[state.preset];
      const partitions = expectedPartitions[state.preset] ?? 0;
      return state.architecture === state.preset
        && state.totems === expected[0]
        && state.steles === expected[1]
        && state.partitions === partitions
        && state.partitionMounts === partitions
        && state.partitionItemCount === partitions
        && state.partitionRotationWorks
        && state.counterPresent === expectedCounters.has(state.preset)
        && state.totalDisplays > 0
        && state.professionalDisplays + state.ledSurfaces === state.totalDisplays
        && state.displayAccent === "#ff1748"
        && state.ledAccent === "#28e57f"
        && state.animatedDisplays > 0
        && state.openingCount >= 1
        && state.openingDisplayCollisions === 0
        && state.displayRowOverlaps === 0;
    })
    && new Set(signatures).size === signatures.length
    && responsive.every((state) => (
      !state.documentOverflow && state.toolRailScrollable && state.partitionToolPresent
    ));

  const report = {
    valid,
    roomCount: states.length,
    uniqueLayoutSignatures: new Set(signatures).size,
    states,
    responsive,
    errors,
  };
  writeFileSync("/tmp/swisscompact-room-audit.json", JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (!valid) process.exitCode = 1;
} finally {
  await browser.close();
}

import { chromium } from "playwright-core";

const executablePath =
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const baseURL =
  process.env.SWISSCOMPACT_BASE_URL ?? "http://127.0.0.1:4174/";
const browser = await chromium.launch({ executablePath, headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
const atlasResponses = new Map();

page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});
page.on("pageerror", (error) => errors.push(error.message));
page.on("response", (response) => {
  if (response.url().includes("/content-atlas/")) {
    atlasResponses.set(response.url().split("/").at(-1), response.status());
  }
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
await page.waitForFunction(() => (
  document.querySelector("[data-showroom]")?.getAttribute(
    "data-showroom-artwork-ready",
  ) === "true"
), undefined, { timeout: 20_000 });

const presets = [
  "takeaway",
  "restaurant",
  "cafe",
  "beautySalon",
  "barber",
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
  "corporateLobby",
  "corporateMeeting",
  "corporateCanteen",
  "hotelLobby",
  "spaWellness",
  "guestSuite",
  "stationTerminal",
  "trafficControl",
  "mobilityHub",
];
const contents = ["menu", "campaign", "pickup"];
const orientations = ["landscape", "portrait"];
const representativePresets = new Set([
  "restaurant",
  "beautySalon",
  "museum",
  "mountainStation",
  "electronicsStore",
  "corporateLobby",
  "corporateMeeting",
  "corporateCanteen",
  "hotelLobby",
  "spaWellness",
  "guestSuite",
  "stationTerminal",
  "trafficControl",
  "mobilityHub",
]);
const states = [];

const choose = async (setting, value) => {
  const changed = await page.evaluate(({ settingName, settingValue }) => {
    const button = Array.from(document.querySelectorAll(
      `[data-showroom-setting="${settingName}"]`,
    )).find((candidate) => (
      candidate instanceof HTMLButtonElement
      && candidate.dataset.value === settingValue
    ));
    button?.click();
    return Boolean(button);
  }, { settingName: setting, settingValue: value });
  if (!changed) throw new Error(`Missing setting ${setting}:${value}`);
  await page.waitForTimeout(90);
};

for (const preset of presets) {
  await choose("preset", preset);
  await page.waitForFunction((expected) => (
    document.querySelector("[data-showroom]")?.getAttribute(
      "data-showroom-preset",
    ) === expected
  ), preset, { timeout: 10_000 });
  for (const orientation of orientations) {
    await choose("orientation", orientation);
    for (const content of contents) {
      await choose("content", content);
      await page.waitForFunction(({ expectedContent, expectedOrientation }) => {
        const root = document.querySelector("[data-showroom]");
        return (
          root?.getAttribute("data-showroom-selected-display-content")
            === expectedContent
          && root?.getAttribute("data-showroom-selected-display-orientation")
            === expectedOrientation
        );
      }, {
        expectedContent: content,
        expectedOrientation: orientation,
      }, { timeout: 10_000 });
      const state = await page.evaluate(() => {
        const root = document.querySelector("[data-showroom]");
        return {
          preset: root?.getAttribute("data-showroom-preset"),
          content: root?.getAttribute(
            "data-showroom-selected-display-content",
          ),
          orientation: root?.getAttribute(
            "data-showroom-selected-display-orientation",
          ),
          artworkReady: root?.getAttribute("data-showroom-artwork-ready"),
          animatedDisplays: Number(
            root?.getAttribute("data-showroom-animated-displays") ?? 0,
          ),
        };
      });
      states.push(state);
    }
  }
  if (representativePresets.has(preset)) {
    await choose("orientation", "landscape");
    await choose("content", "campaign");
    await page.waitForTimeout(260);
    await page.screenshot({
      path: `/tmp/swisscompact-content-${preset}.png`,
      fullPage: false,
    });
  }
  console.log(`Display-Inhalte geprüft: ${preset}`);
}

await browser.close();

const invalidStates = states.filter((state) => (
  state.artworkReady !== "true"
  || state.animatedDisplays < 1
  || !presets.includes(state.preset)
  || !contents.includes(state.content)
  || !orientations.includes(state.orientation)
));
const expectedAtlases = [
  "gastronomy-rooms-v1.jpg",
  "beauty-rooms-v1.jpg",
  "culture-rooms-v1.jpg",
  "sport-rooms-v1.jpg",
  "retail-rooms-v1.jpg",
  "corporate-rooms-v1.jpg",
  "hospitality-rooms-v1.jpg",
  "mobility-rooms-v1.jpg",
];
const missingAtlases = expectedAtlases.filter(
  (name) => atlasResponses.get(name) !== 200,
);

console.log(JSON.stringify({
  valid: errors.length === 0
    && invalidStates.length === 0
    && missingAtlases.length === 0
    && states.length === 144,
  stateCount: states.length,
  invalidStates,
  atlasResponses: Object.fromEntries(atlasResponses),
  missingAtlases,
  errors,
}, null, 2));

if (
  errors.length
  || invalidStates.length
  || missingAtlases.length
  || states.length !== 144
) {
  process.exitCode = 1;
}

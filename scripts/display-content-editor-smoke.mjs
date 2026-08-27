import { chromium } from "playwright-core";
import path from "node:path";

const executablePath =
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const baseURL =
  process.env.SWISSCOMPACT_BASE_URL ?? "http://127.0.0.1:4174/";
const browser = await chromium.launch({ executablePath, headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});
page.on("pageerror", (error) => errors.push(error.message));

await page.goto(baseURL, { waitUntil: "domcontentloaded", timeout: 30_000 });
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
await page.locator('[data-showroom-focus-tool="display"]').evaluate(
  (button) => button.click(),
);
await page.waitForFunction(() => (
  document.querySelector('[data-showroom-selection-item^="display:"]')
  !== null
));
await page.locator('[data-showroom-selection-item^="display:"]').first()
  .evaluate((button) => button.click());
await page.locator("[data-showroom-display-preview-open]").evaluate(
  (button) => button.click(),
);
await page.waitForFunction(() => (
  document.querySelector("[data-showroom]")?.getAttribute(
    "data-showroom-display-preview-state",
  ) === "open"
));

const canvasSignature = async () => page.evaluate(() => {
  const canvas = document.querySelector("[data-showroom-display-preview-canvas]");
  if (!(canvas instanceof HTMLCanvasElement)) return 0;
  const data = canvas.getContext("2d")?.getImageData(
    0,
    0,
    canvas.width,
    canvas.height,
  ).data;
  if (!data) return 0;
  let sum = 0;
  for (let index = 0; index < data.length; index += 1009) {
    sum = (sum * 33 + data[index]) >>> 0;
  }
  return sum;
});

const signatureBefore = await canvasSignature();
const importedExample = await page.evaluate(() => ({
  template: document.querySelector("[data-showroom]")?.getAttribute(
    "data-showroom-display-template",
  ),
  layers: document.querySelectorAll(".showroom-content-editor__layer").length,
  stageItems: document.querySelectorAll("[data-showroom-content-stage-item]").length,
  title: document.querySelector("[data-showroom-content-text]")?.value,
}));
await page.locator('[data-showroom-content-add="title"]').click();
await page.locator("[data-showroom-content-text]").fill(
  "Sommerangebot für dich",
);
await page.locator("[data-showroom-content-font]").selectOption("Georgia");
await page.locator("[data-showroom-content-size]").fill("104");
await page.locator("[data-showroom-content-effect]").selectOption("float");

await page.locator('[data-showroom-content-add="price"]').click();
await page.locator("[data-showroom-content-text]").fill("CHF 24.90");
await page.locator("[data-showroom-content-color]").fill("#c6ff1b");
await page.locator("[data-showroom-content-effect]").selectOption("pulse");

await page.locator('[data-showroom-content-add="qr"]').click();
await page.locator("[data-showroom-content-qr-value]").fill(
  "https://swisscompact.com/angebot",
);
await page.locator("[data-showroom-content-size]").fill("190");
await page.locator("[data-showroom-content-effect]").selectOption("fade");

await page.locator('[data-showroom-content-image="background"]').setInputFiles(
  path.resolve("room.png"),
);
await page.locator('[data-showroom-content-image="hero"]').setInputFiles(
  path.resolve("room.png"),
);
await page.waitForFunction(() => {
  const root = document.querySelector("[data-showroom]");
  return root?.getAttribute("data-showroom-custom-content-elements") === "5"
    && root?.getAttribute("data-showroom-custom-background") === "true"
    && root?.getAttribute("data-showroom-custom-hero-image") === "true";
});
await page.locator("[data-showroom-content-hero-size]").fill("56");
await page.locator("[data-showroom-content-hero-effect]").selectOption("slide");
await page.waitForTimeout(500);

const qrStageItem = page.locator("[data-showroom-content-stage-item]").last();
const qrBounds = await qrStageItem.boundingBox();
if (!qrBounds) throw new Error("QR element is not draggable");
await page.mouse.move(
  qrBounds.x + qrBounds.width * 0.5,
  qrBounds.y + qrBounds.height * 0.5,
);
await page.mouse.down();
await page.mouse.move(
  qrBounds.x - 70,
  qrBounds.y - 35,
  { steps: 8 },
);
await page.mouse.up();
await page.waitForTimeout(160);
const xAfterDrag = Number(await page.locator(
  "[data-showroom-content-x]",
).inputValue());
const stageBounds = await page.locator("[data-showroom-content-stage]")
  .boundingBox();
if (!stageBounds) throw new Error("Content stage is missing");
await page.mouse.move(stageBounds.x + 18, stageBounds.y + 18, { steps: 5 });
await page.mouse.move(
  stageBounds.x + stageBounds.width - 18,
  stageBounds.y + stageBounds.height - 18,
  { steps: 12 },
);
await page.waitForTimeout(140);
const xAfterHover = Number(await page.locator(
  "[data-showroom-content-x]",
).inputValue());
await page.locator(".showroom-content-editor__layer").first().click();
const titleXBeforeHover = Number(await page.locator(
  "[data-showroom-content-x]",
).inputValue());
const titleBounds = await page.locator(
  "[data-showroom-content-stage-item]",
).first().boundingBox();
if (!titleBounds) throw new Error("Title element is missing");
await page.mouse.move(titleBounds.x + 2, titleBounds.y + 2, { steps: 4 });
await page.mouse.move(
  titleBounds.x + Math.max(3, titleBounds.width - 3),
  titleBounds.y + titleBounds.height * 0.5,
  { steps: 10 },
);
await page.waitForTimeout(120);
const titleXAfterHover = Number(await page.locator(
  "[data-showroom-content-x]",
).inputValue());
await page.locator(".showroom-content-editor__layer").last().click();

const signatureAfter = await canvasSignature();
await page.waitForTimeout(180);
const signatureMotion = await canvasSignature();
const state = await page.evaluate(() => {
  const root = document.querySelector("[data-showroom]");
  const editor = document.querySelector("[data-showroom-content-editor]")
    ?.getBoundingClientRect();
  const previewWindow = document.querySelector(
    ".showroom-display-preview__window",
  )?.getBoundingClientRect();
  const qrInput = document.querySelector("[data-showroom-content-qr-value]");
  return {
    elementCount: root?.getAttribute("data-showroom-custom-content-elements"),
    template: root?.getAttribute("data-showroom-display-template"),
    background: root?.getAttribute("data-showroom-custom-background"),
    hero: root?.getAttribute("data-showroom-custom-hero-image"),
    heroControlsVisible: !document.querySelector(
      "[data-showroom-content-hero-controls]",
    )?.hidden,
    layers: document.querySelectorAll(".showroom-content-editor__layer").length,
    stageItems: document.querySelectorAll("[data-showroom-content-stage-item]").length,
    selectedStageItems: document.querySelectorAll(
      ".showroom-content-stage__item.is-selected",
    ).length,
    qrValue: qrInput instanceof HTMLInputElement ? qrInput.value : "",
    x: Number(document.querySelector("[data-showroom-content-x]")?.value),
    saveState: document.querySelector(
      "[data-showroom-content-save-state]",
    )?.textContent?.trim(),
    contained: Boolean(
      editor
      && previewWindow
      && editor.left >= previewWindow.left
      && editor.right <= previewWindow.right
      && editor.top >= previewWindow.top
      && editor.bottom <= previewWindow.bottom
    ),
  };
});

await page.locator("[data-showroom-content-ai-prompt]").fill(
  "Ein modernes saisonales Schweizer Restaurantmotiv",
);
await page.locator("[data-showroom-content-ai-generate]").click();
const apiFallback = await page.locator("[data-showroom-content-ai-status]")
  .textContent();
await page.screenshot({
  path: "/tmp/swisscompact-display-content-editor.png",
  fullPage: false,
});
await browser.close();

const valid = (
  errors.length === 0
  && signatureBefore !== signatureAfter
  && signatureAfter !== signatureMotion
  && importedExample.template === "editable-example"
  && importedExample.layers === 2
  && importedExample.stageItems === 2
  && Boolean(importedExample.title?.trim())
  && state.elementCount === "5"
  && state.template === "editable-example"
  && state.background === "true"
  && state.hero === "true"
  && state.heroControlsVisible
  && state.layers === 5
  && state.stageItems === 5
  && state.selectedStageItems === 1
  && state.qrValue === "https://swisscompact.com/angebot"
  && state.x < 82
  && xAfterDrag === xAfterHover
  && titleXBeforeHover === titleXAfterHover
  && state.saveState === "Live gespeichert"
  && state.contained
  && apiFallback.includes("API")
  && apiFallback.includes("bestellen")
);

console.log(JSON.stringify({
  valid,
  signatureBefore,
  importedExample,
  signatureAfter,
  signatureMotion,
  state,
  xAfterDrag,
  xAfterHover,
  titleXBeforeHover,
  titleXAfterHover,
  apiFallback,
  errors,
}, null, 2));

if (!valid) process.exitCode = 1;

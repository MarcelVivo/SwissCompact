import { chromium } from "playwright-core";

const executablePath =
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const baseURL =
  process.env.SWISSCOMPACT_BASE_URL ?? "http://127.0.0.1:4174/";
const browser = await chromium.launch({ executablePath, headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
let chatRequest = null;
let speechRequests = 0;

page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});
page.on("pageerror", (error) => errors.push(error.message));
await page.route("**/api/assistant/speech", async (route) => {
  speechRequests += 1;
  await route.abort();
});
await page.route("**/api/assistant/chat", async (route) => {
  chatRequest = route.request().postDataJSON();
  await new Promise((resolve) => setTimeout(resolve, 260));
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      answer: "Gerne. Welchen Raum oder Standort möchtest du digitalisieren?",
      context: chatRequest.context,
      recommendation: null,
      uiActions: [],
      animationState: "listening",
      quickReplies: ["Verkaufsfläche", "Empfang", "Noch nicht sicher"],
    }),
  });
});

await page.goto(baseURL, { waitUntil: "domcontentloaded", timeout: 30_000 });
await page.waitForFunction(() => (
  document.querySelector("[data-sales-assistant]")?.getAttribute(
    "data-sales-assistant-ready",
  ) === "true"
));

const preparedBeforeOpen = await page.locator(".sales-assistant__start-menu")
  .count();
const openResult = await page.evaluate(() => {
  const trigger = document.querySelector("[data-sales-assistant-trigger]");
  const panel = document.querySelector("[data-sales-assistant-panel]");
  if (!(trigger instanceof HTMLButtonElement) || !(panel instanceof HTMLElement)) {
    return { elapsed: Number.POSITIVE_INFINITY, visible: false };
  }
  const startedAt = performance.now();
  trigger.click();
  return {
    elapsed: performance.now() - startedAt,
    visible: !panel.hidden && panel.getBoundingClientRect().height > 0,
  };
});

await page.fill("[data-sales-assistant-input]", "Wir möchten unseren Empfang digitalisieren.");
await page.click('[data-sales-assistant-composer] button[type="submit"]');
const pendingVisible = await page.locator(".sales-assistant__bubble--pending")
  .isVisible();
await page.waitForSelector(
  ".sales-assistant__bubble--assistant:not(.sales-assistant__bubble--pending)",
  { timeout: 3_000 },
);
await page.waitForFunction(() => (
  !document.querySelector("[data-sales-assistant-input]")?.hasAttribute("disabled")
));
const finalState = await page.evaluate(() => ({
  responseMs: Number(document.querySelector("[data-sales-assistant]")
    ?.getAttribute("data-sales-assistant-last-response-ms")),
  pendingCount: document.querySelectorAll(".sales-assistant__bubble--pending").length,
  inputEnabled: !(document.querySelector("[data-sales-assistant-input]")
    instanceof HTMLTextAreaElement)
    || !document.querySelector("[data-sales-assistant-input]").disabled,
}));

await browser.close();

const currentMessageDuplicated = Array.isArray(chatRequest?.history)
  && chatRequest.history.some(
    (entry) => entry.content === "Wir möchten unseren Empfang digitalisieren.",
  );
const valid = (
  preparedBeforeOpen === 1
  && openResult.visible
  && openResult.elapsed < 50
  && pendingVisible
  && finalState.responseMs >= 200
  && finalState.responseMs < 2_000
  && finalState.pendingCount === 0
  && finalState.inputEnabled
  && !currentMessageDuplicated
  && speechRequests === 0
  && errors.length === 0
);

console.log(JSON.stringify({
  valid,
  preparedBeforeOpen,
  openResult,
  pendingVisible,
  finalState,
  currentMessageDuplicated,
  speechRequests,
  errors,
}, null, 2));

if (!valid) process.exitCode = 1;

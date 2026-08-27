import { chromium } from "playwright-core";

// Needs the /api/assistant/* routes to actually be served, which plain
// `vite preview` does not do — run this against `vercel dev` (see
// package.json's "dev" script does NOT cover this) or a deployed preview
// URL via SWISSCOMPACT_BASE_URL.
const executablePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const baseURL = process.env.SWISSCOMPACT_BASE_URL ?? "http://127.0.0.1:3000/";
const errors = [];
const browser = await chromium.launch({ executablePath, headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

page.on("pageerror", (error) => errors.push(error.message));

// Intercept the lead submission and mark it as a smoke test so the route
// skips real Supabase/Resend side effects instead of polluting the CRM.
await page.route("**/api/assistant/lead", (route) => {
  route.continue({ headers: { ...route.request().headers(), "x-smoke-test": "1" } });
});

await page.goto(baseURL, { waitUntil: "domcontentloaded", timeout: 30_000 });
await page.waitForSelector("[data-sales-assistant-trigger]");

await page.click("[data-sales-assistant-trigger]");
const expanded = await page.getAttribute("[data-sales-assistant-trigger]", "aria-expanded");
const panelVisible = await page.isVisible("[data-sales-assistant-panel]");

await page.fill(
  "[data-sales-assistant-input]",
  "Wir betreiben drei Filialen und wollen die Displays zentral steuern.",
);
await page.click('[data-sales-assistant-composer] button[type="submit"]');
await page.waitForSelector(".sales-assistant__bubble--assistant", { timeout: 20_000 });
const firstReply = await page.textContent(".sales-assistant__bubble--assistant");

await page.fill("[data-sales-assistant-input]", "Wo bekomme ich in Zürich gutes Sushi?");
await page.click('[data-sales-assistant-composer] button[type="submit"]');
await page.waitForTimeout(4000);
const bubbles = await page.$$eval(".sales-assistant__bubble--assistant", (nodes) =>
  nodes.map((node) => node.textContent || ""),
);
const offTopicReply = bubbles[bubbles.length - 1] ?? "";
const recommendationVisible = await page.isVisible(".sales-assistant__recommendation").catch(() => false);

await page.click(".sales-assistant__contact-cta");
await page.waitForSelector(".sales-assistant__contact-form");
const stamp = Date.now();
await page.fill('.sales-assistant__contact-form input[name="name"]', "Smoke Test");
await page.fill('.sales-assistant__contact-form input[name="email"]', `smoke-test+${stamp}@swisscompact.com`);
await page.fill('.sales-assistant__contact-form input[name="phone"]', "+41 79 000 00 00");
await page.check(".sales-assistant__consent input");
await page.click('.sales-assistant__contact-form button[type="submit"]');
await page.waitForSelector(".sales-assistant__success", { timeout: 15_000 });
const successVisible = await page.isVisible(".sales-assistant__success");

await browser.close();

const failures = [
  expanded !== "true" ? "Trigger did not report aria-expanded=true after click" : "",
  !panelVisible ? "Panel did not become visible after click" : "",
  !firstReply ? "No assistant reply received for a business-relevant message" : "",
  !/nicht helfen|fokus liegt/i.test(offTopicReply) ? `Off-topic redirect copy not found in: "${offTopicReply}"` : "",
  recommendationVisible ? "Recommendation card shown for an off-topic message" : "",
  !successVisible ? "Contact form did not reach the success view" : "",
  errors.length > 0 ? `Browser errors: ${errors.join(" | ")}` : "",
].filter(Boolean);

if (failures.length > 0) {
  throw new Error(failures.join("\n"));
}

console.log("sales-assistant-smoke: ok");

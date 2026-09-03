import assert from "node:assert/strict";
import { chromium } from "playwright-core";

const executablePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const baseURL = process.env.SWISSCOMPACT_BASE_URL ?? "http://127.0.0.1:4174/";
const browser = await chromium.launch({ executablePath, headless: true });

try {
  for (const viewport of [
    { name: "desktop", width: 1440, height: 900 },
    { name: "mobile", width: 390, height: 844 },
    { name: "short-mobile", width: 320, height: 568 },
  ]) {
    const context = await browser.newContext({
      viewport,
      hasTouch: viewport.name !== "desktop",
      isMobile: viewport.name !== "desktop",
      reducedMotion: "reduce",
      serviceWorkers: "block",
    });
    await context.route(/\.(?:mp4|webm|jpg|jpeg|png|webp)(?:\?.*)?$/i, (route) => route.abort());
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(baseURL, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForSelector("[data-sales-assistant-ready='true']", { timeout: 15_000 });

    const state = await page.evaluate(() => {
      const platformCards = [...document.querySelectorAll(".business-platform__card")];
      const platformLinks = platformCards.map((card) => {
        const link = card.querySelector(".business-platform__card-link");
        const cardBounds = card.getBoundingClientRect();
        const linkBounds = link?.getBoundingClientRect();
        return {
          href: link?.getAttribute("href"),
          coversCard: Boolean(linkBounds
            && Math.abs(cardBounds.width - linkBounds.width) <= 1
            && Math.abs(cardBounds.height - linkBounds.height) <= 1),
        };
      });

      const openAndClose = (triggerSelector, dialogSelector, closeSelector) => {
        const trigger = document.querySelector(triggerSelector);
        const dialog = document.querySelector(dialogSelector);
        const close = document.querySelector(closeSelector);
        if (!(trigger instanceof HTMLElement)
          || !(dialog instanceof HTMLDialogElement)
          || !(close instanceof HTMLElement)) return false;
        trigger.click();
        const opened = dialog.open;
        close.click();
        return opened && !dialog.open;
      };

      return {
        platformLinks,
        impactDialog: openAndClose(
          '[data-impact-detail="attention"]',
          "[data-impact-detail-dialog]",
          "[data-impact-detail-close]",
        ),
        projectDialog: openAndClose(
          '[data-project-step="strategy"]',
          "[data-project-detail-dialog]",
          "[data-project-detail-close]",
        ),
        mediaDialog: openAndClose(
          '[data-media-studio-detail="motion"]',
          "[data-media-detail-dialog]",
          "[data-media-detail-close]",
        ),
        stationLinks: [...document.querySelectorAll(".station__details")].map((link) => ({
          href: link.getAttribute("href"),
          display: getComputedStyle(link).display,
          height: link.getBoundingClientRect().height,
        })),
      };
    });

    assert.equal(state.platformLinks.length, 4, `${viewport.name}: Plattformkarten fehlen`);
    assert.ok(state.platformLinks.every((link) => link.href && link.coversCard), `${viewport.name}: Plattformkarte ist nicht vollständig verlinkt`);
    assert.ok(state.impactDialog, `${viewport.name}: Wirkungsdetail öffnet oder schliesst nicht`);
    assert.ok(state.projectDialog, `${viewport.name}: Projektdetail öffnet oder schliesst nicht`);
    assert.ok(state.mediaDialog, `${viewport.name}: Media-Detail öffnet oder schliesst nicht`);
    assert.equal(state.stationLinks.length, 10, `${viewport.name}: Einsatzbereich-Links fehlen`);
    assert.ok(state.stationLinks.every((link) => link.href && link.display !== "none"), `${viewport.name}: Einsatzbereich-Link ist ausgeblendet`);
    if (viewport.name !== "desktop") {
      assert.ok(state.stationLinks.every((link) => link.height >= 44), `${viewport.name}: Einsatzbereich-Link ist als Touchziel zu klein`);
    }
    assert.deepEqual(errors, [], `${viewport.name}: JavaScript-Fehler: ${errors.join(" | ")}`);
    await context.close();
  }
} finally {
  await browser.close();
}

console.log("Public card click checks passed on desktop and mobile.");

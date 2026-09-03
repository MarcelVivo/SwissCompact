import assert from "node:assert/strict";
import { chromium } from "playwright-core";

const executablePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const baseURL = process.env.SWISSCOMPACT_BASE_URL ?? "http://127.0.0.1:4174/";
const browser = await chromium.launch({ executablePath, headless: true });

try {
  for (const viewport of [
    { name: "wide-desktop", width: 2686, height: 950 },
    { name: "desktop", width: 1440, height: 900 },
    { name: "mobile", width: 390, height: 844 },
    { name: "short-mobile", width: 320, height: 568 },
  ]) {
    const context = await browser.newContext({
      viewport,
      hasTouch: viewport.name.includes("mobile"),
      isMobile: viewport.name.includes("mobile"),
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
    assert.ok(state.mediaDialog, `${viewport.name}: Media-Detail öffnet oder schliesst nicht`);
    assert.equal(state.stationLinks.length, 10, `${viewport.name}: Einsatzbereich-Links fehlen`);
    assert.ok(state.stationLinks.every((link) => link.href && link.display !== "none"), `${viewport.name}: Einsatzbereich-Link ist ausgeblendet`);
    if (viewport.name.includes("mobile")) {
      assert.ok(state.stationLinks.every((link) => link.height >= 44), `${viewport.name}: Einsatzbereich-Link ist als Touchziel zu klein`);
    }

    for (const projectStep of ["strategy", "media", "system", "operations"]) {
      await page.evaluate((step) => {
        document.querySelector(`[data-project-step="${step}"]`)
          ?.scrollIntoView({ block: "center", behavior: "instant" });
      }, projectStep);
      await page.waitForTimeout(100);

      const trigger = page.locator(`[data-project-step="${projectStep}"]`);
      const bounds = await trigger.boundingBox();
      assert.ok(bounds, `${viewport.name}: Projektkarte ${projectStep} ist nicht sichtbar`);
      const point = {
        x: bounds.x + bounds.width / 2,
        y: bounds.y + bounds.height / 2,
      };
      const receivesPointer = await page.evaluate(({ x, y, step }) => (
        document.elementFromPoint(x, y)
          ?.closest(`[data-project-step="${step}"]`)
          ?.getAttribute("data-project-step") === step
      ), { ...point, step: projectStep });
      assert.ok(receivesPointer, `${viewport.name}: Projektkarte ${projectStep} wird von einem anderen Element überlagert`);

      await page.mouse.click(point.x, point.y);
      await page.waitForFunction((step) => {
        const dialog = document.querySelector("[data-project-detail-dialog]");
        return dialog instanceof HTMLDialogElement
          && dialog.open
          && dialog.dataset.projectDetailActive === step;
      }, projectStep);
      await page.locator("[data-project-detail-close]").evaluate((button) => {
        if (button instanceof HTMLElement) button.click();
      });
      await page.waitForFunction(() => {
        const dialog = document.querySelector("[data-project-detail-dialog]");
        return dialog instanceof HTMLDialogElement && !dialog.open;
      });
    }

    assert.deepEqual(errors, [], `${viewport.name}: JavaScript-Fehler: ${errors.join(" | ")}`);
    await context.close();
  }
} finally {
  await browser.close();
}

console.log("Public card click checks passed on desktop and mobile.");

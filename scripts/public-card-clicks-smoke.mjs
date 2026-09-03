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

    for (const mediaDetail of ["motion", "film", "three-d", "campaigns", "templates"]) {
      await page.evaluate((detail) => {
        document.querySelector(`[data-media-studio-detail="${detail}"]`)
          ?.scrollIntoView({ block: "center", behavior: "instant" });
      }, mediaDetail);
      await page.waitForTimeout(100);

      const action = page.locator(
        `[data-media-studio-detail="${mediaDetail}"] .media-tile__action`,
      );
      const bounds = await action.boundingBox();
      assert.ok(bounds, `${viewport.name}: Media-Karte ${mediaDetail} ist nicht sichtbar`);
      const point = {
        x: bounds.x + bounds.width / 2,
        y: bounds.y + bounds.height / 2,
      };
      const receivesPointer = await page.evaluate(({ x, y, detail }) => (
        document.elementFromPoint(x, y)
          ?.closest(`[data-media-studio-detail="${detail}"]`)
          ?.getAttribute("data-media-studio-detail") === detail
      ), { ...point, detail: mediaDetail });
      assert.ok(receivesPointer, `${viewport.name}: Media-Karte ${mediaDetail} wird von einem anderen Element überlagert`);

      await page.mouse.click(point.x, point.y);
      await page.waitForFunction((detail) => {
        const dialog = document.querySelector("[data-media-detail-dialog]");
        return dialog instanceof HTMLDialogElement
          && dialog.open
          && dialog.dataset.mediaDetailActive === detail;
      }, mediaDetail);
      await page.locator("[data-media-detail-close]").evaluate((button) => {
        if (button instanceof HTMLElement) button.click();
      });
      await page.waitForFunction(() => {
        const dialog = document.querySelector("[data-media-detail-dialog]");
        return dialog instanceof HTMLDialogElement && !dialog.open;
      });
    }

    const clickAtCenter = async (locator, name) => {
      await locator.scrollIntoViewIfNeeded();
      const bounds = await locator.boundingBox();
      assert.ok(bounds, `${viewport.name}: ${name} ist nicht sichtbar`);
      const point = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
      const receivesPointer = await locator.evaluate((element, { x, y }) => (
        document.elementFromPoint(x, y)?.closest("a, button") === element
      ), point);
      assert.ok(receivesPointer, `${viewport.name}: ${name} hat keine passende Klickfläche`);
      await page.mouse.click(point.x, point.y);
    };

    const consultationCta = page.locator("[data-sales-assistant-open]").last();
    await clickAtCenter(consultationCta, "Projekt-CTA");
    await page.waitForFunction(() => document.body.classList.contains("is-sales-assistant-open"));
    await page.locator("[data-sales-assistant-close]").click();
    await page.waitForFunction(() => !document.body.classList.contains("is-sales-assistant-open"));

    await clickAtCenter(page.locator("[data-sales-assistant-trigger]"), "Beratung-CTA");
    await page.waitForFunction(() => document.body.classList.contains("is-sales-assistant-open"));
    await page.locator("[data-sales-assistant-close]").click();

    await clickAtCenter(page.locator("[data-showroom-funnel-trigger]"), "Raumgestaltungs-CTA");
    await page.waitForFunction(() => document.body.classList.contains("is-showroom-funnel-open"));
    await page.locator("[data-showroom-funnel-close]").click();
    await page.waitForFunction(() => !document.body.classList.contains("is-showroom-funnel-open"));

    const restart = page.locator('[data-experience-start="0.08"]');
    await clickAtCenter(restart, "Erlebnis-Neustart");
    await page.waitForFunction(() => window.scrollY < 10);

    assert.deepEqual(errors, [], `${viewport.name}: JavaScript-Fehler: ${errors.join(" | ")}`);
    await context.close();
  }

  const fallbackContext = await browser.newContext({ javaScriptEnabled: false });
  const fallbackPage = await fallbackContext.newPage();
  await fallbackPage.goto(baseURL, { waitUntil: "domcontentloaded", timeout: 30_000 });
  const fallbackHrefs = await fallbackPage.locator(
    "[data-sales-assistant-open], [data-sales-assistant-trigger], [data-showroom-funnel-trigger], [data-project-step], [data-media-studio-detail]",
  ).evaluateAll((elements) => elements.map((element) => element.getAttribute("href")));
  assert.ok(
    fallbackHrefs.length >= 15
      && fallbackHrefs.every((href) => href?.startsWith("mailto:kontakt@swisscompact.com")),
    "CTAs und Detailkarten bieten ohne JavaScript keinen verlässlichen Kontaktweg",
  );
  assert.equal(
    await fallbackPage.locator('[data-experience-start="0.08"]').getAttribute("href"),
    "/#top",
    "Erlebnis-Neustart bietet ohne JavaScript keine Startseiten-Navigation",
  );
  await fallbackContext.close();
} finally {
  await browser.close();
}

console.log("Public card click checks passed on desktop and mobile.");

import { chromium } from "playwright-core";

const executablePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const baseURL = process.env.SWISSCOMPACT_BASE_URL ?? "http://127.0.0.1:4173/";
const viewports = [
  { name: "compact", width: 320, height: 568 },
  { name: "phone", width: 390, height: 844 },
  { name: "large-phone", width: 430, height: 932 },
];

const browser = await chromium.launch({ executablePath, headless: true });
const results = [];

for (const viewport of viewports) {
  const context = await browser.newContext({
    viewport,
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));

  await page.goto(baseURL, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForSelector("#station-1.is-active", { timeout: 15_000 });
  await page.waitForTimeout(300);

  const initial = await page.evaluate(() => {
    const bounds = (selector) => {
      const rect = document.querySelector(selector)?.getBoundingClientRect();
      return rect && {
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        left: rect.left,
        width: rect.width,
        height: rect.height,
      };
    };
    const touchTargets = Array.from(document.querySelectorAll(
      ".menu-toggle, .hero-actions button, .hero-actions .button, .showroom-funnel__trigger, .sales-assistant__trigger",
    )).map((element) => {
      const rect = element.getBoundingClientRect();
      return { selector: element.className, width: rect.width, height: rect.height };
    });
    const hero = bounds("#station-1");
    return {
      hero,
      touchTargets,
      pictogramCount: document.querySelectorAll(".ui-pictogram").length,
      heroUsesSvgPictograms: document.querySelectorAll(
        ".hero-actions .ui-pictogram",
      ).length >= 2,
      horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
      navInert: document.querySelector("#primary-nav")?.hasAttribute("inert") ?? false,
      contentFits: Boolean(hero && hero.top >= 0 && hero.bottom <= window.innerHeight),
    };
  });
  await page.screenshot({ path: `/tmp/swisscompact-mobile-${viewport.name}-hero.png` });

  await page.evaluate(() => {
    const scroller = document.querySelector("#scroller");
    const maximum = Math.max(
      1,
      (scroller instanceof HTMLElement ? scroller.offsetHeight : 1)
        - window.innerHeight,
    );
    window.scrollTo(0, 0.12 / 11 * maximum);
  });
  await page.waitForFunction(() => {
    const video = document.querySelector(".intro__scroll-video--forward");
    return video instanceof HTMLVideoElement
      && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
      && video.videoWidth > 0;
  }, undefined, { timeout: 20_000 });
  await page.waitForTimeout(450);
  const heroVideo = await page.evaluate(() => {
    const video = document.querySelector(".intro__scroll-video--forward");
    if (!(video instanceof HTMLVideoElement)) return null;
    const funnel = document.querySelector(".showroom-funnel__trigger")?.getBoundingClientRect();
    const scale = Math.min(
      window.innerWidth / video.videoWidth,
      window.innerHeight / video.videoHeight,
    );
    return {
      objectFit: getComputedStyle(video).objectFit,
      scrollMediaOpacity: getComputedStyle(video.parentElement).opacity,
      heroCopyOpacity: getComputedStyle(document.querySelector("#station-1")).opacity,
      naturalWidth: video.videoWidth,
      naturalHeight: video.videoHeight,
      renderedContentWidth: video.videoWidth * scale,
      viewportWidth: window.innerWidth,
      funnel: funnel && {
        left: funnel.left,
        right: funnel.right,
        width: funnel.width,
        text: document.querySelector(".showroom-funnel__trigger")?.textContent?.trim(),
      },
    };
  });
  await page.screenshot({ path: `/tmp/swisscompact-mobile-${viewport.name}-scroll-video.png` });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(100);

  await page.locator("[data-menu-toggle]").click();
  await page.waitForTimeout(380);
  const menuOpen = await page.evaluate(() => {
    const nav = document.querySelector("#primary-nav");
    const rect = nav?.getBoundingClientRect();
    return {
      expanded: document.querySelector("[data-menu-toggle]")?.getAttribute("aria-expanded"),
      inert: nav?.hasAttribute("inert") ?? true,
      focusInside: nav?.contains(document.activeElement) ?? false,
      bounds: rect && { left: rect.left, right: rect.right, width: rect.width },
      fits: Boolean(rect && rect.left >= -1 && rect.right <= window.innerWidth + 1),
      floatingActionsHidden: [
        document.querySelector(".showroom-funnel__trigger"),
        document.querySelector(".sales-assistant"),
      ].every((element) => element && getComputedStyle(element).visibility === "hidden"),
    };
  });
  await page.screenshot({ path: `/tmp/swisscompact-mobile-${viewport.name}-menu.png` });
  await page.keyboard.press("Escape");
  const menuClosed = await page.evaluate(() => ({
    expanded: document.querySelector("[data-menu-toggle]")?.getAttribute("aria-expanded"),
    inert: document.querySelector("#primary-nav")?.hasAttribute("inert") ?? false,
    focusRestored: document.activeElement === document.querySelector("[data-menu-toggle]"),
  }));

  await page.locator(".hero-actions [data-marketing-target=\"#wirkung\"]").click();
  await page.waitForFunction(() => document.body.classList.contains("is-marketing-view"), {
    timeout: 10_000,
  });
  await page.waitForTimeout(1200);
  const marketing = await page.evaluate(() => {
    const rect = (selector) => document.querySelector(selector)?.getBoundingClientRect();
    const funnel = rect(".showroom-funnel__trigger");
    const assistant = rect(".sales-assistant__trigger");
    const overlaps = Boolean(funnel && assistant && !(
      funnel.right <= assistant.left
      || assistant.right <= funnel.left
      || funnel.bottom <= assistant.top
      || assistant.bottom <= funnel.top
    ));
    const controlsFit = [funnel, assistant].every((item) => item
      && item.left >= 0
      && item.right <= window.innerWidth
      && item.top >= 0
      && item.bottom <= window.innerHeight);
    return {
      horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
      fixedControlsOverlap: overlaps,
      controlsFit,
    };
  });
  await page.screenshot({ path: `/tmp/swisscompact-mobile-${viewport.name}-marketing.png` });

  await page.locator("[data-sales-assistant-trigger]").click();
  await page.waitForSelector("[data-sales-assistant-panel]:not([hidden])");
  await page.waitForTimeout(100);
  const assistant = await page.evaluate(() => {
    const panel = document.querySelector("[data-sales-assistant-panel]")?.getBoundingClientRect();
    const textarea = document.querySelector("[data-sales-assistant-input]");
    const close = document.querySelector("[data-sales-assistant-close]")?.getBoundingClientRect();
    return {
      panelFits: Boolean(panel
        && panel.left >= -1
        && panel.right <= window.innerWidth + 1
        && panel.top >= -1
        && panel.bottom <= window.innerHeight + 1),
      inputFontSize: textarea ? Number.parseFloat(getComputedStyle(textarea).fontSize) : 0,
      closeTarget: close && { width: close.width, height: close.height },
      startsAtTop: document.querySelector("[data-sales-assistant-body]")?.scrollTop === 0,
      closeHasFocus: document.activeElement === document.querySelector("[data-sales-assistant-close]"),
      funnelHidden: getComputedStyle(
        document.querySelector(".showroom-funnel__trigger"),
      ).visibility === "hidden",
    };
  });
  await page.screenshot({ path: `/tmp/swisscompact-mobile-${viewport.name}-assistant.png` });

  const valid = errors.length === 0
    && !initial.horizontalOverflow
    && initial.navInert
    && initial.contentFits
    && initial.pictogramCount > 10
    && initial.heroUsesSvgPictograms
    && heroVideo?.objectFit === "contain"
    && heroVideo.renderedContentWidth >= heroVideo.viewportWidth - 1
    && heroVideo.funnel?.width >= heroVideo.viewportWidth - 100
    && initial.touchTargets.every((target) => target.height >= 44 && target.width >= 44)
    && menuOpen.expanded === "true"
    && !menuOpen.inert
    && menuOpen.focusInside
    && menuOpen.fits
    && menuOpen.floatingActionsHidden
    && menuClosed.expanded === "false"
    && menuClosed.inert
    && menuClosed.focusRestored
    && !marketing.horizontalOverflow
    && !marketing.fixedControlsOverlap
    && marketing.controlsFit
    && assistant.panelFits
    && assistant.inputFontSize >= 16
    && assistant.closeTarget?.width >= 44
    && assistant.closeTarget?.height >= 44
    && assistant.startsAtTop
    && assistant.closeHasFocus
    && assistant.funnelHidden;

  results.push({ viewport, valid, errors, initial, heroVideo, menuOpen, menuClosed, marketing, assistant });
  await context.close();
}

await browser.close();
const valid = results.every((result) => result.valid);
console.log(JSON.stringify({ valid, results }, null, 2));
if (!valid) process.exitCode = 1;

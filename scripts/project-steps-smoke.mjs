import { chromium } from "playwright-core";

const executablePath =
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const baseURL =
  process.env.SWISSCOMPACT_BASE_URL ?? "http://127.0.0.1:4174/";
const browser = await chromium.launch({ executablePath, headless: true });
const errors = [];

const preparePage = async (viewport) => {
  const page = await browser.newPage({ viewport });
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(baseURL, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.locator("#projekte").scrollIntoViewIfNeeded();
  await page.waitForTimeout(180);
  return page;
};

const inspectDialog = async (page) => page.evaluate(() => {
  const dialog = document.querySelector("[data-project-detail-dialog]");
  const surface = dialog?.querySelector(".project-detail__surface");
  const bounds = dialog?.getBoundingClientRect();
  const surfaceBounds = surface?.getBoundingClientRect();
  return {
    open: dialog instanceof HTMLDialogElement && dialog.open,
    active: dialog?.getAttribute("data-project-detail-active"),
    title: dialog?.querySelector("[data-project-detail-title]")
      ?.textContent?.trim(),
    intro: dialog?.querySelector("[data-project-detail-intro]")
      ?.textContent?.trim(),
    result: dialog?.querySelector("[data-project-detail-result]")
      ?.textContent?.trim(),
    services: dialog?.querySelectorAll("[data-project-detail-services] li")
      .length,
    bodyLocked: document.body.classList.contains("is-project-detail-open"),
    contained: Boolean(
      bounds
      && bounds.left >= -1
      && bounds.top >= -1
      && bounds.right <= window.innerWidth + 1
      && bounds.bottom <= window.innerHeight + 1
    ),
    surfaceScrollable: Boolean(
      surfaceBounds
      && surfaceBounds.height <= window.innerHeight + 1
      && surface instanceof HTMLElement
      && surface.scrollHeight >= surface.clientHeight
    ),
  };
});

const desktop = await preparePage({ width: 1440, height: 900 });
const keys = ["strategy", "media", "system", "operations"];
const expectedTitles = ["Strategie", "Media", "System", "Betrieb"];
const desktopStates = [];

for (let index = 0; index < keys.length; index += 1) {
  const trigger = desktop.locator(`[data-project-step="${keys[index]}"]`);
  if (index === 0) {
    await trigger.focus();
    await desktop.keyboard.press("Enter");
  } else {
    await trigger.click();
  }
  await desktop.waitForFunction(() => (
    document.querySelector("[data-project-detail-dialog]")?.hasAttribute("open")
  ));
  desktopStates.push(await inspectDialog(desktop));
  await desktop.locator("[data-project-detail-close]").click();
  await desktop.waitForFunction(() => (
    !document.querySelector("[data-project-detail-dialog]")?.hasAttribute("open")
  ));
  const restored = await trigger.evaluate((button) => document.activeElement === button);
  if (!restored) errors.push(`Focus was not restored for ${keys[index]}`);
}
await desktop.screenshot({
  path: "/tmp/swisscompact-project-steps-desktop.png",
  fullPage: false,
});
await desktop.close();

const mobile = await preparePage({ width: 390, height: 844 });
await mobile.locator('[data-project-step="media"]').click();
await mobile.waitForFunction(() => (
  document.querySelector("[data-project-detail-dialog]")?.hasAttribute("open")
));
await mobile.waitForTimeout(700);
const mobileState = await inspectDialog(mobile);
await mobile.screenshot({
  path: "/tmp/swisscompact-project-steps-mobile.png",
  fullPage: false,
});
await mobile.keyboard.press("Escape");
const mobileClosed = await mobile.waitForFunction(() => (
  !document.querySelector("[data-project-detail-dialog]")?.hasAttribute("open")
));
await mobile.close();
await browser.close();

const validDesktop = desktopStates.every((state, index) => (
  state.open
  && state.active === keys[index]
  && state.title === expectedTitles[index]
  && Boolean(state.intro)
  && Boolean(state.result)
  && state.services === 4
  && state.bodyLocked
  && state.contained
));
const uniqueIntros = new Set(desktopStates.map((state) => state.intro)).size === 4;
const validMobile = (
  mobileState.open
  && mobileState.active === "media"
  && mobileState.title === "Media"
  && mobileState.services === 4
  && mobileState.bodyLocked
  && mobileState.contained
  && mobileState.surfaceScrollable
  && Boolean(mobileClosed)
);

console.log(JSON.stringify({
  valid: validDesktop && uniqueIntros && validMobile && errors.length === 0,
  desktopStates,
  mobileState,
  errors,
}, null, 2));

if (!validDesktop || !uniqueIntros || !validMobile || errors.length > 0) {
  process.exitCode = 1;
}

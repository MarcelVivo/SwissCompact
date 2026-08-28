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
  await page.locator("#media-studio").scrollIntoViewIfNeeded();
  await page.waitForTimeout(180);
  return page;
};

const inspect = async (page) => page.evaluate(() => {
  const dialog = document.querySelector("[data-media-detail-dialog]");
  const surface = dialog?.querySelector(".project-detail__surface");
  const bounds = dialog?.getBoundingClientRect();
  return {
    open: dialog instanceof HTMLDialogElement && dialog.open,
    active: dialog?.getAttribute("data-media-detail-active"),
    title: dialog?.querySelector("[data-media-detail-title]")?.textContent?.trim(),
    intro: dialog?.querySelector("[data-media-detail-intro]")?.textContent?.trim(),
    result: dialog?.querySelector("[data-media-detail-result]")?.textContent?.trim(),
    services: dialog?.querySelectorAll("[data-media-detail-services] li").length,
    locked: document.body.classList.contains("is-media-detail-open"),
    contained: Boolean(
      bounds
      && bounds.left >= -1
      && bounds.top >= -1
      && bounds.right <= window.innerWidth + 1
      && bounds.bottom <= window.innerHeight + 1
    ),
    scrollable: surface instanceof HTMLElement
      && surface.scrollHeight >= surface.clientHeight,
  };
});

const keys = ["motion", "film", "three-d", "campaigns", "templates"];
const titles = ["Motion Design", "Film", "3D", "Campaign Systems", "Templates"];
const desktop = await preparePage({ width: 1440, height: 900 });
const desktopStates = [];

for (let index = 0; index < keys.length; index += 1) {
  const trigger = desktop.locator(`[data-media-studio-detail="${keys[index]}"]`);
  if (index === 0) {
    await trigger.focus();
    await desktop.keyboard.press("Enter");
  } else {
    await trigger.click();
  }
  await desktop.waitForFunction(() => (
    document.querySelector("[data-media-detail-dialog]")?.hasAttribute("open")
  ));
  desktopStates.push(await inspect(desktop));
  await desktop.locator("[data-media-detail-close]").click();
  const focusRestored = await trigger.evaluate(
    (button) => document.activeElement === button,
  );
  if (!focusRestored) errors.push(`Focus was not restored for ${keys[index]}`);
}
await desktop.close();

const mobile = await preparePage({ width: 390, height: 844 });
await mobile.locator('[data-media-studio-detail="three-d"]').click();
await mobile.waitForFunction(() => (
  document.querySelector("[data-media-detail-dialog]")?.hasAttribute("open")
));
await mobile.waitForTimeout(300);
const mobileState = await inspect(mobile);
await mobile.screenshot({
  path: "/tmp/swisscompact-media-detail-mobile.png",
  fullPage: false,
});
await mobile.keyboard.press("Escape");
const mobileClosed = await mobile.locator("[data-media-detail-dialog]")
  .evaluate((dialog) => !dialog.hasAttribute("open"));
await mobile.close();
await browser.close();

const validDesktop = desktopStates.every((state, index) => (
  state.open
  && state.active === keys[index]
  && state.title === titles[index]
  && Boolean(state.intro)
  && Boolean(state.result)
  && state.services === 4
  && state.locked
  && state.contained
));
const distinctContent = new Set(desktopStates.map((state) => state.intro)).size
  === keys.length;
const validMobile = (
  mobileState.open
  && mobileState.active === "three-d"
  && mobileState.title === "3D"
  && mobileState.services === 4
  && mobileState.locked
  && mobileState.contained
  && mobileState.scrollable
  && mobileClosed
);

console.log(JSON.stringify({
  valid: validDesktop && distinctContent && validMobile && errors.length === 0,
  desktopStates,
  mobileState,
  errors,
}, null, 2));

if (!validDesktop || !distinctContent || !validMobile || errors.length > 0) {
  process.exitCode = 1;
}

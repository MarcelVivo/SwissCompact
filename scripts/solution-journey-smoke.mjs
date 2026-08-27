import { chromium } from "playwright-core";

const executablePath =
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const baseURL =
  process.env.SWISSCOMPACT_BASE_URL ?? "http://127.0.0.1:4173/";
const browser = await chromium.launch({ executablePath, headless: true });
const results = [];

for (const viewport of [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 390, height: 844 },
]) {
  const page = await browser.newPage({ viewport });
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));

  await page.goto(baseURL, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.evaluate(() => localStorage.removeItem("swisscompact-solutions"));
  await page.locator("[data-marketing-target=\"#wirkung\"]").first().click();
  await page.locator("[data-showroom]").scrollIntoViewIfNeeded();
  await page.waitForFunction(() => (
    document.querySelector("[data-showroom]")?.getAttribute(
      "data-showroom-ready",
    ) === "true"
  ), undefined, { timeout: 45_000 });

  const enabledExtendedCategories = await page.locator(
    "[data-showroom-solution-category]:not([disabled])",
  ).count();
  await page.locator("[data-journey-open]").click();
  const categoryCount = await page.locator(
    "[data-journey-category-id]",
  ).count();
  await page.locator("[data-journey-category-id=\"realestate\"]").click();
  const roomCount = await page.locator("[data-journey-room-id]").count();
  await page.locator("[data-journey-room-id=\"sales\"]").click();
  await page.waitForFunction(() => (
    document.querySelector("[data-showroom]")?.getAttribute(
      "data-showroom-preset",
    ) === "fashionStore"
  ));

  const hotspotCount = await page.locator("[data-journey-hotspot]").count();
  const scenarioCount = await page.locator("[data-journey-scenario]").count();
  const roomConfigurationButtonVisible = await page.locator(
    "[data-journey-room-config]",
  ).isVisible();
  const headerConsultationVisible = await page.locator(
    ".solution-journey__header [data-journey-consult]",
  ).isVisible();
  await page.locator("[data-journey-scenario=\"2\"]").click();
  await page.locator("[data-journey-hotspot=\"experience\"]").click();
  await page.waitForTimeout(400);
  const panelStepCount = await page.locator(
    "[data-journey-panel-step]",
  ).count();
  const focusAnimationVisible = await page.locator(
    "[data-journey-focus-beam]",
  ).isVisible();
  if (viewport.name === "desktop") {
    await page.locator(
      ".solution-journey__hotspots [data-journey-hotspot=\"operations\"]",
    ).click();
  } else {
    await page.locator(
      "[data-journey-panel-step=\"operations\"]",
    ).first().click();
  }
  const pointThreeClickable = (
    await page.locator("[data-journey-panel] h3").innerText()
  ).includes("Betrieb & Service");
  await page.keyboard.press("ArrowLeft");
  const keyboardNavigationComplete = (
    await page.locator("[data-journey-panel] h3").innerText()
  ).includes("Erlebnis & Aktivierung");
  const panelText = await page.locator("[data-journey-panel]").textContent();
  const flyoutConfigurationButtonAvailable = await page.locator(
    "[data-journey-panel] [data-journey-configure]",
  ).isVisible();
  await page.screenshot({
    path: `/tmp/swisscompact-solution-journey-${viewport.name}.png`,
    fullPage: false,
  });
  await page.locator("[data-journey-save]").click();
  const savedCount = await page.locator(
    "[data-journey-saved-count]",
  ).first().innerText();
  await page.locator(
    "[data-journey-panel] [data-journey-consult]",
  ).click();
  const consultationVisible = await page.locator(
    "[data-journey-consult-panel]",
  ).isVisible();
  const consultationText = await page.locator(
    "[data-journey-consult-panel]",
  ).textContent();
  const leadFormComplete = await page.locator(
    "[data-journey-lead-form] :is(input, select, textarea)",
  ).count();
  await page.locator('[data-journey-lead-form] select[name="goal"]')
    .selectOption({ label: "Kundenerlebnis verbessern" });
  await page.locator('[data-journey-lead-form] select[name="timeline"]')
    .selectOption({ label: "In 3–6 Monaten" });
  await page.locator('[data-journey-lead-form] select[name="locations"]')
    .selectOption({ label: "2–5 Standorte" });
  await page.locator('[data-journey-lead-form] input[name="name"]')
    .fill("Testperson");
  await page.locator('[data-journey-lead-form] input[name="email"]')
    .fill("test@example.com");
  await page.waitForTimeout(400);
  await page.screenshot({
    path: `/tmp/swisscompact-consultation-funnel-${viewport.name}.png`,
    fullPage: false,
  });
  await page.locator("[data-journey-consult-close]").click();
  await page.locator("[data-journey-hotspot=\"experience\"]").click();
  await page.locator(
    "[data-journey-panel] [data-journey-configure]",
  ).evaluate(
    (button) => button.click(),
  );
  const configurationRestored = await page.locator(
    ".showroom-focus-tools",
  ).isVisible();
  const journeyOpenForConfiguration = await page.locator(
    "[data-journey-shell]",
  ).isVisible();
  const integratedConfigurationActive = await page.locator(
    "[data-solution-journey]",
  ).evaluate((element) => element.classList.contains("is-configuring"));
  await page.locator("[data-journey-size]").selectOption("compact");
  await page.waitForFunction(() => (
    document.querySelector("[data-showroom]")?.getAttribute(
      "data-showroom-room-size",
    ) === "compact"
  ));
  const journeySizeValue = await page.locator(
    "[data-journey-size]",
  ).inputValue();
  await page.screenshot({
    path: `/tmp/swisscompact-tour-configuration-${viewport.name}.png`,
    fullPage: false,
  });
  const configurationNextVisible = await page.locator(
    ".solution-journey__config-next",
  ).isVisible();
  await page.locator(".solution-journey__config-next").click();
  const configurationToConsultation = await page.locator(
    "[data-journey-consult-panel]",
  ).isVisible();
  await page.locator("[data-journey-consult-close]").click();
  const tourViewRestored = await page.locator(
    "[data-solution-journey]",
  ).evaluate((element) => !element.classList.contains("is-configuring"));
  await page.locator("[data-journey-room-config]").evaluate(
    (button) => button.click(),
  );
  const roomButtonConfigurationActive = await page.locator(
    "[data-solution-journey]",
  ).evaluate((element) => element.classList.contains("is-configuring"));
  await page.locator(
    ".solution-journey__header [data-journey-configure]",
  ).evaluate((button) => button.click());
  await page.locator("[data-journey-tour]").evaluate((button) => button.click());
  const tourVisible = await page.locator(
    "[data-journey-tour-status]",
  ).isVisible();
  await page.locator("[data-journey-summary]").click();
  const summaryText = await page.locator(
    "[data-journey-summary-panel]",
  ).innerText();
  await page.locator("[data-journey-close]").evaluate(
    (button) => button.click(),
  );
  await page.locator(
    ".showroom-focus-identity-size [data-showroom-navbar-trigger]",
  ).evaluate((button) => button.click());
  await page.waitForTimeout(180);
  await page.screenshot({
    path: `/tmp/swisscompact-room-size-navbar-${viewport.name}.png`,
    fullPage: false,
  });
  await page.locator(
    ".showroom-focus-identity-size "
      + "[data-showroom-setting=\"roomSize\"][data-value=\"compact\"]",
  ).evaluate((button) => button.click());
  await page.waitForFunction(() => (
    document.querySelector("[data-showroom]")?.getAttribute(
      "data-showroom-room-size",
    ) === "compact"
  ));
  const topLeftSizeLabel = await page.locator(
    ".showroom-focus-identity-size [data-showroom-room-label]",
  ).innerText();
  const topLeftSizeMenuClosed = await page.locator(
    ".showroom-focus-identity-size",
  ).evaluate((element) => !element.classList.contains("is-open"));
  const horizontalOverflow = await page.evaluate(() => (
    document.documentElement.scrollWidth > window.innerWidth + 1
  ));
  const panelVisual = await page.locator("[data-journey-panel]").evaluate(
    (element) => {
      const styles = getComputedStyle(element);
      const ancestorOpacities = [];
      let current = element.parentElement;
      while (current) {
        const opacity = getComputedStyle(current).opacity;
        if (opacity !== "1") {
          ancestorOpacities.push({
            className: current.className,
            opacity,
          });
        }
        current = current.parentElement;
      }
      return {
        background: styles.backgroundColor,
        opacity: styles.opacity,
        ancestorOpacities,
      };
    },
  );

  results.push({
    viewport: viewport.name,
    enabledExtendedCategories,
    categoryCount,
    roomCount,
    hotspotCount,
    scenarioCount,
    panelStepCount,
    focusAnimationVisible,
    pointThreeClickable,
    keyboardNavigationComplete,
    roomConfigurationButtonVisible,
    headerConsultationVisible,
    flyoutConfigurationButtonAvailable,
    savedCount,
    consultationVisible,
    consultationComplete:
      consultationText.includes("Persönliche Beratung")
      && consultationText.includes("Aus Ihrem Raum wird ein konkretes Projekt")
      && consultationText.includes("Erlebnis & Aktivierung"),
    leadFormComplete,
    tourVisible,
    panelComplete: [
      "Problem",
      "Lösung",
      "Ihr Nutzen",
      "Einsatzgebiet",
      "Inhaltsbeispiele",
      "Integrationen",
    ].every((label) => panelText.includes(label)),
    summaryComplete:
      summaryText.includes("Persönliche Lösungsübersicht")
      && summaryText.includes("Erlebnis & Aktivierung"),
    configurationRestored,
    journeyOpenForConfiguration,
    integratedConfigurationActive,
    roomButtonConfigurationActive,
    journeySizeValue,
    configurationNextVisible,
    configurationToConsultation,
    tourViewRestored,
    topLeftSizeLabel,
    topLeftSizeMenuClosed,
    horizontalOverflow,
    panelVisual,
    errors,
  });

  await page.close();
}

await browser.close();

const failed = results.some((result) => (
  result.categoryCount !== 12
  || result.enabledExtendedCategories !== 7
  || result.roomCount !== 3
  || result.hotspotCount !== 4
  || result.scenarioCount !== 4
  || result.panelStepCount < 3
  || !result.focusAnimationVisible
  || !result.pointThreeClickable
  || !result.keyboardNavigationComplete
  || !result.roomConfigurationButtonVisible
  || !result.headerConsultationVisible
  || !result.flyoutConfigurationButtonAvailable
  || result.savedCount !== "1"
  || !result.consultationVisible
  || !result.consultationComplete
  || result.leadFormComplete < 7
  || !result.tourVisible
  || !result.panelComplete
  || !result.summaryComplete
  || !result.configurationRestored
  || !result.journeyOpenForConfiguration
  || !result.integratedConfigurationActive
  || !result.roomButtonConfigurationActive
  || result.journeySizeValue !== "compact"
  || !result.configurationNextVisible
  || !result.configurationToConsultation
  || !result.tourViewRestored
  || !result.topLeftSizeLabel.endsWith("· M")
  || !result.topLeftSizeMenuClosed
  || result.horizontalOverflow
  || result.errors.length > 0
));

process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
if (failed) process.exitCode = 1;

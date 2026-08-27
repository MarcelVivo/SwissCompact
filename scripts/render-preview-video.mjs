import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { chromium } from "playwright-core";

const execFileAsync = promisify(execFile);
const baseUrl = process.env.SWISSCOMPACT_BASE_URL ?? "http://127.0.0.1:4186/";
const outputPath = resolve(
  process.env.SWISSCOMPACT_VIDEO_OUTPUT
    ?? "exports/SwissCompact_Website_Preview_1080p.mp4",
);
const chapterCount = 11;
const chapterDurations = [
  8.041667,
  10.041667,
  10.041667,
  10.051708,
  10.041667,
  10.041667,
  10.041667,
  10.041667,
  10.041667,
  10.051708,
  10.760750,
];
const initialHoldSeconds = 1.4;
const showcaseHoldSeconds = 1.1;
const finalHoldSeconds = 2.4;
const captureDirectory = await mkdtemp(join(tmpdir(), "swisscompact-capture-"));

await mkdir(dirname(outputPath), { recursive: true });

const browser = await chromium.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  args: [
    "--autoplay-policy=no-user-gesture-required",
    "--disable-background-timer-throttling",
    "--disable-renderer-backgrounding",
  ],
});

const context = await browser.newContext({
  viewport: { width: 1920, height: 1080 },
  deviceScaleFactor: 1,
  recordVideo: {
    dir: captureDirectory,
    size: { width: 1920, height: 1080 },
  },
});

const recordingStartedAt = Date.now();
const page = await context.newPage();
const video = page.video();

try {
  await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await page.waitForSelector("#intro video", { timeout: 30_000 });
  await page.waitForFunction(
    () => [...document.querySelectorAll("video")].every((item) => (
      item instanceof HTMLVideoElement
      && item.readyState >= HTMLMediaElement.HAVE_METADATA
      && item.videoWidth > 0
    )),
    { timeout: 120_000 },
  );
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(800);

  const captureStartedAt = Date.now();
  const trimOffsetSeconds = (captureStartedAt - recordingStartedAt) / 1000;
  await page.waitForTimeout(initialHoldSeconds * 1000);

  for (let chapterIndex = 0; chapterIndex < chapterDurations.length; chapterIndex += 1) {
    const duration = chapterDurations[chapterIndex];
    process.stdout.write(
      `Rendering chapter ${chapterIndex + 1}/${chapterDurations.length} (${duration.toFixed(2)}s)\n`,
    );
    await page.evaluate(
      ({ index, durationSeconds, chapters }) => new Promise((resolveAnimation) => {
        const maximum = Math.max(
          1,
          document.documentElement.scrollHeight - window.innerHeight,
        );
        const startedAt = performance.now();
        const renderFrame = (now) => {
          const localProgress = Math.min(
            1,
            Math.max(0, (now - startedAt) / (durationSeconds * 1000)),
          );
          const journey = index + localProgress;
          window.scrollTo(0, journey / chapters * maximum);
          if (localProgress < 1) window.requestAnimationFrame(renderFrame);
          else resolveAnimation();
        };
        window.requestAnimationFrame(renderFrame);
      }),
      {
        index: chapterIndex,
        durationSeconds: duration,
        chapters: chapterCount,
      },
    );
  }

  await page.waitForTimeout(showcaseHoldSeconds * 1000);
  await page.evaluate((chapters) => {
    const maximum = Math.max(
      1,
      document.documentElement.scrollHeight - window.innerHeight,
    );
    window.scrollTo(0, (chapters - 0.45) / chapters * maximum);
  }, chapterCount);
  await page.waitForTimeout(finalHoldSeconds * 1000);
  const captureDurationSeconds = (Date.now() - captureStartedAt) / 1000;
  await context.close();
  await browser.close();

  if (!video) throw new Error("Browser video recording unavailable");
  const rawVideoPath = await video.path();
  await execFileAsync("ffmpeg", [
    "-y",
    "-ss",
    trimOffsetSeconds.toFixed(3),
    "-i",
    rawVideoPath,
    "-t",
    captureDurationSeconds.toFixed(3),
    "-vf",
    "fps=24,scale=1920:1080:flags=lanczos,format=yuv420p",
    "-an",
    "-c:v",
    "libx264",
    "-preset",
    "slow",
    "-crf",
    "18",
    "-movflags",
    "+faststart",
    outputPath,
  ], { maxBuffer: 16 * 1024 * 1024 });

  process.stdout.write(`Created ${outputPath}\n`);
} finally {
  await browser.close().catch(() => undefined);
  await rm(captureDirectory, { recursive: true, force: true });
}

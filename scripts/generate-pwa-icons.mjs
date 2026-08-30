import { execFile } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const rootDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = resolve(
  rootDirectory,
  "public/SwissCompactFavicon/SwisCompactFavicon.png",
);
const outputDirectory = resolve(rootDirectory, "public/site/icons");

// The source render is a square, opaque (black-background) 3D brand shot.
// "any"-purpose icons use it edge-to-edge; the maskable icon additionally
// scales the artwork down and pads it with matching black so the design
// survives circular/squircle OS masking without clipping the wordmark.
const targets = [
  { file: "icon-192.png", filter: "scale=192:192" },
  { file: "icon-512.png", filter: "scale=512:512" },
  {
    file: "icon-maskable-512.png",
    filter: "scale=330:330,pad=512:512:(ow-iw)/2:(oh-ih)/2:black",
  },
  { file: "apple-touch-icon.png", filter: "scale=180:180" },
];

await mkdir(outputDirectory, { recursive: true });

for (const target of targets) {
  const outputPath = resolve(outputDirectory, target.file);
  await execFileAsync("ffmpeg", [
    "-y",
    "-i",
    sourcePath,
    "-vf",
    target.filter,
    outputPath,
  ]);
  process.stdout.write(`Wrote ${outputPath}\n`);
}

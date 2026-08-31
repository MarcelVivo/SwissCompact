import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const portal = read("src/portal/main.tsx");
const mediaCss = read("src/portal/portal-media.css");
const records = read("api/dashboard/records.ts");
const overview = read("api/dashboard/overview.ts");

const checks = {
  clientDecodeCheck: ["inspectMediaFile", "loadedmetadata", "videoWidth", "durationSeconds", "Technisch lesbar"].every((value) => portal.includes(value)),
  generatedVideoPoster: ["canvas.toBlob", "posterUpload", "Vorschau erstellt", "poster_url"].every((value) => portal.includes(value)) && overview.includes("posterPath"),
  metadataPersisted: ["normalizedMediaMetadata", "mediaMetadata", "compatibilityStatus", "display_ready", "processingState"].every((value) => records.includes(value)),
  incompleteMediaBlocked: records.includes("mediaPayloadIsReady") && records.includes("noch nicht displaybereit") && portal.includes("contentIsDisplayReady"),
  playerDeliveryGuard: records.includes('["image", "video"].includes(content.content_type)') && records.includes("!mediaPayloadIsReady(content.payload)"),
  safeCleanup: records.includes("existing.data.payload?.posterPath") && records.includes("storagePaths") && records.includes("uploadPaths"),
  understandableUi: ["Datei wird technisch geprüft", "DISPLAYBEREIT", "Technisch lesbar"].every((value) => portal.includes(value)) && mediaCss.includes(".media-file-check.ready"),
};

console.log(JSON.stringify(checks, null, 2));
if (Object.values(checks).some((value) => !value)) process.exit(1);

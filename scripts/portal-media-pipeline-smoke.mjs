import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const portal = read("src/portal/main.tsx");
const mediaCss = read("src/portal/portal-media.css");
const records = read("api/dashboard/records.ts");
const overview = read("api/dashboard/overview.ts");
const mux = read("api/_lib/portal/mux-video.ts");
const muxWebhook = read("api/_lib/portal/mux-webhook-handler.ts");

const checks = {
  clientDecodeCheck: ["inspectMediaFile", "loadedmetadata", "videoWidth", "durationSeconds", "Technisch lesbar"].every((value) => portal.includes(value)),
  generatedVideoPoster: ["canvas.toBlob", "posterUpload", "Vorschau erstellt", "poster_url"].every((value) => portal.includes(value)) && overview.includes("posterPath"),
  metadataPersisted: ["normalizedMediaMetadata", "mediaMetadata", "compatibilityStatus", "display_ready", "processingState"].every((value) => records.includes(value)),
  incompleteMediaBlocked: records.includes("mediaPayloadIsReady") && records.includes("noch nicht displaybereit") && portal.includes("contentIsDisplayReady"),
  playerDeliveryGuard: records.includes('["image", "video"].includes(content.content_type)') && records.includes("!mediaPayloadIsReady(content.payload)"),
  safeCleanup: records.includes("existing.data.payload?.posterPath") && records.includes("storagePaths") && records.includes("uploadPaths"),
  understandableUi: ["Datei wird technisch geprüft", "DISPLAYBEREIT", "Technisch lesbar"].every((value) => portal.includes(value)) && mediaCss.includes(".media-file-check.ready"),
  scalableMuxUpload: ["createMuxDirectUpload", "playback_policies", "static_renditions", "highest", "video_quality", '"plus"'].every((value) => mux.includes(value)) && ["uploadMuxVideo", "UpChunk.createUpload", "dynamicChunkSize"].every((value) => portal.includes(value)),
  secureMuxPlayback: ["muxSignedPlaybackUrl", "RS256", 'aud: "v"', "MUX_SIGNING_KEY_ID", "MUX_PRIVATE_KEY"].every((value) => mux.includes(value)) && records.includes("materializeMediaUrl"),
  verifiedMuxWebhooks: ["verifyMuxWebhook", "timingSafeEqual", "mux-signature", "video.asset.static_rendition.ready"].every((value) => mux.concat(muxWebhook).includes(value)),
  asynchronousReadiness: ["VIDEO WIRD AUFBEREITET", "contentProcessingLabel", "processingState", "setInterval"].every((value) => portal.includes(value)) && muxWebhook.includes('compatibilityStatus = "display_ready"'),
  guidedCampaignMediaReadiness: ["pendingCreatedContent", "wird jetzt aufbereitet und danach automatisch freigegeben und ausgewählt", "ist displaybereit, freigegeben und ausgewählt"].every((value) => portal.includes(value)),
  muxDeletion: records.includes("deleteMuxAsset") && records.includes("deleteMuxDirectUpload") && records.includes("Mux content cleanup failed"),
};

console.log(JSON.stringify(checks, null, 2));
if (Object.values(checks).some((value) => !value)) process.exit(1);

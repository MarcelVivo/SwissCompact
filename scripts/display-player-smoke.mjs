import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const migration = read("supabase/migrations/20260831_display_devices.sql");
const records = read("api/dashboard/records.ts");
const player = read("src/player/main.tsx");
const portal = read("src/portal/main.tsx");
const vercel = JSON.parse(read("vercel.json"));

assert.ok(existsSync(new URL("../player.html", import.meta.url)), "Player-Einstieg fehlt");
assert.ok(existsSync(new URL("../dist/player.html", import.meta.url)), "Player fehlt im Produktions-Build");
assert.ok(vercel.rewrites.some((rule) => rule.source === "/player" && rule.destination === "/player.html"), "Player-Rewrite fehlt");
assert.match(migration, /device_token_hash/);
assert.match(migration, /pairing_code_hash/);
assert.match(migration, /configuration_version/);
assert.match(records, /createHash\("sha256"\).*device_token_hash/s, "Gerätetoken wird nicht gehasht gespeichert");
assert.match(records, /mode === "pair"/);
assert.match(records, /mode === "heartbeat"/);
assert.match(records, /action === "renew_display_pairing"[\s\S]*device_token_hash: null[\s\S]*status: "provisioning"/, "Ein neuer Aktivierungscode muss die alte Player-Verbindung beenden");
assert.match(records, /search\.get\("device"\) === "config"/);
assert.match(records, /\["approved", "published"\]/, "Nicht freigegebene Inhalte dürfen nicht auf Displays erscheinen");
assert.match(records, /Geben Sie alle gewählten Inhalte vor der Aktivierung frei/);
assert.match(player, /swisscompact_device_token/);
assert.match(player, /device=heartbeat/);
assert.match(player, /device=config/);
assert.match(portal, /Display einrichten/);
assert.match(portal, /Aktivierungscode erstellen/);
assert.match(portal, /Für Displays freigeben/);

console.log("Display player smoke checks passed.");

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const read = (file) => readFileSync(resolve(root, file), "utf8");
const terms = read("docs/legal/terms-v1.0.md");
const privacy = read("docs/legal/privacy-v1.0.md");
const dpa = read("docs/legal/data-processing-v1.0.md");
const migration = read("supabase/migrations/20260920_legal_documents_v1.sql");
const website = read("index.html");
const legalPage = read("legal.html");

for (const [name, text] of Object.entries({ terms, privacy, dpa })) {
  assert(!/ENTWURF|HIER EINFÜGEN|TODO/i.test(text), `${name} contains a draft marker`);
  assert(text.includes("Version 1.0"), `${name} has no version`);
  assert(text.includes("kontakt@swisscompact.com"), `${name} has no contact`);
  assert(migration.includes(text.trim()), `${name} is not embedded unchanged in the migration`);
}

assert(migration.includes("requires_acceptance = false"), "privacy must be informational, not consent-based");
assert(migration.includes("'data_processing', 'tenant'"), "DPA must be accepted by the tenant");
assert(website.includes('/legal.html#datenschutz'), "public website has no privacy link");
assert(website.includes('/legal.html#anbieter'), "public website has no provider link");
assert(legalPage.includes('/src/legal/main.ts'), "public legal entrypoint is missing");

console.log("Legal publication smoke checks passed.");

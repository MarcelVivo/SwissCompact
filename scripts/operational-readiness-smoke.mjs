import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const migration = read("supabase/migrations/20260921_critical_incident_alerting.sql");
const operations = read("api/_lib/dashboard/operations.ts");
const records = read("api/dashboard/records.ts");
const dashboard = read("src/dashboard/OperationalReadiness.tsx");

assert(migration.includes("claim_operational_incident_alert"));
assert(migration.includes("external_alert_status"));
assert(operations.includes("OPERATIONS_ALERT_EMAIL"));
assert(operations.includes("OPERATIONS_ALERT_WEBHOOK_URL"));
assert(operations.includes("target_cooldown_minutes"));
assert(operations.includes("[REDACTED]"));
assert(records.includes('action === "test_operational_alert"'));
assert(dashboard.includes("Alarmkanal testen"));
assert(dashboard.includes("Externe Alarmierung"));

console.log("Operational readiness smoke checks passed.");

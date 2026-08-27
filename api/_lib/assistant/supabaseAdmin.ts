import { createClient } from "@supabase/supabase-js";

// Service-role client scoped to the swisscompact schema in the shared
// marcelspahr-ch Supabase project. Server-only — never import this from
// frontend code. Bypasses RLS by design; every write in this project goes
// through /api/assistant/lead.ts using this client.
export function getAssistantSupabaseClient() {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return null;

  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: "swisscompact" },
  });
}

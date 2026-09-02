import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const version = "1.0";
const effectiveAt = "2026-09-02 00:00:00+02";
const definitions = [
  {
    type: "terms",
    scope: "user",
    title: "Nutzungsbedingungen Kundenportal",
    summary: "Regelt den sicheren und verbindlichen Zugang zum SwissCompact-Kundenportal.",
    requiresAcceptance: true,
    file: "terms-v1.0.md",
  },
  {
    type: "privacy",
    scope: "user",
    title: "Datenschutzerklärung",
    summary: "Informiert transparent über die Bearbeitung personenbezogener Daten durch SwissCompact.",
    requiresAcceptance: false,
    file: "privacy-v1.0.md",
  },
  {
    type: "data_processing",
    scope: "tenant",
    title: "Vereinbarung zur Auftragsbearbeitung",
    summary: "Regelt die Bearbeitung von Personendaten im Auftrag des Kundenbetriebs.",
    requiresAcceptance: true,
    file: "data-processing-v1.0.md",
  },
];

const literal = (value) => {
  if (value.includes("$legal$")) throw new Error("Document contains reserved SQL delimiter $legal$");
  return `$legal$${value.trim()}$legal$`;
};

const blocks = definitions.map((definition) => {
  const content = readFileSync(resolve(root, "docs/legal", definition.file), "utf8");
  return `do $$
declare
  target_id uuid;
  target_status text;
begin
  select id, status into target_id, target_status
  from swisscompact.legal_documents
  where document_type = '${definition.type}' and version = '${version}';

  if target_status = 'published' then
    if not exists (
      select 1 from swisscompact.legal_documents
      where id = target_id
        and acceptance_scope = '${definition.scope}'
        and title = ${literal(definition.title)}
        and summary = ${literal(definition.summary)}
        and content_markdown = ${literal(content)}
        and requires_acceptance = ${definition.requiresAcceptance}
    ) then
      raise exception 'Die bereits veröffentlichte Version ${version} von ${definition.type} weicht von der geprüften Fassung ab';
    end if;
    return;
  end if;

  if target_status = 'superseded' then
    raise exception 'Version ${version} von ${definition.type} wurde bereits ersetzt; eine neue Version ist erforderlich';
  end if;

  if target_id is null then
    insert into swisscompact.legal_documents (
      document_type, acceptance_scope, version, title, summary, content_markdown,
      requires_acceptance, status, effective_at, published_at
    ) values (
      '${definition.type}', '${definition.scope}', '${version}', ${literal(definition.title)},
      ${literal(definition.summary)}, ${literal(content)}, ${definition.requiresAcceptance},
      'draft', '${effectiveAt}'::timestamptz, null
    ) returning id into target_id;
  else
    update swisscompact.legal_documents
    set acceptance_scope = '${definition.scope}',
        title = ${literal(definition.title)},
        summary = ${literal(definition.summary)},
        content_markdown = ${literal(content)},
        requires_acceptance = ${definition.requiresAcceptance},
        effective_at = '${effectiveAt}'::timestamptz
    where id = target_id and status = 'draft';
  end if;

  update swisscompact.legal_documents
  set status = 'superseded'
  where document_type = '${definition.type}'
    and status = 'published'
    and id <> target_id;

  update swisscompact.legal_documents
  set status = 'published',
      effective_at = '${effectiveAt}'::timestamptz,
      published_at = now()
  where id = target_id and status = 'draft';
end;
$$;`;
}).join("\n\n");

const output = `-- Fachlich geprüfte Rechtsdokumente Version ${version}; öffentliche Fassung vom 2. September 2026.
-- Generiert aus docs/legal/*.md. Änderungen dort vornehmen und npm run legal:generate ausführen.
begin;

${blocks}

commit;
`;

writeFileSync(resolve(root, "supabase/migrations/20260920_legal_documents_v1.sql"), output);

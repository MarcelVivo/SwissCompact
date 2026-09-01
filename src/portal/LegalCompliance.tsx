import { useMemo, useState } from "react";

export type LegalDocument = {
  id: string;
  documentType: "terms" | "privacy" | "data_processing";
  acceptanceScope: "user" | "tenant";
  version: string;
  title: string;
  summary: string;
  content: string;
  contentHash: string;
  effectiveAt: string;
  requiresAcceptance: boolean;
  status: "published" | "superseded";
  acceptedAt: string | null;
  acceptedByName: string | null;
};

export type LegalComplianceData = {
  available: boolean;
  documents: LegalDocument[];
  pendingDocumentIds: string[];
};

const documentTypeLabels: Record<LegalDocument["documentType"], string> = {
  terms: "Nutzungsbedingungen",
  privacy: "Datenschutz",
  data_processing: "Auftragsverarbeitung",
};

const legalDate = (value: string | null) => value
  ? new Intl.DateTimeFormat("de-CH", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value))
  : "Noch nicht bestätigt";

export function LegalConsentDialog({
  data,
  role,
  busy,
  error,
  onAccept,
  onLogout,
}: {
  data: LegalComplianceData;
  role: "owner" | "admin" | "editor" | "viewer";
  busy: boolean;
  error: string;
  onAccept: (documentIds: string[]) => Promise<void>;
  onLogout: () => void;
}) {
  const pending = useMemo(() => data.documents.filter((document) => data.pendingDocumentIds.includes(document.id)), [data]);
  const [confirmed, setConfirmed] = useState<string[]>([]);
  const blocked = pending.some((document) => document.acceptanceScope === "tenant" && !["owner", "admin"].includes(role));
  const allConfirmed = pending.length > 0 && pending.every((document) => confirmed.includes(document.id));

  return <div className="dialog-backdrop legal-consent-backdrop"><section className="dialog legal-consent-dialog" role="dialog" aria-modal="true" aria-labelledby="legal-consent-title"><div className="eyebrow">Rechtliche Aktualisierung</div><h2 id="legal-consent-title">Bitte kurz prüfen und bestätigen</h2><p className="legal-consent-intro">SwissCompact hat verbindliche Dokumente aktualisiert. Öffnen Sie jeden Text und bestätigen Sie die aktuelle Version, bevor Sie weiterarbeiten.</p><div className="legal-consent-documents">{pending.map((document) => { const canAccept = document.acceptanceScope === "user" || ["owner", "admin"].includes(role); return <article key={document.id}><header><div><span>{documentTypeLabels[document.documentType]}</span><h3>{document.title}</h3><small>Version {document.version} · gültig seit {legalDate(document.effectiveAt)}</small></div><b>{document.acceptanceScope === "tenant" ? "Für Betrieb" : "Persönlich"}</b></header><p>{document.summary}</p><details><summary>Dokument vollständig lesen</summary><div className="legal-document-copy">{document.content}</div></details>{canAccept ? <label className="legal-confirmation"><input type="checkbox" checked={confirmed.includes(document.id)} onChange={(event) => setConfirmed((current) => event.target.checked ? [...current, document.id] : current.filter((id) => id !== document.id))}/><span>Ich habe Version {document.version} vollständig gelesen und stimme ihr zu.</span></label> : <div className="legal-owner-required">Dieses Dokument muss zuerst durch einen Inhaber oder Administrator Ihres Betriebs bestätigt werden.</div>}</article>; })}</div>{error && <div className="form-error" role="alert">{error}</div>}<footer><button type="button" className="secondary" onClick={onLogout} disabled={busy}>Abmelden</button><button type="button" className="primary" disabled={busy || blocked || !allConfirmed} onClick={() => void onAccept(pending.map((document) => document.id))}>{busy ? "Wird protokolliert …" : blocked ? "Bestätigung durch Inhaber erforderlich" : "Dokumente verbindlich bestätigen"}</button></footer></section></div>;
}

export function LegalSettingsCard({ data }: { data: LegalComplianceData }) {
  return <article className="card legal-settings-card"><div className="legal-settings-heading"><div><span>Rechtliches & Datenschutz</span><h3>Dokumente und Zustimmungen</h3></div><b className={data.pendingDocumentIds.length ? "pending" : "complete"}>{data.pendingDocumentIds.length ? `${data.pendingDocumentIds.length} offen` : "Aktuell"}</b></div>{!data.available ? <p>Die Rechtsdokument-Verwaltung wird vorbereitet.</p> : !data.documents.length ? <p>Noch keine verbindlichen Rechtsdokumente veröffentlicht. Freigegebene Versionen erscheinen automatisch hier.</p> : <div className="legal-settings-list">{data.documents.map((document) => { const label = document.acceptedAt ? "Bestätigt" : document.status === "superseded" ? "Ersetzt" : document.requiresAcceptance ? "Offen" : "Information"; const tone = document.acceptedAt ? "accepted" : document.status === "superseded" || !document.requiresAcceptance ? "informational" : "pending"; return <details key={document.id}><summary><span><b>{document.title}</b><small>{documentTypeLabels[document.documentType]} · Version {document.version}{document.status === "superseded" ? " · frühere Version" : ""}</small></span><em className={tone}>{label}</em></summary><div><p>{document.summary}</p><div className="legal-document-copy">{document.content}</div><small>{document.acceptedAt ? `Bestätigt am ${legalDate(document.acceptedAt)}${document.acceptedByName ? ` durch ${document.acceptedByName}` : ""}` : document.status === "superseded" ? "Diese Version wurde durch eine neuere Fassung ersetzt." : document.requiresAcceptance ? "Diese Version muss noch bestätigt werden." : "Für diese Information ist keine Zustimmung erforderlich."}</small><code title={document.contentHash}>Prüfsumme {document.contentHash.slice(0, 12)}…</code></div></details>; })}</div>}</article>;
}

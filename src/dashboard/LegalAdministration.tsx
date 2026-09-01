import { FormEvent, useState } from "react";

type LegalDocument = Record<string, any>;
type LegalManagement = { available: boolean; documents: LegalDocument[] };

const typeLabels: Record<string, string> = { terms: "Nutzungsbedingungen", privacy: "Datenschutz", data_processing: "Auftragsverarbeitung" };
const statusLabels: Record<string, string> = { draft: "Entwurf", published: "Veröffentlicht", superseded: "Ersetzt" };

export function LegalAdministration({ data, securityAdmin, mutate }: { data: LegalManagement; securityAdmin: boolean; mutate: (payload: any) => Promise<any> }) {
  const [editing, setEditing] = useState<LegalDocument | "new" | null>(null);
  const [publishing, setPublishing] = useState<LegalDocument | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!data.available) return <section className="panel legal-admin"><div className="panel-head"><h3>Rechtsdokumente</h3></div><p className="panel-note">Die Rechtsdokument-Verwaltung ist noch nicht verfügbar.</p></section>;

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    const form = new FormData(event.currentTarget);
    try {
      await mutate({
        action: editing === "new" ? "create_legal_document" : "update_legal_document",
        id: editing === "new" ? undefined : editing?.id,
        documentType: form.get("documentType"), acceptanceScope: form.get("acceptanceScope"),
        version: form.get("version"), title: form.get("title"), summary: form.get("summary"),
        contentMarkdown: form.get("contentMarkdown"), requiresAcceptance: form.get("requiresAcceptance") === "on",
        effectiveAt: form.get("effectiveAt") || null,
      });
      setEditing(null);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Dokument konnte nicht gespeichert werden"); }
    finally { setBusy(false); }
  }

  async function publish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!publishing) return;
    setBusy(true); setError("");
    const form = new FormData(event.currentTarget);
    try {
      await mutate({ action: "publish_legal_document", id: publishing.id, legalReviewed: form.get("legalReviewed") === "on", confirmation: form.get("confirmation") });
      setPublishing(null);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Dokument konnte nicht veröffentlicht werden"); }
    finally { setBusy(false); }
  }

  return <section className="panel legal-admin"><div className="panel-head"><div><h3>Rechtsdokumente</h3><p>Entwürfe, veröffentlichte Fassungen und unveränderbare Versionshistorie.</p></div>{securityAdmin && <button type="button" className="primary" onClick={() => { setEditing("new"); setError(""); }}>Neuen Entwurf anlegen</button>}</div><div className="legal-admin-list">{data.documents.map((document) => <article key={document.id}><div><small>{typeLabels[document.document_type] || document.document_type} · Version {document.version}</small><h4>{document.title}</h4><p>{document.summary || "Keine Zusammenfassung"}</p></div><span className={`tag ${document.status === "published" ? "success" : document.status === "draft" ? "warning" : ""}`}>{statusLabels[document.status] || document.status}</span><div className="legal-admin-actions">{securityAdmin && document.status === "draft" && <><button type="button" className="secondary" onClick={() => { setEditing(document); setError(""); }}>Bearbeiten</button><button type="button" className="primary" onClick={() => { setPublishing(document); setError(""); }}>Geprüfte Fassung veröffentlichen</button></>}</div></article>)}</div>{!data.documents.length && <p className="panel-note">Noch keine Rechtsdokumente vorhanden.</p>}{editing && <div className="dashboard-dialog-backdrop"><section className="dashboard-dialog legal-editor" role="dialog" aria-modal="true"><header><div><p className="eyebrow">Rechtsdokument</p><h2>{editing === "new" ? "Neuen Entwurf anlegen" : "Entwurf bearbeiten"}</h2></div><button type="button" className="icon-button" onClick={() => setEditing(null)} aria-label="Schliessen">×</button></header><form onSubmit={save}><div className="form-row"><label>Dokumenttyp<select name="documentType" defaultValue={editing === "new" ? "terms" : editing.document_type}><option value="terms">Nutzungsbedingungen</option><option value="privacy">Datenschutz</option><option value="data_processing">Auftragsverarbeitung</option></select></label><label>Geltungsbereich<select name="acceptanceScope" defaultValue={editing === "new" ? "user" : editing.acceptance_scope}><option value="user">Jeder Benutzer</option><option value="tenant">Inhaber oder Administrator pro Betrieb</option></select></label></div><div className="form-row"><label>Version<input name="version" required maxLength={40} defaultValue={editing === "new" ? "" : editing.version}/></label><label>Wirksam ab<input type="datetime-local" name="effectiveAt" defaultValue={editing !== "new" && editing.effective_at ? new Date(editing.effective_at).toISOString().slice(0,16) : ""}/></label></div><label>Titel<input name="title" required maxLength={180} defaultValue={editing === "new" ? "" : editing.title}/></label><label>Kurze Zusammenfassung<textarea name="summary" rows={3} maxLength={1000} defaultValue={editing === "new" ? "" : editing.summary}/></label><label>Vollständiger geprüfter Text<textarea className="legal-content-editor" name="contentMarkdown" rows={18} required defaultValue={editing === "new" ? "" : editing.content_markdown}/></label><label className="legal-checkbox"><input type="checkbox" name="requiresAcceptance" defaultChecked={editing === "new" || editing.requires_acceptance}/><span>Aktive Zustimmung im Kundenportal verlangen</span></label><p className="legal-editor-warning">Speichern erzeugt nur einen Entwurf. Eine Veröffentlichung erfolgt separat und macht diese Version unveränderbar.</p>{error && <p className="form-error" role="alert">{error}</p>}<footer><button type="button" className="secondary" onClick={() => setEditing(null)}>Abbrechen</button><button className="primary" disabled={busy}>{busy ? "Wird gespeichert …" : "Entwurf speichern"}</button></footer></form></section></div>}{publishing && <div className="dashboard-dialog-backdrop"><section className="dashboard-dialog legal-publish-dialog" role="alertdialog" aria-modal="true"><header><div><p className="eyebrow">Verbindliche Veröffentlichung</p><h2>{publishing.title}</h2></div><button type="button" className="icon-button" onClick={() => setPublishing(null)} aria-label="Schliessen">×</button></header><form onSubmit={publish}><p>Version <strong>{publishing.version}</strong> ersetzt die bisher veröffentlichte Fassung dieses Dokumenttyps. Der Inhalt kann danach nicht mehr verändert oder gelöscht werden.</p><label className="legal-checkbox"><input type="checkbox" name="legalReviewed" required/><span>Ich bestätige, dass diese konkrete Fassung fachlich beziehungsweise rechtlich geprüft und zur Veröffentlichung freigegeben wurde.</span></label><label>Zur Bestätigung <strong>VERÖFFENTLICHEN</strong> eingeben<input name="confirmation" required autoComplete="off"/></label>{error && <p className="form-error" role="alert">{error}</p>}<footer><button type="button" className="secondary" onClick={() => setPublishing(null)}>Abbrechen</button><button className="primary" disabled={busy}>{busy ? "Wird veröffentlicht …" : "Unveränderbar veröffentlichen"}</button></footer></form></section></div>}</section>;
}

import { useMemo, useState } from "react";

export type DataRightsRequestType = "personal_export" | "tenant_export" | "membership_deletion" | "tenant_deletion";
export type DataRightsRequestStatus = "submitted" | "reviewing" | "approved" | "processing" | "completed" | "rejected" | "cancelled";

export type DataRightsRequest = {
  id: string;
  requestType: DataRightsRequestType;
  status: DataRightsRequestStatus;
  reason: string | null;
  exportExpiresAt: string | null;
  reviewNote: string | null;
  reviewedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
  requestedBy: string | null;
  canDownload: boolean;
};

export type DataRightsData = { available: boolean; requests: DataRightsRequest[] };
export type DataRightsActionResult = { download?: { url: string; fileName: string }; requestId?: string };

const typeLabels: Record<DataRightsRequestType, string> = {
  personal_export: "Meine Datenkopie",
  tenant_export: "Betriebliche Datenkopie",
  membership_deletion: "Löschung meines Zugangs",
  tenant_deletion: "Löschung des Kundenportals",
};

const statusLabels: Record<DataRightsRequestStatus, string> = {
  submitted: "Eingegangen",
  reviewing: "Wird geprüft",
  approved: "Freigegeben",
  processing: "Wird erstellt",
  completed: "Abgeschlossen",
  rejected: "Rückmeldung erforderlich",
  cancelled: "Zurückgezogen",
};

const statusTone = (status: DataRightsRequestStatus) => status === "completed"
  ? "complete"
  : ["rejected"].includes(status)
    ? "attention"
    : ["cancelled"].includes(status)
      ? "neutral"
      : "pending";

const dateTime = (value: string | null) => value
  ? new Intl.DateTimeFormat("de-CH", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value))
  : "–";

function download(url: string, fileName: string) {
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

export function DataRightsSettingsCard({
  data,
  role,
  userId,
  onCreate,
  onDownload,
  onCancel,
}: {
  data: DataRightsData;
  role: "owner" | "admin" | "editor" | "viewer";
  userId: string;
  onCreate: (requestType: DataRightsRequestType, reason?: string) => Promise<DataRightsActionResult>;
  onDownload: (requestId: string) => Promise<DataRightsActionResult>;
  onCancel: (requestId: string) => Promise<void>;
}) {
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [deletionType, setDeletionType] = useState<"membership_deletion" | "tenant_deletion" | null>(null);
  const [reason, setReason] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const requests = useMemo(() => data.requests.slice(0, 12), [data.requests]);
  const canExportTenant = role === "owner" || role === "admin";
  const confirmationPhrase = deletionType === "tenant_deletion" ? "PORTAL LÖSCHEN" : "ZUGANG LÖSCHEN";

  async function createExport(requestType: "personal_export" | "tenant_export") {
    setBusy(requestType); setError(""); setNotice("");
    try {
      const result = await onCreate(requestType);
      if (result.download) download(result.download.url, result.download.fileName);
      setNotice("Die Datenkopie wurde erstellt. Der Download wurde gestartet und bleibt 24 Stunden verfügbar.");
    } catch (reasonValue) {
      setError(reasonValue instanceof Error ? reasonValue.message : "Datenkopie konnte nicht erstellt werden");
    } finally { setBusy(""); }
  }

  async function submitDeletion() {
    if (!deletionType || confirmation !== confirmationPhrase) return;
    setBusy(deletionType); setError(""); setNotice("");
    try {
      await onCreate(deletionType, reason);
      setDeletionType(null); setReason(""); setConfirmation("");
      setNotice("Die Löschanfrage ist eingegangen. Es wurden noch keine Daten gelöscht; SwissCompact prüft den Vorgang zuerst.");
    } catch (reasonValue) {
      setError(reasonValue instanceof Error ? reasonValue.message : "Löschanfrage konnte nicht erstellt werden");
    } finally { setBusy(""); }
  }

  async function openExport(request: DataRightsRequest) {
    setBusy(request.id); setError("");
    try {
      const result = await onDownload(request.id);
      if (result.download) download(result.download.url, result.download.fileName);
    } catch (reasonValue) {
      setError(reasonValue instanceof Error ? reasonValue.message : "Download konnte nicht geöffnet werden");
    } finally { setBusy(""); }
  }

  async function cancelRequest(requestId: string) {
    setBusy(requestId); setError(""); setNotice("");
    try { await onCancel(requestId); setNotice("Die Anfrage wurde zurückgezogen."); }
    catch (reasonValue) { setError(reasonValue instanceof Error ? reasonValue.message : "Anfrage konnte nicht zurückgezogen werden"); }
    finally { setBusy(""); }
  }

  return <>
    <article className="card data-rights-card">
      <div className="data-rights-heading"><div><span>Datenschutz-Self-Service</span><h3>Meine Daten & Datenschutz</h3></div><b>{data.available ? "Verfügbar" : "In Vorbereitung"}</b></div>
      {!data.available ? <p>Der sichere Datenexport und kontrollierte Löschanfragen werden vorbereitet.</p> : <>
        <p className="data-rights-intro">Erstellen Sie eine maschinenlesbare Datenkopie oder reichen Sie eine Löschanfrage ein. Löschungen werden aus Sicherheits- und Aufbewahrungsgründen immer zuerst geprüft.</p>
        <div className="data-rights-actions">
          <section><div><b>Meine persönlichen Portaldaten</b><p>Profil, eigene Aktivitäten, Zustimmungen und Datenschutzanfragen als JSON-Datei.</p></div><button type="button" className="secondary" disabled={Boolean(busy)} onClick={() => void createExport("personal_export")}>{busy === "personal_export" ? "Wird erstellt …" : "Meine Daten exportieren"}</button></section>
          {canExportTenant && <section><div><b>Daten des Kundenportals</b><p>Standorte, Bildschirme, Inhalte, Kampagnen und geschäftliche Portalvorgänge.</p></div><button type="button" className="secondary" disabled={Boolean(busy)} onClick={() => void createExport("tenant_export")}>{busy === "tenant_export" ? "Wird erstellt …" : "Portal-Daten exportieren"}</button></section>}
          <section className="data-rights-deletion"><div><b>Meinen Portalzugang löschen lassen</b><p>Reicht eine prüfpflichtige Anfrage ein. Es wird nichts unmittelbar gelöscht.</p></div><button type="button" disabled={Boolean(busy)} onClick={() => { setDeletionType("membership_deletion"); setError(""); }}>Löschung beantragen</button></section>
          {role === "owner" && <section className="data-rights-deletion"><div><b>Gesamtes Kundenportal löschen lassen</b><p>Nur für Inhaber. Laufende Leistungen und Aufbewahrungspflichten werden vorab geprüft.</p></div><button type="button" disabled={Boolean(busy)} onClick={() => { setDeletionType("tenant_deletion"); setError(""); }}>Portal-Löschung beantragen</button></section>}
        </div>
        <aside className="data-retention-note"><b>Aufbewahrung und Sicherheit</b><p>Exportdateien werden nach 24 Stunden unzugänglich. Löschanfragen entfernen keine Rechnungen, Zustimmungsnachweise oder andere aufbewahrungspflichtige Unterlagen automatisch. SwissCompact dokumentiert die abschliessende Entscheidung.</p></aside>
        {notice && <div className="data-rights-notice" role="status">{notice}</div>}
        {error && <div className="form-error" role="alert">{error}</div>}
        {requests.length > 0 && <div className="data-rights-history"><h4>Letzte Anfragen</h4>{requests.map((request) => <article key={request.id}><div><b>{typeLabels[request.requestType]}</b><small>Beantragt am {dateTime(request.createdAt)}</small>{request.reviewNote && <p>{request.reviewNote}</p>}</div><span className={statusTone(request.status)}>{statusLabels[request.status]}</span><div className="data-rights-request-actions">{request.canDownload && <button type="button" className="secondary" disabled={Boolean(busy)} onClick={() => void openExport(request)}>{busy === request.id ? "Wird geöffnet …" : "Erneut herunterladen"}</button>}{request.status === "submitted" && request.requestedBy === userId && <button type="button" className="text-button" disabled={Boolean(busy)} onClick={() => void cancelRequest(request.id)}>Zurückziehen</button>}</div></article>)}</div>}
      </>}
    </article>
    {deletionType && <div className="dialog-backdrop data-deletion-backdrop"><section className="dialog data-deletion-dialog" role="dialog" aria-modal="true" aria-labelledby="data-deletion-title"><button className="dialog-close" type="button" aria-label="Schliessen" onClick={() => !busy && setDeletionType(null)}>×</button><div className="eyebrow">Kontrollierte Löschanfrage</div><h2 id="data-deletion-title">{deletionType === "tenant_deletion" ? "Kundenportal löschen lassen?" : "Portalzugang löschen lassen?"}</h2><p>Diese Anfrage löst noch keine Löschung aus. SwissCompact prüft zuerst aktive Verträge, offene Vorgänge und notwendige Aufbewahrung. Sie erhalten anschliessend eine dokumentierte Rückmeldung.</p><label>Begründung oder Hinweis (optional)<textarea rows={4} maxLength={2000} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Was sollen wir bei der Prüfung berücksichtigen?"/></label><label>Zur Bestätigung <strong>{confirmationPhrase}</strong> eingeben<input value={confirmation} onChange={(event) => setConfirmation(event.target.value.toUpperCase())} autoComplete="off"/></label>{error && <div className="form-error" role="alert">{error}</div>}<footer><button type="button" className="secondary" disabled={Boolean(busy)} onClick={() => setDeletionType(null)}>Abbrechen</button><button type="button" className="danger" disabled={Boolean(busy) || confirmation !== confirmationPhrase} onClick={() => void submitDeletion()}>{busy ? "Wird eingereicht …" : "Löschanfrage verbindlich einreichen"}</button></footer></section></div>}
  </>;
}

import { useMemo, useState } from "react";

export type CampaignVersionConfiguration = {
  name?: string;
  theme?: string | null;
  status?: string;
  priority?: number;
  startsAt?: string | null;
  endsAt?: string | null;
  displayIds?: string[];
  targetAssignments?: Array<{ displayId?: string; contentItems?: Array<{ contentId?: string; durationSeconds?: number }> }>;
};

export type CampaignVersion = {
  id: string;
  campaign_id: string;
  version: number;
  source: "baseline" | "saved" | "restored";
  configuration: CampaignVersionConfiguration;
  restored_from_version_id?: string | null;
  created_by_name?: string;
  created_at: string;
};

export type CampaignVersionsData = { available: boolean; items: CampaignVersion[] };

const sourceLabels: Record<CampaignVersion["source"], string> = {
  baseline: "Ausgangsstand",
  saved: "Gespeichert",
  restored: "Wiederhergestellt",
};

function versionSummary(version: CampaignVersion): { displays: number; contents: number } {
  const assignments = Array.isArray(version.configuration.targetAssignments) ? version.configuration.targetAssignments : [];
  const contentIds = new Set(assignments.flatMap((assignment) => assignment.contentItems || []).flatMap((item) => item.contentId ? [item.contentId] : []));
  return {
    displays: Array.isArray(version.configuration.displayIds) ? version.configuration.displayIds.length : assignments.length,
    contents: contentIds.size,
  };
}

export function CampaignVersionHistoryDialog({ campaign, history, canEdit, onRestore, onClose }: {
  campaign: { id: string; name: string; status: string };
  history: CampaignVersionsData;
  canEdit: boolean;
  onRestore: (versionId: string) => Promise<void>;
  onClose: () => void;
}) {
  const versions = useMemo(() => history.items.filter((version) => version.campaign_id === campaign.id).sort((a, b) => b.version - a.version), [campaign.id, history.items]);
  const [confirmation, setConfirmation] = useState<CampaignVersion | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const isRunning = ["active", "scheduled"].includes(campaign.status);

  async function restore() {
    if (!confirmation || busy) return;
    setBusy(true);
    setError("");
    try {
      await onRestore(confirmation.id);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Die Version konnte nicht wiederhergestellt werden.");
      setBusy(false);
    }
  }

  return <div className="dialog-backdrop campaign-version-backdrop" onMouseDown={(event) => event.target === event.currentTarget && !busy && onClose()}>
    <section className="dialog campaign-version-dialog" role="dialog" aria-modal="true" aria-labelledby="campaign-version-title">
      <button className="dialog-close" onClick={onClose} disabled={busy} aria-label="Schließen">×</button>
      <div className="eyebrow">Kampagnenverlauf</div>
      <h2 id="campaign-version-title">{campaign.name}</h2>
      <p className="campaign-version-intro">Jeder fertig gespeicherte Stand bleibt nachvollziehbar. Eine ältere Version wird immer zuerst als Entwurf wiederhergestellt.</p>

      {isRunning && <div className="campaign-version-warning"><strong>Diese Kampagne läuft gerade.</strong><span>Pausieren Sie sie zuerst unter „Prüfen & bearbeiten“. So wird keine laufende Anzeige unbemerkt verändert.</span></div>}
      {!history.available && <div className="form-error">Der Versionsverlauf ist momentan nicht verfügbar. Ihre aktuelle Kampagne bleibt davon unverändert.</div>}

      <div className="campaign-version-list">
        {versions.map((version, index) => {
          const summary = versionSummary(version);
          const current = index === 0;
          return <article className={current ? "current" : ""} key={version.id}>
            <div className="campaign-version-number"><b>Version {version.version}</b><span>{current ? "Neuester Stand" : sourceLabels[version.source] || version.source}</span></div>
            <div className="campaign-version-details">
              <strong>{version.configuration.name || campaign.name}</strong>
              <span>{summary.displays} {summary.displays === 1 ? "Bildschirm" : "Bildschirme"} · {summary.contents} {summary.contents === 1 ? "Inhalt" : "Inhalte"} · Priorität {version.configuration.priority ?? 50}</span>
              <small>{new Date(version.created_at).toLocaleString("de-CH", { dateStyle: "medium", timeStyle: "short" })} · {version.created_by_name || "Nicht erfasst"}</small>
            </div>
            <div className="campaign-version-action">{current ? <span>Aktuell gespeichert</span> : canEdit && <button type="button" className="secondary compact" disabled={isRunning || busy} onClick={() => { setError(""); setConfirmation(version); }}>Wiederherstellen</button>}</div>
          </article>;
        })}
        {history.available && !versions.length && <div className="wizard-empty"><strong>Noch kein Versionsstand vorhanden</strong><p>Der erste Stand wird beim nächsten vollständigen Speichern der Kampagne erstellt.</p></div>}
      </div>

      {confirmation && <div className="campaign-version-confirmation">
        <div><strong>Version {confirmation.version} wirklich wiederherstellen?</strong><span>Die aktuelle Konfiguration bleibt im Verlauf erhalten. Der gewählte Stand wird als neuer Entwurf angelegt und erst nach Ihrer Prüfung veröffentlicht.</span></div>
        <div><button type="button" className="secondary" onClick={() => setConfirmation(null)} disabled={busy}>Abbrechen</button><button type="button" className="primary" onClick={() => void restore()} disabled={busy}>{busy ? "Wird wiederhergestellt …" : "Als Entwurf wiederherstellen"}</button></div>
      </div>}
      {error && <div className="form-error">{error}</div>}
      <footer><button type="button" className="secondary" onClick={onClose} disabled={busy}>Schließen</button></footer>
    </section>
  </div>;
}

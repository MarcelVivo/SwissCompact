import { FormEvent, useState } from "react";

export type TemplatePlaylistEntry = { contentId: string; durationSeconds: number };
export type CampaignTemplateConfiguration = {
  theme?: string | null;
  priority?: number;
  scopeSiteId?: string | null;
  scopeAreaId?: string | null;
  defaultDurationDays?: number | null;
  displayIds?: string[];
  targetAssignments?: Array<{ displayId: string; contentItems: TemplatePlaylistEntry[] }>;
};

export type CampaignTemplate = {
  id: string;
  name: string;
  description?: string | null;
  template_kind: string;
  configuration: CampaignTemplateConfiguration;
  source_campaign_id?: string | null;
  created_at: string;
  updated_at: string;
};

export type CampaignTemplatesData = { available: boolean; items: CampaignTemplate[] };

export type CampaignTemplateChoice = CampaignTemplateConfiguration & {
  name: string;
  templateName: string;
  defaultDurationDays: number | null;
  startStep: 1 | 3;
};

const standardTemplates: Array<CampaignTemplateChoice & { icon: string; description: string }> = [
  { name: "Wochenangebot", templateName: "Wochenangebot", theme: "Wöchentliches Angebot", priority: 50, defaultDurationDays: 7, startStep: 1, icon: "7", description: "Eine Woche lang ein Angebot oder Menü zeigen." },
  { name: "Aktion", templateName: "Aktion", theme: "Zeitlich begrenzte Aktion", priority: 75, defaultDurationDays: 14, startStep: 1, icon: "%", description: "Eine wichtige Aktion während zwei Wochen hervorheben." },
  { name: "Information", templateName: "Information", theme: "Information und Öffnungszeiten", priority: 50, defaultDurationDays: null, startStep: 1, icon: "i", description: "Öffnungszeiten oder Hinweise ohne festes Enddatum anzeigen." },
  { name: "Partnerwerbung", templateName: "Partnerwerbung", theme: "Lokale Partnerwerbung", priority: 50, defaultDurationDays: 30, startStep: 1, icon: "↔", description: "Übernommene Partnerwerbung für einen Monat einplanen." },
];

async function templateAction(body: Record<string, unknown>): Promise<Record<string, any>> {
  const response = await fetch("/api/dashboard/records?audience=portal", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "Die Vorlage konnte nicht verarbeitet werden.");
  return result;
}

export function CampaignQuickStartDialog({ templates, onChoose, onClose, onChanged }: {
  templates: CampaignTemplatesData;
  onChoose: (choice: CampaignTemplateChoice) => void;
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  async function remove(template: CampaignTemplate) {
    if (busy) return;
    setBusy(template.id); setError("");
    try {
      await templateAction({ action: "delete_campaign_template", id: template.id });
      await onChanged();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Vorlage konnte nicht gelöscht werden");
    } finally { setBusy(""); }
  }

  return <div className="dialog-backdrop campaign-template-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section className="dialog campaign-template-dialog" role="dialog" aria-modal="true" aria-labelledby="campaign-template-title">
      <button className="dialog-close" onClick={onClose} aria-label="Schliessen">×</button>
      <div className="eyebrow">Kampagnen-Schnellstart</div>
      <h2 id="campaign-template-title">Was möchten Sie anzeigen?</h2>
      <p>Die Vorlage füllt sinnvolle Grundeinstellungen aus. Vor der Veröffentlichung prüfen Sie weiterhin Bildschirm, Inhalt und Zeitpunkt.</p>
      <div className="campaign-template-explainer"><b>1</b><span>Vorlage wählen</span><b>2</b><span>Bildschirm und Inhalt bestätigen</span><b>3</b><span>Vorschau veröffentlichen</span></div>
      <section className="campaign-template-section">
        <header><div><span>Einfach beginnen</span><h3>Standardvorlagen</h3></div><small>Immer verfügbar</small></header>
        <div className="campaign-template-grid">{standardTemplates.map((template) => <button type="button" className="campaign-template-card" key={template.templateName} onClick={() => onChoose(template)}><b>{template.icon}</b><span><strong>{template.templateName}</strong><small>{template.description}</small><em>{template.defaultDurationDays ? `${template.defaultDurationDays} Tage voreingestellt` : "Ohne Enddatum"}</em></span><i>Starten →</i></button>)}</div>
      </section>
      <section className="campaign-template-section">
        <header><div><span>Zeit sparen</span><h3>Meine Vorlagen</h3></div><small>{templates.items.length} gespeichert</small></header>
        {!templates.available && <div className="campaign-template-unavailable"><strong>Eigene Vorlagen werden noch aktiviert.</strong><span>Die Standardvorlagen können Sie bereits verwenden. Für persönliche Vorlagen folgt einmalig die Supabase-Migration.</span></div>}
        {templates.available && templates.items.length > 0 && <div className="campaign-template-grid own">{templates.items.map((template) => {
          const configuration = template.configuration || {};
          const displays = Array.isArray(configuration.displayIds) ? configuration.displayIds : [];
          const assignments = Array.isArray(configuration.targetAssignments) ? configuration.targetAssignments : [];
          const contentCount = new Set(assignments.flatMap((assignment) => assignment.contentItems?.map((item) => item.contentId) || [])).size;
          return <article className="campaign-template-card own" key={template.id}><button type="button" onClick={() => onChoose({ ...configuration, name: template.name, templateName: template.name, defaultDurationDays: configuration.defaultDurationDays ?? 7, startStep: displays.length && contentCount ? 3 : 1 })}><b>★</b><span><strong>{template.name}</strong><small>{template.description || "Eigene wiederverwendbare Ausspielung"}</small><em>{displays.length} {displays.length === 1 ? "Bildschirm" : "Bildschirme"} · {contentCount} {contentCount === 1 ? "Inhalt" : "Inhalte"}</em></span><i>Verwenden →</i></button><button type="button" className="campaign-template-delete" disabled={Boolean(busy)} onClick={() => void remove(template)}>{busy === template.id ? "Wird gelöscht …" : "Vorlage löschen"}</button></article>;
        })}</div>}
        {templates.available && !templates.items.length && <div className="campaign-template-empty"><strong>Noch keine eigene Vorlage</strong><span>Bei einer bestehenden Kampagne können Sie über „Als Vorlage speichern“ Bildschirm- und Inhaltsauswahl übernehmen.</span></div>}
      </section>
      {error && <div className="form-error" role="alert">{error}</div>}
      <footer><button className="secondary" onClick={onClose}>Schliessen</button></footer>
    </section>
  </div>;
}

export function SaveCampaignTemplateDialog({ campaignId, campaignName, onClose, onSaved }: {
  campaignId: string;
  campaignName: string;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const fields = new FormData(event.currentTarget);
    setBusy(true); setError("");
    try {
      await templateAction({ action: "save_campaign_template", campaignId, name: fields.get("name"), description: fields.get("description") });
      await onSaved();
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Vorlage konnte nicht gespeichert werden");
    } finally { setBusy(false); }
  }

  return <div className="dialog-backdrop campaign-template-backdrop" onMouseDown={(event) => event.target === event.currentTarget && !busy && onClose()}>
    <section className="dialog save-template-dialog" role="dialog" aria-modal="true" aria-labelledby="save-template-title">
      <button className="dialog-close" onClick={onClose} disabled={busy} aria-label="Schliessen">×</button>
      <div className="eyebrow">Wiederverwenden</div>
      <h2 id="save-template-title">Als Vorlage speichern</h2>
      <p>Bildschirme, Playlist, Reihenfolge und Anzeigedauer werden übernommen. Start und Ende bestätigen Sie bei jeder neuen Verwendung erneut.</p>
      <form onSubmit={submit}>
        <label>Vorlagenname<input name="name" defaultValue={campaignName} maxLength={180} required autoFocus/></label>
        <label>Beschreibung <small>Optional</small><textarea name="description" rows={3} maxLength={500} placeholder="z. B. Für das wöchentliche Mittagsangebot"/></label>
        {error && <div className="form-error" role="alert">{error}</div>}
        <footer><button type="button" className="secondary" onClick={onClose} disabled={busy}>Abbrechen</button><button className="primary" disabled={busy}>{busy ? "Wird gespeichert …" : "Vorlage speichern"}</button></footer>
      </form>
    </section>
  </div>;
}

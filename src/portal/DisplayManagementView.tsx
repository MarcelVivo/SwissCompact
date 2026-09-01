import { FormEvent, ReactNode, useMemo, useState } from "react";

export type ManagedDisplay = {
  id: string;
  site_id?: string;
  area_id?: string | null;
  name: string;
  kind: string;
  status: string;
  orientation?: string;
  resolution?: { width?: number; height?: number };
  fallback_content_id?: string | null;
  creator_name?: string;
  site?: { name?: string };
  area?: { name?: string };
};

export type DisplayGroup = {
  id: string;
  name: string;
  description?: string | null;
  displayIds: string[];
  created_at: string;
  updated_at: string;
};

export type DisplayGroupsData = { available: boolean; items: DisplayGroup[] };

type SimpleOption = { id: string; name: string };
type ContentOption = { id: string; title: string; status: string };

async function displayAction(body: Record<string, unknown>): Promise<Record<string, any>> {
  const response = await fetch("/api/dashboard/records?audience=portal", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "Die Bildschirmverwaltung konnte nicht aktualisiert werden.");
  return result;
}

function DisplayGroupDialog({ group, displays, onClose, onSaved, onDeleted }: {
  group: Partial<DisplayGroup>;
  displays: ManagedDisplay[];
  onClose: () => void;
  onSaved: () => Promise<void>;
  onDeleted: () => Promise<void>;
}) {
  const [selected, setSelected] = useState(() => new Set(group.displayIds || []));
  const [busy, setBusy] = useState(false);
  const [deleteStage, setDeleteStage] = useState(false);
  const [error, setError] = useState("");

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const fields = new FormData(event.currentTarget);
    setBusy(true); setError("");
    try {
      await displayAction({ action: "save_display_group", id: group.id || null, name: fields.get("name"), description: fields.get("description"), displayIds: [...selected] });
      await onSaved();
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Gruppe konnte nicht gespeichert werden");
    } finally { setBusy(false); }
  }

  async function remove() {
    if (!group.id || busy) return;
    if (!deleteStage) { setDeleteStage(true); return; }
    setBusy(true); setError("");
    try {
      await displayAction({ action: "delete_display_group", id: group.id });
      await onDeleted();
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Gruppe konnte nicht gelöscht werden");
    } finally { setBusy(false); }
  }

  return <div className="dialog-backdrop display-group-backdrop" onMouseDown={(event) => event.target === event.currentTarget && !busy && onClose()}>
    <section className="dialog display-group-dialog" role="dialog" aria-modal="true" aria-labelledby="display-group-title">
      <button type="button" className="dialog-close" onClick={onClose} disabled={busy} aria-label="Schliessen">×</button>
      <div className="eyebrow">Bildschirme ordnen</div>
      <h2 id="display-group-title">{group.id ? "Gruppe bearbeiten" : "Neue Bildschirmgruppe"}</h2>
      <p>Eine Gruppe erleichtert Auswahl und Kampagnenplanung. Die Bildschirme bleiben weiterhin einzeln steuerbar.</p>
      <form onSubmit={submit}>
        <label>Gruppenname<input name="name" defaultValue={group.name || ""} maxLength={180} required autoFocus placeholder="z. B. Eingangsbereich"/></label>
        <label>Beschreibung <small>Optional</small><textarea name="description" defaultValue={group.description || ""} rows={2} maxLength={500} placeholder="Wofür wird diese Gruppe verwendet?"/></label>
        <fieldset><legend>Bildschirme in dieser Gruppe <b>{selected.size} gewählt</b></legend><div className="display-group-member-list">{displays.map((display) => <label className={selected.has(display.id) ? "selected" : ""} key={display.id}><input type="checkbox" checked={selected.has(display.id)} onChange={() => toggle(display.id)}/><span><strong>{display.name}</strong><small>{display.site?.name || "Ohne Standort"}{display.area?.name ? ` · ${display.area.name}` : ""}</small></span></label>)}</div></fieldset>
        {error && <div className="form-error" role="alert">{error}</div>}
        <footer>{group.id && <button type="button" className="delete-record-action" disabled={busy} onClick={() => void remove()}>{deleteStage ? "Wirklich nur die Gruppe löschen" : "Gruppe löschen"}</button>}<span/><button type="button" className="secondary" onClick={onClose} disabled={busy}>Abbrechen</button><button className="primary" disabled={busy}>{busy ? "Wird gespeichert …" : "Gruppe speichern"}</button></footer>
      </form>
    </section>
  </div>;
}

export function DisplayManagementView({ displays, groups, sites, content, canEdit, canManageDevices, pairingBusyId, campaignNames, renderPreview, renderStatus, onCreate, onCampaign, onEdit, onPair, onDelete, onReload }: {
  displays: ManagedDisplay[];
  groups: DisplayGroupsData;
  sites: SimpleOption[];
  content: ContentOption[];
  canEdit: boolean;
  canManageDevices: boolean;
  pairingBusyId: string;
  campaignNames: (displayId: string) => string[];
  renderPreview: (display: ManagedDisplay) => ReactNode;
  renderStatus: (status: string) => ReactNode;
  onCreate: () => void;
  onCampaign: (displayIds: string[]) => void;
  onEdit: (display: ManagedDisplay) => void;
  onPair: (display: ManagedDisplay) => void;
  onDelete: (display: ManagedDisplay) => void;
  onReload: () => Promise<void>;
}) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [siteId, setSiteId] = useState("all");
  const [orientation, setOrientation] = useState("all");
  const [groupId, setGroupId] = useState("all");
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [groupDialog, setGroupDialog] = useState<Partial<DisplayGroup> | null>(null);
  const [targetGroupId, setTargetGroupId] = useState("");
  const [fallbackId, setFallbackId] = useState("__unchanged");
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const normalizedSearch = search.trim().toLocaleLowerCase("de-CH");
  const filtered = useMemo(() => displays.filter((display) => {
    const group = groups.items.find((item) => item.id === groupId);
    const haystack = [display.name, display.site?.name, display.area?.name, display.kind].filter(Boolean).join(" ").toLocaleLowerCase("de-CH");
    return (!normalizedSearch || haystack.includes(normalizedSearch))
      && (status === "all" || display.status === status)
      && (siteId === "all" || (siteId === "unassigned" ? !display.site_id : display.site_id === siteId))
      && (orientation === "all" || display.orientation === orientation)
      && (!group || group.displayIds.includes(display.id));
  }), [displays, groupId, groups.items, normalizedSearch, orientation, siteId, status]);

  const filteredIds = filtered.map((display) => display.id);
  const allVisibleSelected = filteredIds.length > 0 && filteredIds.every((id) => selected.has(id));
  const selectedGroup = groups.items.find((group) => group.id === groupId);
  const approvedContent = content.filter((item) => ["approved", "published"].includes(item.status));

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function selectVisible() {
    setSelected((current) => {
      const next = new Set(current);
      for (const id of filteredIds) allVisibleSelected ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function addToGroup() {
    const group = groups.items.find((item) => item.id === targetGroupId);
    if (!group || !selected.size || busy) return;
    setBusy("group"); setError(""); setNotice("");
    try {
      await displayAction({ action: "save_display_group", id: group.id, name: group.name, description: group.description, displayIds: [...new Set([...group.displayIds, ...selected])] });
      await onReload();
      setNotice(`${selected.size} ${selected.size === 1 ? "Bildschirm wurde" : "Bildschirme wurden"} zu „${group.name}“ hinzugefügt.`);
      setTargetGroupId("");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Gruppe konnte nicht aktualisiert werden"); }
    finally { setBusy(""); }
  }

  async function applyFallback() {
    if (!selected.size || fallbackId === "__unchanged" || busy) return;
    setBusy("fallback"); setError(""); setNotice("");
    try {
      await displayAction({ action: "bulk_set_display_fallback", displayIds: [...selected], contentId: fallbackId || null });
      await onReload();
      setNotice(`Ersatzinhalt für ${selected.size} ${selected.size === 1 ? "Bildschirm" : "Bildschirme"} gespeichert.`);
      setFallbackId("__unchanged");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Ersatzinhalt konnte nicht gespeichert werden"); }
    finally { setBusy(""); }
  }

  return <section className="view display-management-view">
    <div className="section-title"><div><h2>Bildschirme</h2><p>Suchen, gruppieren und mehrere Bildschirme gemeinsam verwalten.</p></div>{canManageDevices && <button className="primary compact" onClick={onCreate}>+ Bildschirm</button>}</div>
    <div className="display-management-toolbar">
      <label className="display-search"><span>Bildschirm suchen</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name, Standort oder Bereich"/></label>
      <label><span>Status</span><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">Alle Status</option><option value="online">Online</option><option value="offline">Offline</option><option value="provisioning">Einrichtung</option><option value="maintenance">Wartung</option></select></label>
      <label><span>Standort</span><select value={siteId} onChange={(event) => setSiteId(event.target.value)}><option value="all">Alle Standorte</option>{sites.map((site) => <option value={site.id} key={site.id}>{site.name}</option>)}<option value="unassigned">Ohne Standort</option></select></label>
      <label><span>Ausrichtung</span><select value={orientation} onChange={(event) => setOrientation(event.target.value)}><option value="all">Alle Formate</option><option value="landscape">Querformat</option><option value="portrait">Hochformat</option><option value="custom">Individuell</option></select></label>
    </div>

    <div className="display-group-strip" aria-label="Bildschirmgruppen"><button type="button" className={groupId === "all" ? "active" : ""} onClick={() => setGroupId("all")}><strong>Alle</strong><small>{displays.length}</small></button>{groups.items.map((group) => <button type="button" className={groupId === group.id ? "active" : ""} onClick={() => setGroupId(group.id)} key={group.id}><strong>{group.name}</strong><small>{group.displayIds.length}</small></button>)}{canEdit && groups.available && <button type="button" className="create-group" onClick={() => setGroupDialog({ displayIds: [...selected] })}>+ Gruppe erstellen</button>}{canEdit && selectedGroup && <button type="button" className="edit-group" onClick={() => setGroupDialog(selectedGroup)}>Gruppe bearbeiten</button>}</div>
    {!groups.available && <div className="display-groups-unavailable"><strong>Bildschirmgruppen werden noch aktiviert.</strong><span>Suche, Filter und Mehrfachauswahl funktionieren bereits. Für dauerhaft gespeicherte Gruppen folgt einmalig die Supabase-Migration.</span></div>}

    <div className="display-selection-summary"><label><input type="checkbox" checked={allVisibleSelected} onChange={selectVisible}/><span>{allVisibleSelected ? "Sichtbare Auswahl aufheben" : `${filtered.length} sichtbare Bildschirme auswählen`}</span></label><b>{selected.size} gewählt</b><small>{filtered.length} von {displays.length} sichtbar</small></div>

    {selected.size > 0 && <div className="display-bulk-actions"><div><strong>{selected.size} {selected.size === 1 ? "Bildschirm" : "Bildschirme"}</strong><small>Eine Aktion gilt nur für diese Auswahl.</small></div>{canEdit && <button type="button" className="primary" onClick={() => onCampaign([...selected])}>Kampagne erstellen</button>}{canEdit && groups.available && <label><span>Zu Gruppe hinzufügen</span><select value={targetGroupId} onChange={(event) => setTargetGroupId(event.target.value)}><option value="">Gruppe wählen</option>{groups.items.map((group) => <option value={group.id} key={group.id}>{group.name}</option>)}</select><button type="button" className="secondary" disabled={!targetGroupId || Boolean(busy)} onClick={() => void addToGroup()}>{busy === "group" ? "Wird gespeichert …" : "Hinzufügen"}</button></label>}{canEdit && <label><span>Ersatzinhalt festlegen</span><select value={fallbackId} onChange={(event) => setFallbackId(event.target.value)}><option value="__unchanged">Inhalt wählen</option><option value="">Kein Ersatzinhalt</option>{approvedContent.map((item) => <option value={item.id} key={item.id}>{item.title}</option>)}</select><button type="button" className="secondary" disabled={fallbackId === "__unchanged" || Boolean(busy)} onClick={() => void applyFallback()}>{busy === "fallback" ? "Wird verteilt …" : "Anwenden"}</button></label>}<button type="button" className="secondary" onClick={() => setSelected(new Set())}>Auswahl aufheben</button></div>}
    {notice && <div className="wizard-success" role="status">✓ {notice}</div>}
    {error && <div className="form-error" role="alert">{error}</div>}

    <div className="display-grid managed-display-grid">{filtered.map((display) => {
      const names = campaignNames(display.id);
      const displayGroups = groups.items.filter((group) => group.displayIds.includes(display.id));
      return <article className={`display-card record-card managed-display-card ${selected.has(display.id) ? "selected" : ""}`} key={display.id}>
        <label className="display-card-select"><input type="checkbox" checked={selected.has(display.id)} onChange={() => toggle(display.id)}/><span>{selected.has(display.id) ? "Ausgewählt" : "Auswählen"}</span></label>
        {renderPreview(display)}
        <div><span className="record-kind">Bildschirm · {display.orientation === "portrait" ? "Hochformat" : display.orientation === "landscape" ? "Querformat" : "Individuell"}</span><div className="record-title-line"><h3>{display.name}</h3>{renderStatus(display.status)}</div><p>{display.site?.name || "Standort noch nicht zugewiesen"}{display.area?.name ? ` · ${display.area.name}` : ""}</p>{displayGroups.length > 0 && <div className="display-card-groups">{displayGroups.map((group) => <span key={group.id}>{group.name}</span>)}</div>}<div className="record-assignment"><span>Kampagnen</span><strong>{names.length ? names.join(", ") : "Noch keine Kampagne zugeordnet"}</strong></div><small>{display.resolution?.width ? `${display.resolution.width} × ${display.resolution.height}` : "Auflösung nicht erfasst"}</small><small className="creator-meta">Erstellt von {display.creator_name || "Nicht erfasst"}</small><div className="record-actions"><a className="player-open-action" href={`/player?preview=${encodeURIComponent(display.id)}`} target="_blank" rel="noreferrer">Player öffnen</a>{canEdit && <button type="button" className="assign-record-action" onClick={() => onCampaign([display.id])}>Inhalt zuweisen</button>}{canManageDevices && <button type="button" className="edit-record-action" onClick={() => onEdit(display)}>Bearbeiten</button>}{canManageDevices && <button type="button" className="device-link" disabled={Boolean(pairingBusyId)} onClick={() => onPair(display)}>{pairingBusyId === display.id ? "Code wird erstellt …" : display.status === "provisioning" ? "Aktivierungscode erstellen" : "Bildschirm neu verbinden"}</button>}{canManageDevices && <button type="button" className="delete-record-action" onClick={() => onDelete(display)}>Löschen</button>}</div></div>
      </article>;
    })}{!filtered.length && <div className="display-filter-empty"><strong>Keine Bildschirme gefunden</strong><span>Passen Sie Suche oder Filter an.</span><button type="button" className="secondary" onClick={() => { setSearch(""); setStatus("all"); setSiteId("all"); setOrientation("all"); setGroupId("all"); }}>Filter zurücksetzen</button></div>}</div>
    {groupDialog && <DisplayGroupDialog
      group={groupDialog}
      displays={displays}
      onClose={() => setGroupDialog(null)}
      onSaved={onReload}
      onDeleted={async () => { setGroupId("all"); await onReload(); }}
    />}
  </section>;
}

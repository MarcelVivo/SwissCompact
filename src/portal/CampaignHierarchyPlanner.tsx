import type { CSSProperties } from "react";

export type HierarchySite = { id: string; name: string };
export type HierarchyArea = { id: string; site_id: string; parent_id?: string | null; name: string; kind: "building" | "floor" | "area" | "zone"; active: boolean };
export type HierarchyDisplay = { id: string; site_id?: string; area_id?: string | null; name: string };

export type HierarchyTarget = {
  key: string;
  label: string;
  detail: string;
  level: "all" | "site" | "area";
  displayIds: string[];
  depth: number;
};

const kindLabels: Record<HierarchyArea["kind"], string> = {
  building: "Gebäude",
  floor: "Stockwerk",
  area: "Bereich",
  zone: "Zone",
};

export function areaDescendants(areas: HierarchyArea[], areaId: string): Set<string> {
  const result = new Set([areaId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const area of areas) {
      if (area.parent_id && result.has(area.parent_id) && !result.has(area.id)) {
        result.add(area.id);
        changed = true;
      }
    }
  }
  return result;
}

export function areaLineage(areas: HierarchyArea[], areaId?: string | null): string[] {
  if (!areaId) return [];
  const byId = new Map(areas.map((area) => [area.id, area]));
  const lineage: string[] = [];
  const visited = new Set<string>();
  let current = byId.get(areaId);
  while (current && !visited.has(current.id)) {
    lineage.unshift(current.id);
    visited.add(current.id);
    current = current.parent_id ? byId.get(current.parent_id) : undefined;
  }
  return lineage;
}

export function buildHierarchyTargets(sites: HierarchySite[], areas: HierarchyArea[], displays: HierarchyDisplay[]): HierarchyTarget[] {
  const targets: HierarchyTarget[] = [{
    key: "all",
    label: "Standard für alle",
    detail: `${displays.length} ${displays.length === 1 ? "Bildschirm" : "Bildschirme"}`,
    level: "all",
    displayIds: displays.map((display) => display.id),
    depth: 0,
  }];
  for (const site of sites) {
    const siteDisplays = displays.filter((display) => display.site_id === site.id);
    if (!siteDisplays.length) continue;
    targets.push({ key: `site:${site.id}`, label: site.name, detail: `Standort · ${siteDisplays.length}`, level: "site", displayIds: siteDisplays.map((display) => display.id), depth: 0 });
    const siteAreas = areas.filter((area) => area.site_id === site.id && area.active);
    for (const area of siteAreas) {
      const descendants = areaDescendants(siteAreas, area.id);
      const areaDisplays = siteDisplays.filter((display) => Boolean(display.area_id && descendants.has(display.area_id)));
      if (!areaDisplays.length) continue;
      const depth = Math.max(0, areaLineage(siteAreas, area.id).length - 1);
      targets.push({ key: `area:${area.id}`, label: area.name, detail: `${kindLabels[area.kind]} · ${areaDisplays.length}`, level: "area", displayIds: areaDisplays.map((display) => display.id), depth });
    }
  }
  return targets;
}

export function HierarchySelectionShortcuts({ targets, selectedIds, disabled, onChange }: {
  targets: HierarchyTarget[];
  selectedIds: Set<string>;
  disabled: boolean;
  onChange: (displayIds: string[], selected: boolean) => void;
}) {
  return <div className="hierarchy-shortcuts">
    <div><strong>Schnellauswahl nach Ort</strong><small>Ein Klick wählt automatisch alle untergeordneten Bildschirme.</small></div>
    <div>{targets.map((target) => {
      const selected = target.displayIds.length > 0 && target.displayIds.every((id) => selectedIds.has(id));
      return <button type="button" className={`${selected ? "selected" : ""} level-${target.level}`} style={{ "--hierarchy-depth": target.depth } as CSSProperties} disabled={disabled || !target.displayIds.length} onClick={() => onChange(target.displayIds, !selected)} key={target.key}><span>{selected ? "✓" : "+"}</span><strong>{target.label}</strong><small>{target.detail}</small></button>;
    })}</div>
  </div>;
}

export function HierarchyPlaylistTabs({ targets, activeKey, overriddenKeys, onChange }: {
  targets: HierarchyTarget[];
  activeKey: string;
  overriddenKeys: Set<string>;
  onChange: (key: string) => void;
}) {
  return <div className="hierarchy-playlist-tabs">
    <div><strong>Playlist-Ebene wählen</strong><small>Eine genauere Ebene ersetzt für ihre Bildschirme automatisch die allgemeinere Playlist.</small></div>
    <div>{targets.map((target) => <button type="button" className={`${activeKey === target.key ? "active" : ""} ${overriddenKeys.has(target.key) ? "configured" : "inherited"}`} style={{ "--hierarchy-depth": target.depth } as CSSProperties} onClick={() => onChange(target.key)} key={target.key}><strong>{target.label}</strong><small>{overriddenKeys.has(target.key) ? "Eigene Playlist" : target.key === "all" ? "Standard" : "Erbt automatisch"}</small></button>)}</div>
  </div>;
}

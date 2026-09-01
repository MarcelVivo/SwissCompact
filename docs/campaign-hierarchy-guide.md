# Hierarchische Kampagnen-Playlists

Die Kampagnenplanung verwendet weiterhin die bewährten zielbezogenen Display-Playlists. Die neue Hierarchie wird im Portal verständlich konfiguriert und beim Speichern sicher zu einer fertigen Playlist pro Bildschirm aufgelöst.

## Bedienlogik

1. Unter **Wo?** können alle Bildschirme, ein Standort, ein Gebäude, ein Stockwerk, ein Bereich oder einzelne Bildschirme gewählt werden.
2. Unter **Was?** stehen drei Modi zur Verfügung:
   - **Überall gleich**: eine Playlist für alle Ziele.
   - **Nach Ort anpassen**: Standard-Playlist mit gezielten Abweichungen je Standort oder Bereich.
   - **Je Bildschirm anders**: vollständig individuelle Playlist je Bildschirm.
3. Bei **Nach Ort anpassen** gilt automatisch: Standard → Standort → Gebäude/Stockwerk/Bereich. Die genauere Einstellung gewinnt.
4. Eine eigene Playlist kann entfernt werden. Die Ebene erbt danach wieder von oben.
5. Beim Speichern materialisiert das Portal die wirksame Playlist für jeden Bildschirm. Der Player benötigt dadurch keine riskante neue Laufzeitlogik.

## Prioritäten

- Hintergrund: 25
- Normal: 50
- Wichtig: 75
- Dringend: 100

Bei zeitgleichen Kampagnen spielt der Player nur die Kampagnen mit der höchsten Priorität. Kampagnen gleicher Priorität dürfen auf demselben Bildschirm zeitlich nicht kollidieren; das Portal blockiert die Veröffentlichung mit einer verständlichen Meldung.

## Persistenz und Sicherheit

Die aufgelösten Playlists stehen in `tenant_campaign_display_content`. Zusätzlich speichert `tenant_campaigns.schedule` die Portalstrategie und die bewusst konfigurierten Vererbungsebenen. Die API prüft sämtliche Standort-, Bereichs- und Inhaltsreferenzen erneut gegen das aktive Kundenportal.

Für diese Erweiterung ist keine zusätzliche Supabase-Migration notwendig.

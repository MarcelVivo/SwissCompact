# Beauty & Personal Care – Qualitätsaudit

Stand: 28. Juli 2026

## Referenzrahmen

Die drei Räume wurden gegen reale Premium-Betriebe und Schweizer
Gesundheitspraxen geprüft. Als Referenzen dienten unter anderem:

- Friseur Pächter, Rotes Haus Dornbirn:
  https://www.roteshaus.at/friseur-paechter
- Beauty Trend Salon Dubai:
  https://www.fresha.com/a/beauty-trend-salon-dubai-jvc-emirates-garden-1-lavender-2-bldg-shop-1-district-12-street-16-njp5jpx1
- Physiotherapie Hubertus Boesten, Wettingen:
  https://www.hubertusboesten.ch/
- AVEO Physiotherapie, Wattwil:
  https://www.physiotherapie-aveo.ch/standortwalk-in
- Physiozentrum Zürich Enge:
  https://www.physiozentrum.ch/2021/12/neues-physiozentrum-am-bahnhof-zuerich-enge/
- FisioExpert Praxis:
  https://www.fisioexpert.ch/praxis/

## Umgesetzte Verbesserungen

### Architektur und Navigation

1. Die bestehende Themenarchitektur wurde statt einer separaten Anwendung
   erweitert.
2. „Beauty & Personal Care“ wurde als eigene Hauptkategorie eingebunden.
3. Die drei geforderten Raumtypen wurden mit ihren vollständigen Namen
   hinterlegt.
4. Jeder Raum besitzt eine eigenständige, persistierte Konfiguration.
5. Die bestehende Kamera- und Orbit-Logik wurde unverändert übernommen.
6. Der lange Raumname der Physiotherapie bricht responsiv sauber um.
7. Das Raumtypen-Menü passt seine Breite an kleine Viewports an.
8. Alle bestehenden Gastronomie-Konfigurationen bleiben kompatibel.

### Coiffeur & Barber Shop

9. Eine dunkle, maskuline Farbwelt aus Nussbaum und Schwarz wurde aufgebaut.
10. Eine akustisch wirkende Lamellenwand aus Instanzen ergänzt die Rückwand.
11. Zwei grosse Styling-Spiegel erzeugen realistische Arbeitsplätze.
12. Dezente LED-Akzente rahmen die Spiegel.
13. Zwei eigenständige Barber Chairs sind direkt sichtbar und bewegbar.
14. Zwei Waschplätze ergänzen den vollständigen Salonablauf.
15. Ein separater Empfang mit Steinplatte und Lichtkante wurde ergänzt.
16. Eine gepolsterte Wartebank schafft einen glaubwürdigen Kundenbereich.
17. Ein Produktregal ergänzt den Retail-Bereich.
18. Die Produktflaschen werden performant instanziert.
19. Eine hochwertige Grünpflanze lockert die dunkle Materialwelt auf.
20. Warme praktische Leuchten schaffen eine eigene Salon-Lichtstimmung.
21. Eigenes Editorial-Motiv und Barber-spezifische Inhalte ersetzen generische
    Beauty-Inhalte.

### Beauty Salon & Kosmetik

22. Die Materialwelt wurde auf Elfenbein, Beige und Naturholz abgestimmt.
23. Marmor und gebürstetes Gold setzen hochwertige Akzente.
24. Eine eigenständige Behandlungsliege bildet den Kosmetikbereich.
25. LED-Spiegel und Stylingplätze schaffen einen klaren Beauty-Arbeitsplatz.
26. Ein Nageltisch mit Maniküreleuchte ergänzt Nail Design.
27. Eine Hautanalyse-Konsole ergänzt moderne Kosmetikbehandlungen.
28. Ein beweglicher Kosmetikwagen unterstützt realistische Abläufe.
29. Ein beleuchtetes Produktmöbel ergänzt Pflege und Verkauf.
30. Instanzierte Produktflaschen reduzieren Draw Calls.
31. Pflanzen und indirektes Deckenlicht machen den Raum weich und wohnlich.
32. Eine eigene helle, warme Lichtabstimmung ersetzt die Barber-Stimmung.
33. Inhalte decken Gesichtsbehandlung, PMU, Nägel, Wimpern, Hautpflege,
    Produkte, Aktionen und Termine ab.

### Physiotherapie & Medizinische Massage

34. Der Raum erhielt einen eigenen warmen Holzboden statt eines Salonbodens.
35. Grosse, dreidimensionale Fensterflächen vermitteln viel Tageslicht.
36. Eine instanzierte Eichen-Lamellenwand verbessert die akustische Wirkung.
37. Eine höhenverstellbare Behandlungsliege bildet den Therapiekern.
38. Sprossenwand und Kabelzug ermöglichen realistische Übungsszenarien.
39. Ein eigenständiges Ergometer ergänzt aktive Rehabilitation.
40. Eine Anatomie-Station mit vereinfachtem Wirbelsäulenmodell wurde ergänzt.
41. Geschlossene Schränke und offene Ablagen sorgen für medizinische Ordnung.
42. Ein eigener Empfang wurde zurückhaltend in die Raumplanung integriert.
43. Ein heller Wartebereich schafft Vertrauen ohne steril zu wirken.
44. Therapiebälle ergänzen den funktionalen Gerätebestand.
45. Grünpflanzen balancieren die medizinische Anmutung.
46. Neutrale Deckenflächen und Tageslicht erzeugen eine eigene Lichtstimmung.
47. Eigenes Therapie-Motiv und Inhalte für Übungen, Anatomie, Prävention,
    Gesundheitsvideos und Patienteninformation wurden integriert.

### Displays, Interaktion und Performance

48. Jeder Raum nutzt eine andere Kombination aus Wand-, Preis-, Empfangs-,
    Säulen- und Stelen-Displays.
49. Alle Beauty-Displays wechseln ihre Inhalte animiert.
50. Fortschrittslinien und Indikatorpunkte machen den Bildwechsel erkennbar.
51. Eine dezente Scan-Licht-Animation ergänzt Motion Graphics.
52. Vorher/Nachher, Angebote, Services und Termine rotieren pro Raum.
53. `prefers-reduced-motion` wird für barrierearme Nutzung respektiert.
54. Canvas-Updates sind zeitlich gedrosselt und über Displays gestaffelt.
55. Pflanzenblätter, Produktflaschen, Lamellen und Anatomieelemente verwenden
    Instancing.
56. Materialien werden zwischen Objekten wiederverwendet.
57. Die neuen Editorial-Texturen wurden von rund 3,5 MB auf rund 0,6 MB
    reduziert.
58. Nicht benötigte Raster und Deckenleisten werden je Raum ausgeblendet.
59. Empfang und Theken wurden auf die jeweilige Raumgeometrie skaliert.
60. Wesentliche Möbel starten sichtbar und bleiben mit der bestehenden
    Auswahl-, Puls- und Drag-Logik bearbeitbar.

## Prüfkriterien

- Build ohne TypeScript- oder Vite-Fehler
- Wechsel zwischen Gastronomie und Beauty ohne Zustandsverlust
- Alle drei Raumtypen mit eigener Architektur und sichtbaren Möbeln
- Animierte Displays in jedem Raum
- Keine JavaScript- oder WebGL-Fehler
- Kein horizontaler Overflow auf Desktop, Laptop, Tablet oder Mobile
- Raumtypen-Menü vollständig innerhalb des Viewports
- Bestehende Möbel-, Säulen- und Stelen-Auswahllogik weiterhin funktionsfähig

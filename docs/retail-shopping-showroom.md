# Retail & Shopping – 3D-Showroom

Stand: 30. Juli 2026

## Referenzrahmen

Die Raumkonzepte orientieren sich an aktuellen Premium-Retail-Projekten:

- AMIRI Galeries Lafayette: warme Materialien, wohnliche Raumfolgen,
  kuratierte Produktzonen und zurückhaltende Luxuswirkung  
  https://nocod.fr/project/amiri-galeries-lafayette/
- Zara Diagonal Barcelona: Naturmaterialien, klare Blickachsen und ein
  bewusst ruhiges, hochwertiges Ladenbild  
  https://www.wallpaper.com/design-interiors/interior-design/zara-diagonal-barcelona-vincent-van-duysen
- Harrods Technology Rooms: klar getrennte Technologiewelten, hochwertige
  Holzböden und beratungsorientierte Präsentationsbereiche  
  https://www.havwoods.com/ie/case-studies/harrods-technology-rooms-london/
- Vodafone Experience Store: Produktinseln, Servicepunkte, Demo-Zonen und
  digitale Markenkommunikation  
  https://www.household-design.com/work/vodafone/

Die Referenzen wurden als Gestaltungsprinzipien verwendet. Marken, Logos,
Bildmaterial und proprietäre Ladenkonzepte wurden nicht übernommen.

## Architektur und Konfiguration

`Retail & Shopping` ist als fünfte Hauptkategorie in die bestehende
Showroom-Architektur eingebunden. Die Kategorie enthält:

- `fashionStore` – Modegeschäft
- `electronicsStore` – Elektronikfachmarkt
- `shoppingMall` – Einkaufszentrum

Jeder Raum besitzt eine eigene persistierte `RoomConfiguration`. Raumgrösse,
Lichtstimmung, Helligkeit, Boden, Oberflächen, Öffnungen, Säulen, Stelen und
Display-Installationen werden unabhängig gespeichert und über den vorhandenen
Reset-Mechanismus auf die kuratierte Grundausstattung zurückgesetzt.

Alle neuen Möbel und Architekturelemente sind einzeln in der bestehenden
Auswahlliste registriert. Damit bleiben Verschieben, achsenweises Skalieren,
Drehen und – ausser bei Displays – die freie Farbwahl konsistent mit den
bisherigen Räumen. Türen, Fenster, Wände, Rückwand, Boden und Decke verwenden
weiterhin die vorhandenen spezialisierten Bearbeitungswerkzeuge.

## Qualitätsaudit – 40 umgesetzte Verbesserungen

### Gemeinsame Retail-Architektur

1. Eine eigene, aktive Hauptkategorie ersetzt den früheren Platzhalter.
2. Die drei Raumtypen erscheinen in beiden Desktop- und Mobilmenüs.
3. Jeder Raum besitzt eine unverwechselbare Grundfläche und Raumtiefe.
4. Jeder Raum startet mit einer eigenen Licht- und Materialstimmung.
5. Je Raum wurden drei thematisch sinnvoll positionierte Türen oder Fenster
   angelegt.
6. Wanddisplays werden automatisch aus Öffnungsflächen herausgehalten.
7. Für die Grundkonfiguration wurden null Display-/Öffnungskollisionen
   verifiziert.
8. Displays bleiben unabhängig voneinander verschieb- und skalierbar.
9. Säulen und Stelen haben je Raum andere Anzahl, Höhe, Farbe und Position.
10. Alle neuen Möbelgruppen sind einzeln auswählbar und transformierbar.

### Modegeschäft

11. Damen- und Herrenbereiche sind räumlich getrennt angeordnet.
12. Vier eigenständige Kleiderständer bilden unterschiedliche Sortimentszonen.
13. Farblich variierte Kleidungsstücke verbessern Lesbarkeit und Kontrast.
14. Zwei niedrige Produktinseln schaffen freie Blickachsen durch den Raum.
15. Drei einzeln auswählbare Mannequins markieren den Eingangsbereich.
16. Drei Umkleidekabinen liegen geschützt an der rückwärtigen Raumzone.
17. Eine grosse Spiegelwand ergänzt die Anprobe.
18. Ein wohnlicher Lounge-Bereich schafft eine ruhige Beratungszone.
19. Zwei Pflanzen setzen natürliche Akzente.
20. Eiche, weicher Stein, Messing, Textilien und schwarzes Metall bilden eine
    zurückhaltende Premium-Materialpalette.
21. Warmes Keylight, kühles Rimlight und indirekte Lichtlinien erzeugen
    deutliche Licht-/Schattenkontraste.
22. Displays zeigen neutrale Kollektion-, Outfit-, Umkleide- und
    Serviceinhalte ohne Fremdmarken.

### Elektronikfachmarkt

23. Smartphone-, Computer- und Audio-Bereiche sind als klare Fachzonen
    ausgebildet.
24. Fünf eigenständige Demotische tragen modellierte Geräte.
25. Smartphones, aufgeklappte Laptops und Lautsprecher besitzen eigene
    Geometrien statt reiner Textflächen.
26. Eine TV- und Videowand bildet einen klaren visuellen Fokus an der
    Rückseite.
27. Eine separate Gaming-Zone ergänzt die Erlebnisorientierung.
28. Eine begehbar lesbare Smart-Home-Wohnwelt demonstriert vernetzte Geräte.
29. Eine eigene Service- und Beratungsbar trennt Verkauf und Support.
30. Graphit, Hellgrau und Cyan sorgen für hohe Objektkontraste.
31. Kühles indirektes Licht und stärkere Kantenlichter geben dem Raum eine
    technisch präzise Atmosphäre.
32. Animierte Displays wechseln zwischen Computing, Gaming, Smart Home,
    Service und Produktneuheiten.

### Einkaufszentrum

33. Acht einzeln auswählbare Ladenfronten erzeugen einen realistischen
    Storefront-Rhythmus.
34. Eine breite zentrale Besucherachse bleibt frei und klar lesbar.
35. Eine obere Galerie mit Glasbrüstung erzeugt die typische mehrgeschossige
    Mall-Silhouette.
36. Zwei Rolltreppen verbinden die Ebenen visuell.
37. Die 36 Rolltreppenstufen werden mit zwei `InstancedMesh`-Draw-Calls
    gerendert.
38. Ein Glasaufzug ergänzt barrierefreie vertikale Erschliessung.
39. Ein transparentes Glasdach mit Tragwerk erzeugt viel Tageslicht.
40. Drei Ruhezonen, vier grosse Pflanzen und ein Food-Court-Bereich beleben
    die Besucherachse.

## Licht, Materialien und Performance

- Materialien werden innerhalb jeder Retail-Szene wiederverwendet.
- Die Szenen bestehen aus optimierten Three.js-Primitiven und benötigen keine
  zusätzlichen grossen Binärmodelle oder Retail-Bilddateien.
- Displaygrafiken werden als `CanvasTexture` erzeugt und zeitlich gedrosselt
  animiert.
- Nicht aktive Retail-Gruppen werden vollständig ausgeblendet.
- Die bestehende bedarfsgesteuerte Initialisierung des Showrooms bleibt
  erhalten.
- Transparente Flächen deaktivieren `depthWrite`, um Glasartefakte zu
  reduzieren.
- Das Einkaufszentrum nutzt Instancing für wiederholte Rolltreppenstufen.
- Alle drei Lichtprofile verwenden ein helles Grundniveau, aber reduzierte
  Umgebungsanteile und gerichtete Key-/Rimlights für sichtbare Schatten.

## Automatisierte Abnahme

`npm run test:retail` prüft:

- Aktivierung und Navigation der Kategorie
- drei eigenständige Raum-Presets und Architekturgruppen
- kuratierte Raumgrössen und Bodenmaterialien
- hohe Lichtkontraststufe
- Mindestanzahl individuell auswählbarer Möbel
- Türen und Fenster
- null Display-/Öffnungskollisionen
- aktive und animierte Displays
- konkrete Auswahl-IDs in jedem Raum
- exakt drei sichtbare Retail-Raumtypen
- horizontalen Overflow auf Tablet und Mobile
- JavaScript- und Browserfehler

Der allgemeine Signaturtest deckt die Retail-Räume zusätzlich zusammen mit
allen bisherigen Showrooms ab. Die generischen Tests für Objektfarben,
Oberflächen, Raumzustand, Auswahlworkflow und Möbeltransformation enthalten
ebenfalls alle drei neuen Presets.

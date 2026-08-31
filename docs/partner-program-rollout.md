# Partnernetzwerk – optionale, faire lokale Werbung

Das Partnernetzwerk ist eine **optionale Zusatzfunktion** und kein Hauptangebot von SwissCompact. Zwei bestätigte Kunden können lokale Werbeleistung fair tauschen, einen extern bezahlten Auftrag dokumentieren, beides kombinieren oder einen Betrieb bewusst kostenlos unterstützen.

Ein Partner erhält niemals Zugriff auf fremde Bildschirme. Der Bildschirmbesitzer prüft das Angebot, übernimmt den Inhalt und plant die Ausspielung selbst.

## Fairnessmodell für den Pilotbetrieb

Ein Werbepunkt entspricht:

```text
1 Bildschirm × 1 Tag × 10 % Anteil an der Playlist
```

Beispiel:

```text
Bäckerei:       1 Bildschirm × 30 Tage × 100 % = 300 Punkte
Einkaufszentrum: 10 Bildschirme × 30 Tage × 10 % = 300 Punkte
```

Damit wird nicht nur die Anzahl der Bildschirme verglichen, sondern die tatsächlich vereinbarte Werbefläche über die Zeit. Die vier möglichen Vereinbarungen sind:

- **Fairer Werbetausch:** Der gesamte Werbewert wird als Punktesaldo verbucht.
- **Bezahlte Werbung:** Die Betriebe vereinbaren einen CHF-Betrag direkt miteinander.
- **Tausch + CHF-Ausgleich:** Ein Teil wird durch Gegenwerbung, der Rest extern in CHF ausgeglichen.
- **Kostenlose Unterstützung:** Beide Betriebe halten ausdrücklich fest, dass keine Gegenleistung geschuldet ist.

Jede Partnerschaft hat ein beidseitig akzeptiertes Kreditlimit. Ist ein Betrieb zu stark im Minus, kann keine weitere reine Tauschleistung angenommen werden. Dann braucht es zuerst Gegenwerbung oder einen CHF-Ausgleich.

Wichtig: SwissCompact zieht in dieser Pilotversion **kein Geld ein**. CHF-Beträge dienen als Protokoll der externen Vereinbarung. Rechnung, Zahlung, Steuern und allfällige Werbeabgaben bleiben Sache der beteiligten Betriebe.

## 1. Datenbank aktivieren

Im Supabase SQL Editor den **vollständigen Inhalt** von
`supabase/migrations/20260907_partner_network.sql` ausführen.

Erwartetes Resultat:

```text
Success. No rows returned
```

## 2. Datenmodell kontrollieren

Danach diesen Block im SQL Editor ausführen:

```sql
select
  to_regclass('swisscompact.tenant_partnerships') is not null as partnerschaften,
  to_regclass('swisscompact.tenant_partner_content_offers') is not null as werbeangebote,
  exists (
    select 1 from information_schema.columns
    where table_schema = 'swisscompact'
      and table_name = 'tenant_partnerships'
      and column_name = 'barter_credit_limit_points'
  ) as kreditlimit,
  exists (
    select 1 from information_schema.columns
    where table_schema = 'swisscompact'
      and table_name = 'tenant_partner_content_offers'
      and column_name = 'delivery_value_points'
  ) as werbepunkte,
  exists (
    select 1 from information_schema.columns
    where table_schema = 'swisscompact'
      and table_name = 'tenant_partner_content_offers'
      and column_name = 'settlement_mode'
  ) as abrechnungsart,
  exists (
    select 1 from information_schema.columns
    where table_schema = 'swisscompact'
      and table_name = 'tenant_partner_content_offers'
      and column_name = 'delivery_status'
  ) as bestaetigung,
  exists (
    select 1 from pg_policies
    where schemaname = 'swisscompact'
      and tablename = 'tenant_partnerships'
      and policyname = 'tenant_partnerships_read'
  ) as partnerschaften_rls,
  exists (
    select 1 from pg_policies
    where schemaname = 'swisscompact'
      and tablename = 'tenant_partner_content_offers'
      and policyname = 'tenant_partner_content_offers_read'
  ) as werbeangebote_rls;
```

Alle acht Werte müssen `true` sein.

## 3. Pilot testen

Voraussetzung: Zwei aktive Kundenportale mit unterschiedlichen bestätigten Portal-E-Mails.

1. Im ersten Portal `Partnernetzwerk` öffnen, Kreditlimit wählen und den zweiten Betrieb einladen.
2. Im zweiten Portal das Kreditlimit und die Verbindung annehmen.
3. Im ersten Portal einen freigegebenen Inhalt sowie Bildschirme, Playlist-Anteil, Zeitraum und Ausgleichsart festlegen.
4. Prüfen, ob das Portal den erwarteten Werbewert verständlich anzeigt.
5. Im zweiten Portal die Vereinbarung annehmen und den Inhalt über den normalen Kampagnenablauf einplanen.
6. Nach dem Zeitraum meldet der Bildschirmbesitzer die Leistung als erfüllt.
7. Der werbende Betrieb bestätigt die Leistung oder markiert eine Rückfrage.
8. Bei bezahlten Modellen dokumentiert der Bildschirmbesitzer den externen CHF-Eingang.

Erwartetes Sicherheitsverhalten:

- Ohne Annahme erscheint der Inhalt nicht in der fremden Mediathek.
- Mit Annahme wird noch nichts automatisch veröffentlicht.
- Der Bildschirmbesitzer entscheidet selbst über die tatsächliche Kampagne.
- Tauschpunkte werden serverseitig berechnet und können nicht vom Browser manipuliert werden.
- Das Kreditlimit verhindert eine dauerhafte einseitige Nutzung.
- Eine Leistung gilt erst nach Bestätigung beider Betriebe als abgeschlossen.
- Ein übernommener Partnerinhalt kann beim Anbieter nicht endgültig gelöscht werden, solange der Empfänger ihn verwendet.

## 4. Bewusste Pilotgrenze

Die Erfüllung wird zunächst manuell von beiden Betrieben bestätigt. Eine spätere Ausbaustufe kann die effektiven Player-Ausspielungen automatisch als Proof-of-Play erfassen. Bevor SwissCompact selbst Zahlungen, Rechnungen oder Provisionen abwickelt, braucht es eine separate kaufmännische und rechtliche Prüfung.

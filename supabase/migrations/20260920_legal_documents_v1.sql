-- Fachlich geprüfte Rechtsdokumente Version 1.0; öffentliche Fassung vom 2. September 2026.
-- Generiert aus docs/legal/*.md. Änderungen dort vornehmen und npm run legal:generate ausführen.
begin;

do $$
declare
  target_id uuid;
  target_status text;
begin
  select id, status into target_id, target_status
  from swisscompact.legal_documents
  where document_type = 'terms' and version = '1.0';

  if target_status = 'published' then
    if not exists (
      select 1 from swisscompact.legal_documents
      where id = target_id
        and acceptance_scope = 'user'
        and title = $legal$Nutzungsbedingungen Kundenportal$legal$
        and summary = $legal$Regelt den sicheren und verbindlichen Zugang zum SwissCompact-Kundenportal.$legal$
        and content_markdown = $legal$# Nutzungsbedingungen Kundenportal

Version 1.0 · gültig ab 2. September 2026

## 1. Anbieter und Geltungsbereich

Das SwissCompact-Kundenportal wird von Marcel Spahr, handelnd unter SwissCompact, Schwarzenburgstrasse 65, 3008 Bern, Schweiz, kontakt@swisscompact.com (nachfolgend „SwissCompact“) bereitgestellt. Das Portal richtet sich ausschliesslich an Unternehmen und andere Organisationen. Portalbenutzer handeln für den im Portal bezeichneten Kundenbetrieb.

Diese Nutzungsbedingungen regeln den Zugang zum Portal und dessen digitale Funktionen. Für Umfang, Preise, Termine und besondere Leistungen gilt vorrangig die individuell angenommene Offerte oder Vereinbarung. Eine Vereinbarung zur Auftragsbearbeitung und eine besondere Support- oder Servicevereinbarung gehen diesen Bedingungen für ihren jeweiligen Gegenstand vor.

## 2. Zugang und Berechtigungen

Zugänge sind persönlich und dürfen nicht geteilt werden. Benutzer müssen Zugangsdaten, Authenticator-Codes, Passkeys und Wiederherstellungsmittel geheim halten und ihre Geräte angemessen schützen. Verdächtige Zugriffe, verlorene Geräte oder ein Rollenwechsel sind SwissCompact unverzüglich zu melden.

Inhaber und Administratoren des Kundenbetriebs verwalten betriebliche Freigaben und tragen dafür Sorge, dass nur berechtigte Personen Zugang erhalten. Handlungen eines angemeldeten Benutzers werden dem Kundenbetrieb zugerechnet, soweit SwissCompact nicht erkennen musste, dass die Person unberechtigt handelte.

## 3. Funktionen und Mitwirkung

Das Portal kann insbesondere Projektakten, Offerten, Rechnungen, Freigaben, Medien, Kampagnen, Displays, Partnerverbindungen, Support und Datenexporte bereitstellen. Der konkrete Funktionsumfang richtet sich nach dem gebuchten Paket und der individuellen Vereinbarung.

Der Kundenbetrieb prüft Eingaben, Empfänger, Zeiträume, Bildschirmzuordnungen, Vorschauen und Freigaben vor einer verbindlichen Aktion. Er stellt vollständige und richtige Angaben bereit und meldet erkennbare Fehler zeitnah. Hardware darf nur entsprechend der Anleitung und ohne Umgehung von Schutzmechanismen betrieben werden.

## 4. Inhalte und Rechte

Der Kundenbetrieb behält seine Rechte an hochgeladenen Inhalten. Er räumt SwissCompact für Vertragsdauer die zur Speicherung, technischen Bearbeitung, Darstellung, Auslieferung, Sicherung und Fehleranalyse erforderlichen Rechte ein. Der Kundenbetrieb sichert zu, dass er über alle erforderlichen Rechte und Einwilligungen verfügt und die Inhalte keine Rechte Dritter oder gesetzlichen Vorgaben verletzen.

Unzulässig sind insbesondere rechtswidrige, täuschende, diskriminierende, gewaltverherrlichende oder schädliche Inhalte, Schadsoftware, unbefugte Zugriffsversuche sowie die Umgehung technischer Schutz- oder Nutzungslimiten. SwissCompact darf betroffene Inhalte oder Zugänge vorläufig sperren, soweit dies zum Schutz von Personen, Systemen oder Dritten erforderlich ist, und informiert den Kundenbetrieb soweit zulässig.

## 5. KI-Funktionen

KI-Funktionen können Vorschläge, Bilder oder Supportantworten erzeugen. Ergebnisse können unvollständig oder fehlerhaft sein und ersetzen keine fachliche, rechtliche, medizinische, finanzielle oder sicherheitstechnische Prüfung. Der Kundenbetrieb prüft KI-Ergebnisse vor jeder Veröffentlichung oder geschäftlichen Verwendung.

Passwörter, API-Schlüssel, Zahlungsdaten, besonders schützenswerte Personendaten und andere nicht erforderliche Geheimnisse dürfen nicht in KI-Eingaben aufgenommen werden. Für Supportanhänge wird eine KI-Analyse nur nach ausdrücklicher Freigabe verwendet. Verbindliche Vertrags-, Zahlungs-, Lösch- oder Sicherheitsentscheidungen werden nicht allein durch die KI getroffen.

## 6. Betrieb, Wartung und Support

SwissCompact betreibt das Portal mit angemessener Sorgfalt. Wartungen, Sicherheitsmassnahmen, Störungen von Telekommunikationsnetzen und Ausfälle externer Anbieter können die Verfügbarkeit vorübergehend einschränken. Eine unterbrechungsfreie Verfügbarkeit ist nur geschuldet, wenn sie ausdrücklich schriftlich vereinbart wurde.

Supportziele bezeichnen die angestrebte Zeit bis zur ersten persönlichen Reaktion und keine garantierte Lösungszeit. Kritische Vorfälle können direkt an das Supportteam eskaliert werden. Kunden müssen zumutbare Angaben zur Eingrenzung einer Störung bereitstellen.

## 7. Vergütung und Abonnemente

Preise, Zahlungsplan, Mindestlaufzeit, Verlängerung und Kündigung richten sich nach der angenommenen Offerte oder Paketvereinbarung. Soweit dort nichts anderes steht, sind Rechnungen innerhalb der ausgewiesenen Frist zahlbar. Bei Zahlungsverzug oder erheblichem Vertragsverstoss kann SwissCompact betroffene entgeltliche Funktionen nach vorheriger Mahnung angemessen einschränken; zwingende Zugriffs- und Herausgaberechte bleiben vorbehalten.

Separat erworbene KI-Guthaben sind nutzungsbezogene Vorauszahlungen. Eine Barauszahlung oder Übertragung ist ausgeschlossen, soweit die individuelle Vereinbarung nichts anderes bestimmt oder zwingendes Recht entgegensteht.

## 8. Gewährleistung und Haftung

Mängel sind mit einer nachvollziehbaren Beschreibung unverzüglich zu melden. SwissCompact erhält eine angemessene Gelegenheit zur Prüfung und Nachbesserung. Für Leistungen Dritter gelten zusätzlich deren technische Grenzen, soweit diese transparent Bestandteil der vereinbarten Lösung sind.

SwissCompact haftet unbeschränkt für vorsätzlich oder grobfahrlässig verursachte Schäden sowie in Fällen, in denen eine Haftungsbeschränkung gesetzlich unzulässig ist. Im Übrigen ist die Haftung im gesetzlich zulässigen Umfang auf unmittelbare, bei Vertragsschluss vorhersehbare Schäden begrenzt. Für Datenverlust haftet SwissCompact nur in dem Umfang, in dem der Schaden auch bei angemessener kundenseitiger Mitwirkung und den vereinbarten Sicherungsmassnahmen eingetreten wäre. Die Haftung für entgangenen Gewinn und mittelbare Folgeschäden ist im gesetzlich zulässigen Umfang ausgeschlossen.

## 9. Datenschutz und Vertraulichkeit

Personendaten werden gemäss der jeweils veröffentlichten Datenschutzerklärung bearbeitet. Bearbeitet SwissCompact Personendaten im Auftrag des Kundenbetriebs, gilt zusätzlich die bestätigte Vereinbarung zur Auftragsbearbeitung. Beide Parteien behandeln als vertraulich bezeichnete oder erkennbar vertrauliche Informationen angemessen geschützt.

## 10. Dauer, Sperrung und Datenbezug

Der Portalzugang besteht für die Dauer der zugrunde liegenden Kundenbeziehung oder Berechtigung. Bei Beendigung stellt der Kundenbetrieb rechtzeitig sicher, dass benötigte Daten exportiert werden. Gesetzliche Aufbewahrungspflichten, Sicherungskopien und die Vereinbarung zur Auftragsbearbeitung bleiben vorbehalten.

## 11. Änderungen

Neue Fassungen werden versioniert und mit Gültigkeitsdatum veröffentlicht. Wesentliche Änderungen werden im Portal angezeigt und, soweit erforderlich, vor der weiteren Nutzung bestätigt. Bereits entstandene Ansprüche und zwingende Rechte werden dadurch nicht rückwirkend eingeschränkt.

## 12. Recht und Gerichtsstand

Es gilt schweizerisches Recht unter Ausschluss des Kollisionsrechts und des UN-Kaufrechts. Ausschliesslicher Gerichtsstand ist Bern, Schweiz, soweit kein zwingender gesetzlicher Gerichtsstand gilt.

## 13. Kontakt

Fragen zu diesen Bedingungen: kontakt@swisscompact.com oder SwissCompact, Marcel Spahr, Schwarzenburgstrasse 65, 3008 Bern, Schweiz.$legal$
        and requires_acceptance = true
    ) then
      raise exception 'Die bereits veröffentlichte Version 1.0 von terms weicht von der geprüften Fassung ab';
    end if;
    return;
  end if;

  if target_status = 'superseded' then
    raise exception 'Version 1.0 von terms wurde bereits ersetzt; eine neue Version ist erforderlich';
  end if;

  if target_id is null then
    insert into swisscompact.legal_documents (
      document_type, acceptance_scope, version, title, summary, content_markdown,
      requires_acceptance, status, effective_at, published_at
    ) values (
      'terms', 'user', '1.0', $legal$Nutzungsbedingungen Kundenportal$legal$,
      $legal$Regelt den sicheren und verbindlichen Zugang zum SwissCompact-Kundenportal.$legal$, $legal$# Nutzungsbedingungen Kundenportal

Version 1.0 · gültig ab 2. September 2026

## 1. Anbieter und Geltungsbereich

Das SwissCompact-Kundenportal wird von Marcel Spahr, handelnd unter SwissCompact, Schwarzenburgstrasse 65, 3008 Bern, Schweiz, kontakt@swisscompact.com (nachfolgend „SwissCompact“) bereitgestellt. Das Portal richtet sich ausschliesslich an Unternehmen und andere Organisationen. Portalbenutzer handeln für den im Portal bezeichneten Kundenbetrieb.

Diese Nutzungsbedingungen regeln den Zugang zum Portal und dessen digitale Funktionen. Für Umfang, Preise, Termine und besondere Leistungen gilt vorrangig die individuell angenommene Offerte oder Vereinbarung. Eine Vereinbarung zur Auftragsbearbeitung und eine besondere Support- oder Servicevereinbarung gehen diesen Bedingungen für ihren jeweiligen Gegenstand vor.

## 2. Zugang und Berechtigungen

Zugänge sind persönlich und dürfen nicht geteilt werden. Benutzer müssen Zugangsdaten, Authenticator-Codes, Passkeys und Wiederherstellungsmittel geheim halten und ihre Geräte angemessen schützen. Verdächtige Zugriffe, verlorene Geräte oder ein Rollenwechsel sind SwissCompact unverzüglich zu melden.

Inhaber und Administratoren des Kundenbetriebs verwalten betriebliche Freigaben und tragen dafür Sorge, dass nur berechtigte Personen Zugang erhalten. Handlungen eines angemeldeten Benutzers werden dem Kundenbetrieb zugerechnet, soweit SwissCompact nicht erkennen musste, dass die Person unberechtigt handelte.

## 3. Funktionen und Mitwirkung

Das Portal kann insbesondere Projektakten, Offerten, Rechnungen, Freigaben, Medien, Kampagnen, Displays, Partnerverbindungen, Support und Datenexporte bereitstellen. Der konkrete Funktionsumfang richtet sich nach dem gebuchten Paket und der individuellen Vereinbarung.

Der Kundenbetrieb prüft Eingaben, Empfänger, Zeiträume, Bildschirmzuordnungen, Vorschauen und Freigaben vor einer verbindlichen Aktion. Er stellt vollständige und richtige Angaben bereit und meldet erkennbare Fehler zeitnah. Hardware darf nur entsprechend der Anleitung und ohne Umgehung von Schutzmechanismen betrieben werden.

## 4. Inhalte und Rechte

Der Kundenbetrieb behält seine Rechte an hochgeladenen Inhalten. Er räumt SwissCompact für Vertragsdauer die zur Speicherung, technischen Bearbeitung, Darstellung, Auslieferung, Sicherung und Fehleranalyse erforderlichen Rechte ein. Der Kundenbetrieb sichert zu, dass er über alle erforderlichen Rechte und Einwilligungen verfügt und die Inhalte keine Rechte Dritter oder gesetzlichen Vorgaben verletzen.

Unzulässig sind insbesondere rechtswidrige, täuschende, diskriminierende, gewaltverherrlichende oder schädliche Inhalte, Schadsoftware, unbefugte Zugriffsversuche sowie die Umgehung technischer Schutz- oder Nutzungslimiten. SwissCompact darf betroffene Inhalte oder Zugänge vorläufig sperren, soweit dies zum Schutz von Personen, Systemen oder Dritten erforderlich ist, und informiert den Kundenbetrieb soweit zulässig.

## 5. KI-Funktionen

KI-Funktionen können Vorschläge, Bilder oder Supportantworten erzeugen. Ergebnisse können unvollständig oder fehlerhaft sein und ersetzen keine fachliche, rechtliche, medizinische, finanzielle oder sicherheitstechnische Prüfung. Der Kundenbetrieb prüft KI-Ergebnisse vor jeder Veröffentlichung oder geschäftlichen Verwendung.

Passwörter, API-Schlüssel, Zahlungsdaten, besonders schützenswerte Personendaten und andere nicht erforderliche Geheimnisse dürfen nicht in KI-Eingaben aufgenommen werden. Für Supportanhänge wird eine KI-Analyse nur nach ausdrücklicher Freigabe verwendet. Verbindliche Vertrags-, Zahlungs-, Lösch- oder Sicherheitsentscheidungen werden nicht allein durch die KI getroffen.

## 6. Betrieb, Wartung und Support

SwissCompact betreibt das Portal mit angemessener Sorgfalt. Wartungen, Sicherheitsmassnahmen, Störungen von Telekommunikationsnetzen und Ausfälle externer Anbieter können die Verfügbarkeit vorübergehend einschränken. Eine unterbrechungsfreie Verfügbarkeit ist nur geschuldet, wenn sie ausdrücklich schriftlich vereinbart wurde.

Supportziele bezeichnen die angestrebte Zeit bis zur ersten persönlichen Reaktion und keine garantierte Lösungszeit. Kritische Vorfälle können direkt an das Supportteam eskaliert werden. Kunden müssen zumutbare Angaben zur Eingrenzung einer Störung bereitstellen.

## 7. Vergütung und Abonnemente

Preise, Zahlungsplan, Mindestlaufzeit, Verlängerung und Kündigung richten sich nach der angenommenen Offerte oder Paketvereinbarung. Soweit dort nichts anderes steht, sind Rechnungen innerhalb der ausgewiesenen Frist zahlbar. Bei Zahlungsverzug oder erheblichem Vertragsverstoss kann SwissCompact betroffene entgeltliche Funktionen nach vorheriger Mahnung angemessen einschränken; zwingende Zugriffs- und Herausgaberechte bleiben vorbehalten.

Separat erworbene KI-Guthaben sind nutzungsbezogene Vorauszahlungen. Eine Barauszahlung oder Übertragung ist ausgeschlossen, soweit die individuelle Vereinbarung nichts anderes bestimmt oder zwingendes Recht entgegensteht.

## 8. Gewährleistung und Haftung

Mängel sind mit einer nachvollziehbaren Beschreibung unverzüglich zu melden. SwissCompact erhält eine angemessene Gelegenheit zur Prüfung und Nachbesserung. Für Leistungen Dritter gelten zusätzlich deren technische Grenzen, soweit diese transparent Bestandteil der vereinbarten Lösung sind.

SwissCompact haftet unbeschränkt für vorsätzlich oder grobfahrlässig verursachte Schäden sowie in Fällen, in denen eine Haftungsbeschränkung gesetzlich unzulässig ist. Im Übrigen ist die Haftung im gesetzlich zulässigen Umfang auf unmittelbare, bei Vertragsschluss vorhersehbare Schäden begrenzt. Für Datenverlust haftet SwissCompact nur in dem Umfang, in dem der Schaden auch bei angemessener kundenseitiger Mitwirkung und den vereinbarten Sicherungsmassnahmen eingetreten wäre. Die Haftung für entgangenen Gewinn und mittelbare Folgeschäden ist im gesetzlich zulässigen Umfang ausgeschlossen.

## 9. Datenschutz und Vertraulichkeit

Personendaten werden gemäss der jeweils veröffentlichten Datenschutzerklärung bearbeitet. Bearbeitet SwissCompact Personendaten im Auftrag des Kundenbetriebs, gilt zusätzlich die bestätigte Vereinbarung zur Auftragsbearbeitung. Beide Parteien behandeln als vertraulich bezeichnete oder erkennbar vertrauliche Informationen angemessen geschützt.

## 10. Dauer, Sperrung und Datenbezug

Der Portalzugang besteht für die Dauer der zugrunde liegenden Kundenbeziehung oder Berechtigung. Bei Beendigung stellt der Kundenbetrieb rechtzeitig sicher, dass benötigte Daten exportiert werden. Gesetzliche Aufbewahrungspflichten, Sicherungskopien und die Vereinbarung zur Auftragsbearbeitung bleiben vorbehalten.

## 11. Änderungen

Neue Fassungen werden versioniert und mit Gültigkeitsdatum veröffentlicht. Wesentliche Änderungen werden im Portal angezeigt und, soweit erforderlich, vor der weiteren Nutzung bestätigt. Bereits entstandene Ansprüche und zwingende Rechte werden dadurch nicht rückwirkend eingeschränkt.

## 12. Recht und Gerichtsstand

Es gilt schweizerisches Recht unter Ausschluss des Kollisionsrechts und des UN-Kaufrechts. Ausschliesslicher Gerichtsstand ist Bern, Schweiz, soweit kein zwingender gesetzlicher Gerichtsstand gilt.

## 13. Kontakt

Fragen zu diesen Bedingungen: kontakt@swisscompact.com oder SwissCompact, Marcel Spahr, Schwarzenburgstrasse 65, 3008 Bern, Schweiz.$legal$, true,
      'draft', '2026-09-02 00:00:00+02'::timestamptz, null
    ) returning id into target_id;
  else
    update swisscompact.legal_documents
    set acceptance_scope = 'user',
        title = $legal$Nutzungsbedingungen Kundenportal$legal$,
        summary = $legal$Regelt den sicheren und verbindlichen Zugang zum SwissCompact-Kundenportal.$legal$,
        content_markdown = $legal$# Nutzungsbedingungen Kundenportal

Version 1.0 · gültig ab 2. September 2026

## 1. Anbieter und Geltungsbereich

Das SwissCompact-Kundenportal wird von Marcel Spahr, handelnd unter SwissCompact, Schwarzenburgstrasse 65, 3008 Bern, Schweiz, kontakt@swisscompact.com (nachfolgend „SwissCompact“) bereitgestellt. Das Portal richtet sich ausschliesslich an Unternehmen und andere Organisationen. Portalbenutzer handeln für den im Portal bezeichneten Kundenbetrieb.

Diese Nutzungsbedingungen regeln den Zugang zum Portal und dessen digitale Funktionen. Für Umfang, Preise, Termine und besondere Leistungen gilt vorrangig die individuell angenommene Offerte oder Vereinbarung. Eine Vereinbarung zur Auftragsbearbeitung und eine besondere Support- oder Servicevereinbarung gehen diesen Bedingungen für ihren jeweiligen Gegenstand vor.

## 2. Zugang und Berechtigungen

Zugänge sind persönlich und dürfen nicht geteilt werden. Benutzer müssen Zugangsdaten, Authenticator-Codes, Passkeys und Wiederherstellungsmittel geheim halten und ihre Geräte angemessen schützen. Verdächtige Zugriffe, verlorene Geräte oder ein Rollenwechsel sind SwissCompact unverzüglich zu melden.

Inhaber und Administratoren des Kundenbetriebs verwalten betriebliche Freigaben und tragen dafür Sorge, dass nur berechtigte Personen Zugang erhalten. Handlungen eines angemeldeten Benutzers werden dem Kundenbetrieb zugerechnet, soweit SwissCompact nicht erkennen musste, dass die Person unberechtigt handelte.

## 3. Funktionen und Mitwirkung

Das Portal kann insbesondere Projektakten, Offerten, Rechnungen, Freigaben, Medien, Kampagnen, Displays, Partnerverbindungen, Support und Datenexporte bereitstellen. Der konkrete Funktionsumfang richtet sich nach dem gebuchten Paket und der individuellen Vereinbarung.

Der Kundenbetrieb prüft Eingaben, Empfänger, Zeiträume, Bildschirmzuordnungen, Vorschauen und Freigaben vor einer verbindlichen Aktion. Er stellt vollständige und richtige Angaben bereit und meldet erkennbare Fehler zeitnah. Hardware darf nur entsprechend der Anleitung und ohne Umgehung von Schutzmechanismen betrieben werden.

## 4. Inhalte und Rechte

Der Kundenbetrieb behält seine Rechte an hochgeladenen Inhalten. Er räumt SwissCompact für Vertragsdauer die zur Speicherung, technischen Bearbeitung, Darstellung, Auslieferung, Sicherung und Fehleranalyse erforderlichen Rechte ein. Der Kundenbetrieb sichert zu, dass er über alle erforderlichen Rechte und Einwilligungen verfügt und die Inhalte keine Rechte Dritter oder gesetzlichen Vorgaben verletzen.

Unzulässig sind insbesondere rechtswidrige, täuschende, diskriminierende, gewaltverherrlichende oder schädliche Inhalte, Schadsoftware, unbefugte Zugriffsversuche sowie die Umgehung technischer Schutz- oder Nutzungslimiten. SwissCompact darf betroffene Inhalte oder Zugänge vorläufig sperren, soweit dies zum Schutz von Personen, Systemen oder Dritten erforderlich ist, und informiert den Kundenbetrieb soweit zulässig.

## 5. KI-Funktionen

KI-Funktionen können Vorschläge, Bilder oder Supportantworten erzeugen. Ergebnisse können unvollständig oder fehlerhaft sein und ersetzen keine fachliche, rechtliche, medizinische, finanzielle oder sicherheitstechnische Prüfung. Der Kundenbetrieb prüft KI-Ergebnisse vor jeder Veröffentlichung oder geschäftlichen Verwendung.

Passwörter, API-Schlüssel, Zahlungsdaten, besonders schützenswerte Personendaten und andere nicht erforderliche Geheimnisse dürfen nicht in KI-Eingaben aufgenommen werden. Für Supportanhänge wird eine KI-Analyse nur nach ausdrücklicher Freigabe verwendet. Verbindliche Vertrags-, Zahlungs-, Lösch- oder Sicherheitsentscheidungen werden nicht allein durch die KI getroffen.

## 6. Betrieb, Wartung und Support

SwissCompact betreibt das Portal mit angemessener Sorgfalt. Wartungen, Sicherheitsmassnahmen, Störungen von Telekommunikationsnetzen und Ausfälle externer Anbieter können die Verfügbarkeit vorübergehend einschränken. Eine unterbrechungsfreie Verfügbarkeit ist nur geschuldet, wenn sie ausdrücklich schriftlich vereinbart wurde.

Supportziele bezeichnen die angestrebte Zeit bis zur ersten persönlichen Reaktion und keine garantierte Lösungszeit. Kritische Vorfälle können direkt an das Supportteam eskaliert werden. Kunden müssen zumutbare Angaben zur Eingrenzung einer Störung bereitstellen.

## 7. Vergütung und Abonnemente

Preise, Zahlungsplan, Mindestlaufzeit, Verlängerung und Kündigung richten sich nach der angenommenen Offerte oder Paketvereinbarung. Soweit dort nichts anderes steht, sind Rechnungen innerhalb der ausgewiesenen Frist zahlbar. Bei Zahlungsverzug oder erheblichem Vertragsverstoss kann SwissCompact betroffene entgeltliche Funktionen nach vorheriger Mahnung angemessen einschränken; zwingende Zugriffs- und Herausgaberechte bleiben vorbehalten.

Separat erworbene KI-Guthaben sind nutzungsbezogene Vorauszahlungen. Eine Barauszahlung oder Übertragung ist ausgeschlossen, soweit die individuelle Vereinbarung nichts anderes bestimmt oder zwingendes Recht entgegensteht.

## 8. Gewährleistung und Haftung

Mängel sind mit einer nachvollziehbaren Beschreibung unverzüglich zu melden. SwissCompact erhält eine angemessene Gelegenheit zur Prüfung und Nachbesserung. Für Leistungen Dritter gelten zusätzlich deren technische Grenzen, soweit diese transparent Bestandteil der vereinbarten Lösung sind.

SwissCompact haftet unbeschränkt für vorsätzlich oder grobfahrlässig verursachte Schäden sowie in Fällen, in denen eine Haftungsbeschränkung gesetzlich unzulässig ist. Im Übrigen ist die Haftung im gesetzlich zulässigen Umfang auf unmittelbare, bei Vertragsschluss vorhersehbare Schäden begrenzt. Für Datenverlust haftet SwissCompact nur in dem Umfang, in dem der Schaden auch bei angemessener kundenseitiger Mitwirkung und den vereinbarten Sicherungsmassnahmen eingetreten wäre. Die Haftung für entgangenen Gewinn und mittelbare Folgeschäden ist im gesetzlich zulässigen Umfang ausgeschlossen.

## 9. Datenschutz und Vertraulichkeit

Personendaten werden gemäss der jeweils veröffentlichten Datenschutzerklärung bearbeitet. Bearbeitet SwissCompact Personendaten im Auftrag des Kundenbetriebs, gilt zusätzlich die bestätigte Vereinbarung zur Auftragsbearbeitung. Beide Parteien behandeln als vertraulich bezeichnete oder erkennbar vertrauliche Informationen angemessen geschützt.

## 10. Dauer, Sperrung und Datenbezug

Der Portalzugang besteht für die Dauer der zugrunde liegenden Kundenbeziehung oder Berechtigung. Bei Beendigung stellt der Kundenbetrieb rechtzeitig sicher, dass benötigte Daten exportiert werden. Gesetzliche Aufbewahrungspflichten, Sicherungskopien und die Vereinbarung zur Auftragsbearbeitung bleiben vorbehalten.

## 11. Änderungen

Neue Fassungen werden versioniert und mit Gültigkeitsdatum veröffentlicht. Wesentliche Änderungen werden im Portal angezeigt und, soweit erforderlich, vor der weiteren Nutzung bestätigt. Bereits entstandene Ansprüche und zwingende Rechte werden dadurch nicht rückwirkend eingeschränkt.

## 12. Recht und Gerichtsstand

Es gilt schweizerisches Recht unter Ausschluss des Kollisionsrechts und des UN-Kaufrechts. Ausschliesslicher Gerichtsstand ist Bern, Schweiz, soweit kein zwingender gesetzlicher Gerichtsstand gilt.

## 13. Kontakt

Fragen zu diesen Bedingungen: kontakt@swisscompact.com oder SwissCompact, Marcel Spahr, Schwarzenburgstrasse 65, 3008 Bern, Schweiz.$legal$,
        requires_acceptance = true,
        effective_at = '2026-09-02 00:00:00+02'::timestamptz
    where id = target_id and status = 'draft';
  end if;

  update swisscompact.legal_documents
  set status = 'superseded'
  where document_type = 'terms'
    and status = 'published'
    and id <> target_id;

  update swisscompact.legal_documents
  set status = 'published',
      effective_at = '2026-09-02 00:00:00+02'::timestamptz,
      published_at = now()
  where id = target_id and status = 'draft';
end;
$$;

do $$
declare
  target_id uuid;
  target_status text;
begin
  select id, status into target_id, target_status
  from swisscompact.legal_documents
  where document_type = 'privacy' and version = '1.0';

  if target_status = 'published' then
    if not exists (
      select 1 from swisscompact.legal_documents
      where id = target_id
        and acceptance_scope = 'user'
        and title = $legal$Datenschutzerklärung$legal$
        and summary = $legal$Informiert transparent über die Bearbeitung personenbezogener Daten durch SwissCompact.$legal$
        and content_markdown = $legal$# Datenschutzerklärung

Version 1.0 · gültig ab 2. September 2026

## 1. Verantwortlicher

Verantwortlich für die hier beschriebene Bearbeitung ist Marcel Spahr, handelnd unter SwissCompact, Schwarzenburgstrasse 65, 3008 Bern, Schweiz. Datenschutzanfragen können an kontakt@swisscompact.com gerichtet werden.

Diese Erklärung gilt für swisscompact.com, den Verkaufsassistenten und Showroom, persönliche Offertenlinks, das Kundenportal, Supportfunktionen und das interne SwissCompact-Dashboard. Bearbeitet SwissCompact Daten ausschliesslich im Auftrag eines Kundenbetriebs, ist der Kundenbetrieb Verantwortlicher und die Vereinbarung zur Auftragsbearbeitung gilt ergänzend.

## 2. Bearbeitete Daten

Je nach Nutzung bearbeiten wir:

- Stamm- und Kontaktdaten wie Name, Unternehmen, Funktion, Anschrift, E-Mail und Telefon;
- Konto-, Rollen- und Sicherheitsdaten wie Benutzer-ID, Anmeldestatus, Passkey- oder MFA-Metadaten und sicherheitsrelevante Protokolle, jedoch keine lesbaren Passwörter;
- Vertrags-, Offerten-, Rechnungs-, Zahlungs- und Abonnementdaten;
- Projekt-, Freigabe-, Kampagnen-, Medien-, Display- und Partnernetzwerkdaten;
- Nachrichten, Supportfälle, Feedback und freiwillig hochgeladene Anhänge;
- technische Daten wie Zeitpunkt, IP-Adresse oder daraus gebildete Sicherheitsmerkmale, Browser-, Geräte-, Sitzungs-, Fehler- und Zugriffsprotokolle;
- Eingaben und Ergebnisse von KI-Funktionen, wenn eine solche Funktion verwendet wird.

Wir erhalten Daten direkt von Benutzern, vom Kundenbetrieb, aus der Nutzung unserer Systeme, von eingebundenen Dienstleistern und – soweit zulässig – aus öffentlich zugänglichen Quellen.

## 3. Zwecke

Wir bearbeiten Personendaten, um Anfragen zu beantworten, Offerten und Verträge anzubahnen und abzuwickeln, Zugänge zu authentifizieren, Rollen und Freigaben durchzusetzen, vereinbarte Leistungen bereitzustellen, Inhalte auszuliefern, Zahlungen abzuwickeln, Support zu leisten, Missbrauch und Sicherheitsvorfälle zu erkennen, Daten zu sichern und wiederherzustellen, gesetzliche Pflichten zu erfüllen sowie Rechte geltend zu machen oder abzuwehren.

Soweit eine Einwilligung erforderlich ist, kann sie mit Wirkung für die Zukunft widerrufen werden. Vertragsnotwendige, gesetzlich vorgeschriebene oder überwiegenden berechtigten Interessen dienende Bearbeitungen bleiben davon unberührt.

## 4. Website, Cookies und lokale Speicherung

Die Website und Portale verwenden technisch notwendige Sitzungsmechanismen. Geschützte Sitzungen werden insbesondere mit sicheren HttpOnly-Cookies geführt. Der Display-Player kann für seine Kopplung und Konfiguration lokale Browserspeicherung verwenden. Wir setzen derzeit keine Werbe- oder verhaltensübergreifenden Tracking-Cookies ein. Falls solche Technologien später eingeführt werden, aktualisieren wir diese Erklärung und holen eine erforderliche Auswahl vor deren Aktivierung ein.

## 5. KI-Funktionen

Bei ausdrücklich genutzten KI-Funktionen werden die dafür notwendigen Eingaben und der relevante Kontext an OpenAI übermittelt. Supportanhänge werden nur dann für eine KI-Analyse verwendet, wenn der Benutzer dies ausdrücklich erlaubt. KI-Antworten werden als solche gekennzeichnet und können an einen Menschen eskaliert werden. SwissCompact trifft keine Entscheidung mit rechtlicher oder ähnlich erheblicher Wirkung ausschliesslich automatisiert.

Bitte übermitteln Sie keine Passwörter, API-Schlüssel, Zahlungsdaten oder nicht erforderliche besonders schützenswerte Personendaten in Freitexten oder Anhängen.

## 6. Empfänger und Auftragsbearbeiter

Wir geben Daten nur weiter, soweit dies für die genannten Zwecke erforderlich ist, eine gesetzliche Pflicht besteht oder eine gültige Einwilligung vorliegt. Aktuell eingesetzte Hauptanbieter sind:

- Supabase, Inc. für Datenbank, Authentifizierung und privaten Dateispeicher;
- Vercel, Inc. für Hosting, Auslieferung und serverseitige Funktionen;
- OpenAI Ireland Ltd. und verbundene Unterauftragnehmer für ausdrücklich genutzte KI-Funktionen;
- Mux, Inc. für Videoverarbeitung und -auslieferung;
- Stripe Payments Europe, Ltd. und verbundene Unternehmen für Zahlungen;
- Plus Five Five, Inc. (Resend) für den E-Mail-Versand.

Daneben können berufliche Berater, Behörden, Gerichte sowie sorgfältig ausgewählte technische Dienstleister Daten erhalten, wenn dies erforderlich und zulässig ist. Zahlungsanbieter bearbeiten bestimmte Daten in eigener Verantwortlichkeit nach ihren eigenen Datenschutzhinweisen.

## 7. Bearbeitung im Ausland

Die genannten Anbieter und ihre veröffentlichten Unterauftragnehmer können Daten in der Schweiz, im Europäischen Wirtschaftsraum, im Vereinigten Königreich, in den USA sowie – je nach genutzter Teilfunktion – in Kanada, Japan, Singapur, Indien, Australien oder Brasilien bearbeiten. Der primäre Speicherort von Projektdaten richtet sich zusätzlich nach der für das Supabase-Projekt gewählten Region.

Bei einer Übermittlung in einen Staat ohne anerkannt angemessenes Datenschutzniveau verwenden wir geeignete Garantien, insbesondere anwendbare Standardvertragsklauseln mit schweizerischen Anpassungen, oder stützen uns auf eine gesetzliche Ausnahme. Aktuelle Unterauftragnehmerlisten sind bei den jeweiligen Anbietern veröffentlicht und können bei SwissCompact angefragt werden.

## 8. Aufbewahrung

Wir bewahren Daten nur so lange auf, wie es für den jeweiligen Zweck, die Vertragsbeziehung, Sicherheit, Nachweisführung und gesetzliche Pflichten erforderlich ist. Vertrags- und Buchungsunterlagen werden in der Regel zehn Jahre aufbewahrt. Sicherheits-, Betriebs- und Supportdaten werden nach Erledigung regelmässig überprüft und gelöscht oder anonymisiert, sofern sie nicht weiterhin für die Kundenbeziehung, Gewährleistung, Rechtsansprüche oder Vorfallsaufklärung benötigt werden. Sicherungskopien werden nach dem jeweiligen Sicherungszyklus überschrieben; eine sofortige selektive Löschung aus jeder Sicherung ist technisch nicht immer möglich.

## 9. Datensicherheit

Wir setzen angemessene technische und organisatorische Massnahmen ein. Dazu gehören verschlüsselte Übertragung, rollenbasierte Zugriffe, Mandantentrennung, serverseitig geschützte Schlüssel, Mehrfaktor- beziehungsweise Passkey-Optionen, Protokollierung, private Speicherbereiche, Sicherungen und kontrollierte Wiederherstellungstests. Kein System kann absolute Sicherheit garantieren.

## 10. Rechte betroffener Personen

Betroffene Personen können im Rahmen des anwendbaren Rechts Auskunft, Berichtigung, Herausgabe oder Übertragung, Löschung und Einschränkung verlangen sowie einer Bearbeitung widersprechen oder eine Einwilligung widerrufen. Im Kundenportal stehen dafür Export- und Antragsfunktionen zur Verfügung. Anfragen können auch an kontakt@swisscompact.com gerichtet werden. Zur Verhinderung unbefugter Herausgabe kann ein Identitätsnachweis verlangt werden.

Betroffene Personen können sich zudem an den Eidgenössischen Datenschutz- und Öffentlichkeitsbeauftragten (EDÖB) wenden.

## 11. Datenschutzverletzungen

Wir untersuchen Sicherheitsvorfälle und informieren betroffene Kundenbetriebe, Personen und Behörden nach Massgabe der gesetzlichen Pflichten. Kundenbetriebe melden vermutete Vorfälle unverzüglich über das Supportcenter oder an kontakt@swisscompact.com.

## 12. Änderungen

Wir aktualisieren diese Erklärung, wenn sich Bearbeitungen oder Rechtsanforderungen ändern. Die aktuelle Fassung ist öffentlich auf swisscompact.com/rechtliches.html abrufbar; verbindliche Portalversionen werden zusätzlich versioniert und unveränderbar protokolliert.$legal$
        and requires_acceptance = false
    ) then
      raise exception 'Die bereits veröffentlichte Version 1.0 von privacy weicht von der geprüften Fassung ab';
    end if;
    return;
  end if;

  if target_status = 'superseded' then
    raise exception 'Version 1.0 von privacy wurde bereits ersetzt; eine neue Version ist erforderlich';
  end if;

  if target_id is null then
    insert into swisscompact.legal_documents (
      document_type, acceptance_scope, version, title, summary, content_markdown,
      requires_acceptance, status, effective_at, published_at
    ) values (
      'privacy', 'user', '1.0', $legal$Datenschutzerklärung$legal$,
      $legal$Informiert transparent über die Bearbeitung personenbezogener Daten durch SwissCompact.$legal$, $legal$# Datenschutzerklärung

Version 1.0 · gültig ab 2. September 2026

## 1. Verantwortlicher

Verantwortlich für die hier beschriebene Bearbeitung ist Marcel Spahr, handelnd unter SwissCompact, Schwarzenburgstrasse 65, 3008 Bern, Schweiz. Datenschutzanfragen können an kontakt@swisscompact.com gerichtet werden.

Diese Erklärung gilt für swisscompact.com, den Verkaufsassistenten und Showroom, persönliche Offertenlinks, das Kundenportal, Supportfunktionen und das interne SwissCompact-Dashboard. Bearbeitet SwissCompact Daten ausschliesslich im Auftrag eines Kundenbetriebs, ist der Kundenbetrieb Verantwortlicher und die Vereinbarung zur Auftragsbearbeitung gilt ergänzend.

## 2. Bearbeitete Daten

Je nach Nutzung bearbeiten wir:

- Stamm- und Kontaktdaten wie Name, Unternehmen, Funktion, Anschrift, E-Mail und Telefon;
- Konto-, Rollen- und Sicherheitsdaten wie Benutzer-ID, Anmeldestatus, Passkey- oder MFA-Metadaten und sicherheitsrelevante Protokolle, jedoch keine lesbaren Passwörter;
- Vertrags-, Offerten-, Rechnungs-, Zahlungs- und Abonnementdaten;
- Projekt-, Freigabe-, Kampagnen-, Medien-, Display- und Partnernetzwerkdaten;
- Nachrichten, Supportfälle, Feedback und freiwillig hochgeladene Anhänge;
- technische Daten wie Zeitpunkt, IP-Adresse oder daraus gebildete Sicherheitsmerkmale, Browser-, Geräte-, Sitzungs-, Fehler- und Zugriffsprotokolle;
- Eingaben und Ergebnisse von KI-Funktionen, wenn eine solche Funktion verwendet wird.

Wir erhalten Daten direkt von Benutzern, vom Kundenbetrieb, aus der Nutzung unserer Systeme, von eingebundenen Dienstleistern und – soweit zulässig – aus öffentlich zugänglichen Quellen.

## 3. Zwecke

Wir bearbeiten Personendaten, um Anfragen zu beantworten, Offerten und Verträge anzubahnen und abzuwickeln, Zugänge zu authentifizieren, Rollen und Freigaben durchzusetzen, vereinbarte Leistungen bereitzustellen, Inhalte auszuliefern, Zahlungen abzuwickeln, Support zu leisten, Missbrauch und Sicherheitsvorfälle zu erkennen, Daten zu sichern und wiederherzustellen, gesetzliche Pflichten zu erfüllen sowie Rechte geltend zu machen oder abzuwehren.

Soweit eine Einwilligung erforderlich ist, kann sie mit Wirkung für die Zukunft widerrufen werden. Vertragsnotwendige, gesetzlich vorgeschriebene oder überwiegenden berechtigten Interessen dienende Bearbeitungen bleiben davon unberührt.

## 4. Website, Cookies und lokale Speicherung

Die Website und Portale verwenden technisch notwendige Sitzungsmechanismen. Geschützte Sitzungen werden insbesondere mit sicheren HttpOnly-Cookies geführt. Der Display-Player kann für seine Kopplung und Konfiguration lokale Browserspeicherung verwenden. Wir setzen derzeit keine Werbe- oder verhaltensübergreifenden Tracking-Cookies ein. Falls solche Technologien später eingeführt werden, aktualisieren wir diese Erklärung und holen eine erforderliche Auswahl vor deren Aktivierung ein.

## 5. KI-Funktionen

Bei ausdrücklich genutzten KI-Funktionen werden die dafür notwendigen Eingaben und der relevante Kontext an OpenAI übermittelt. Supportanhänge werden nur dann für eine KI-Analyse verwendet, wenn der Benutzer dies ausdrücklich erlaubt. KI-Antworten werden als solche gekennzeichnet und können an einen Menschen eskaliert werden. SwissCompact trifft keine Entscheidung mit rechtlicher oder ähnlich erheblicher Wirkung ausschliesslich automatisiert.

Bitte übermitteln Sie keine Passwörter, API-Schlüssel, Zahlungsdaten oder nicht erforderliche besonders schützenswerte Personendaten in Freitexten oder Anhängen.

## 6. Empfänger und Auftragsbearbeiter

Wir geben Daten nur weiter, soweit dies für die genannten Zwecke erforderlich ist, eine gesetzliche Pflicht besteht oder eine gültige Einwilligung vorliegt. Aktuell eingesetzte Hauptanbieter sind:

- Supabase, Inc. für Datenbank, Authentifizierung und privaten Dateispeicher;
- Vercel, Inc. für Hosting, Auslieferung und serverseitige Funktionen;
- OpenAI Ireland Ltd. und verbundene Unterauftragnehmer für ausdrücklich genutzte KI-Funktionen;
- Mux, Inc. für Videoverarbeitung und -auslieferung;
- Stripe Payments Europe, Ltd. und verbundene Unternehmen für Zahlungen;
- Plus Five Five, Inc. (Resend) für den E-Mail-Versand.

Daneben können berufliche Berater, Behörden, Gerichte sowie sorgfältig ausgewählte technische Dienstleister Daten erhalten, wenn dies erforderlich und zulässig ist. Zahlungsanbieter bearbeiten bestimmte Daten in eigener Verantwortlichkeit nach ihren eigenen Datenschutzhinweisen.

## 7. Bearbeitung im Ausland

Die genannten Anbieter und ihre veröffentlichten Unterauftragnehmer können Daten in der Schweiz, im Europäischen Wirtschaftsraum, im Vereinigten Königreich, in den USA sowie – je nach genutzter Teilfunktion – in Kanada, Japan, Singapur, Indien, Australien oder Brasilien bearbeiten. Der primäre Speicherort von Projektdaten richtet sich zusätzlich nach der für das Supabase-Projekt gewählten Region.

Bei einer Übermittlung in einen Staat ohne anerkannt angemessenes Datenschutzniveau verwenden wir geeignete Garantien, insbesondere anwendbare Standardvertragsklauseln mit schweizerischen Anpassungen, oder stützen uns auf eine gesetzliche Ausnahme. Aktuelle Unterauftragnehmerlisten sind bei den jeweiligen Anbietern veröffentlicht und können bei SwissCompact angefragt werden.

## 8. Aufbewahrung

Wir bewahren Daten nur so lange auf, wie es für den jeweiligen Zweck, die Vertragsbeziehung, Sicherheit, Nachweisführung und gesetzliche Pflichten erforderlich ist. Vertrags- und Buchungsunterlagen werden in der Regel zehn Jahre aufbewahrt. Sicherheits-, Betriebs- und Supportdaten werden nach Erledigung regelmässig überprüft und gelöscht oder anonymisiert, sofern sie nicht weiterhin für die Kundenbeziehung, Gewährleistung, Rechtsansprüche oder Vorfallsaufklärung benötigt werden. Sicherungskopien werden nach dem jeweiligen Sicherungszyklus überschrieben; eine sofortige selektive Löschung aus jeder Sicherung ist technisch nicht immer möglich.

## 9. Datensicherheit

Wir setzen angemessene technische und organisatorische Massnahmen ein. Dazu gehören verschlüsselte Übertragung, rollenbasierte Zugriffe, Mandantentrennung, serverseitig geschützte Schlüssel, Mehrfaktor- beziehungsweise Passkey-Optionen, Protokollierung, private Speicherbereiche, Sicherungen und kontrollierte Wiederherstellungstests. Kein System kann absolute Sicherheit garantieren.

## 10. Rechte betroffener Personen

Betroffene Personen können im Rahmen des anwendbaren Rechts Auskunft, Berichtigung, Herausgabe oder Übertragung, Löschung und Einschränkung verlangen sowie einer Bearbeitung widersprechen oder eine Einwilligung widerrufen. Im Kundenportal stehen dafür Export- und Antragsfunktionen zur Verfügung. Anfragen können auch an kontakt@swisscompact.com gerichtet werden. Zur Verhinderung unbefugter Herausgabe kann ein Identitätsnachweis verlangt werden.

Betroffene Personen können sich zudem an den Eidgenössischen Datenschutz- und Öffentlichkeitsbeauftragten (EDÖB) wenden.

## 11. Datenschutzverletzungen

Wir untersuchen Sicherheitsvorfälle und informieren betroffene Kundenbetriebe, Personen und Behörden nach Massgabe der gesetzlichen Pflichten. Kundenbetriebe melden vermutete Vorfälle unverzüglich über das Supportcenter oder an kontakt@swisscompact.com.

## 12. Änderungen

Wir aktualisieren diese Erklärung, wenn sich Bearbeitungen oder Rechtsanforderungen ändern. Die aktuelle Fassung ist öffentlich auf swisscompact.com/rechtliches.html abrufbar; verbindliche Portalversionen werden zusätzlich versioniert und unveränderbar protokolliert.$legal$, false,
      'draft', '2026-09-02 00:00:00+02'::timestamptz, null
    ) returning id into target_id;
  else
    update swisscompact.legal_documents
    set acceptance_scope = 'user',
        title = $legal$Datenschutzerklärung$legal$,
        summary = $legal$Informiert transparent über die Bearbeitung personenbezogener Daten durch SwissCompact.$legal$,
        content_markdown = $legal$# Datenschutzerklärung

Version 1.0 · gültig ab 2. September 2026

## 1. Verantwortlicher

Verantwortlich für die hier beschriebene Bearbeitung ist Marcel Spahr, handelnd unter SwissCompact, Schwarzenburgstrasse 65, 3008 Bern, Schweiz. Datenschutzanfragen können an kontakt@swisscompact.com gerichtet werden.

Diese Erklärung gilt für swisscompact.com, den Verkaufsassistenten und Showroom, persönliche Offertenlinks, das Kundenportal, Supportfunktionen und das interne SwissCompact-Dashboard. Bearbeitet SwissCompact Daten ausschliesslich im Auftrag eines Kundenbetriebs, ist der Kundenbetrieb Verantwortlicher und die Vereinbarung zur Auftragsbearbeitung gilt ergänzend.

## 2. Bearbeitete Daten

Je nach Nutzung bearbeiten wir:

- Stamm- und Kontaktdaten wie Name, Unternehmen, Funktion, Anschrift, E-Mail und Telefon;
- Konto-, Rollen- und Sicherheitsdaten wie Benutzer-ID, Anmeldestatus, Passkey- oder MFA-Metadaten und sicherheitsrelevante Protokolle, jedoch keine lesbaren Passwörter;
- Vertrags-, Offerten-, Rechnungs-, Zahlungs- und Abonnementdaten;
- Projekt-, Freigabe-, Kampagnen-, Medien-, Display- und Partnernetzwerkdaten;
- Nachrichten, Supportfälle, Feedback und freiwillig hochgeladene Anhänge;
- technische Daten wie Zeitpunkt, IP-Adresse oder daraus gebildete Sicherheitsmerkmale, Browser-, Geräte-, Sitzungs-, Fehler- und Zugriffsprotokolle;
- Eingaben und Ergebnisse von KI-Funktionen, wenn eine solche Funktion verwendet wird.

Wir erhalten Daten direkt von Benutzern, vom Kundenbetrieb, aus der Nutzung unserer Systeme, von eingebundenen Dienstleistern und – soweit zulässig – aus öffentlich zugänglichen Quellen.

## 3. Zwecke

Wir bearbeiten Personendaten, um Anfragen zu beantworten, Offerten und Verträge anzubahnen und abzuwickeln, Zugänge zu authentifizieren, Rollen und Freigaben durchzusetzen, vereinbarte Leistungen bereitzustellen, Inhalte auszuliefern, Zahlungen abzuwickeln, Support zu leisten, Missbrauch und Sicherheitsvorfälle zu erkennen, Daten zu sichern und wiederherzustellen, gesetzliche Pflichten zu erfüllen sowie Rechte geltend zu machen oder abzuwehren.

Soweit eine Einwilligung erforderlich ist, kann sie mit Wirkung für die Zukunft widerrufen werden. Vertragsnotwendige, gesetzlich vorgeschriebene oder überwiegenden berechtigten Interessen dienende Bearbeitungen bleiben davon unberührt.

## 4. Website, Cookies und lokale Speicherung

Die Website und Portale verwenden technisch notwendige Sitzungsmechanismen. Geschützte Sitzungen werden insbesondere mit sicheren HttpOnly-Cookies geführt. Der Display-Player kann für seine Kopplung und Konfiguration lokale Browserspeicherung verwenden. Wir setzen derzeit keine Werbe- oder verhaltensübergreifenden Tracking-Cookies ein. Falls solche Technologien später eingeführt werden, aktualisieren wir diese Erklärung und holen eine erforderliche Auswahl vor deren Aktivierung ein.

## 5. KI-Funktionen

Bei ausdrücklich genutzten KI-Funktionen werden die dafür notwendigen Eingaben und der relevante Kontext an OpenAI übermittelt. Supportanhänge werden nur dann für eine KI-Analyse verwendet, wenn der Benutzer dies ausdrücklich erlaubt. KI-Antworten werden als solche gekennzeichnet und können an einen Menschen eskaliert werden. SwissCompact trifft keine Entscheidung mit rechtlicher oder ähnlich erheblicher Wirkung ausschliesslich automatisiert.

Bitte übermitteln Sie keine Passwörter, API-Schlüssel, Zahlungsdaten oder nicht erforderliche besonders schützenswerte Personendaten in Freitexten oder Anhängen.

## 6. Empfänger und Auftragsbearbeiter

Wir geben Daten nur weiter, soweit dies für die genannten Zwecke erforderlich ist, eine gesetzliche Pflicht besteht oder eine gültige Einwilligung vorliegt. Aktuell eingesetzte Hauptanbieter sind:

- Supabase, Inc. für Datenbank, Authentifizierung und privaten Dateispeicher;
- Vercel, Inc. für Hosting, Auslieferung und serverseitige Funktionen;
- OpenAI Ireland Ltd. und verbundene Unterauftragnehmer für ausdrücklich genutzte KI-Funktionen;
- Mux, Inc. für Videoverarbeitung und -auslieferung;
- Stripe Payments Europe, Ltd. und verbundene Unternehmen für Zahlungen;
- Plus Five Five, Inc. (Resend) für den E-Mail-Versand.

Daneben können berufliche Berater, Behörden, Gerichte sowie sorgfältig ausgewählte technische Dienstleister Daten erhalten, wenn dies erforderlich und zulässig ist. Zahlungsanbieter bearbeiten bestimmte Daten in eigener Verantwortlichkeit nach ihren eigenen Datenschutzhinweisen.

## 7. Bearbeitung im Ausland

Die genannten Anbieter und ihre veröffentlichten Unterauftragnehmer können Daten in der Schweiz, im Europäischen Wirtschaftsraum, im Vereinigten Königreich, in den USA sowie – je nach genutzter Teilfunktion – in Kanada, Japan, Singapur, Indien, Australien oder Brasilien bearbeiten. Der primäre Speicherort von Projektdaten richtet sich zusätzlich nach der für das Supabase-Projekt gewählten Region.

Bei einer Übermittlung in einen Staat ohne anerkannt angemessenes Datenschutzniveau verwenden wir geeignete Garantien, insbesondere anwendbare Standardvertragsklauseln mit schweizerischen Anpassungen, oder stützen uns auf eine gesetzliche Ausnahme. Aktuelle Unterauftragnehmerlisten sind bei den jeweiligen Anbietern veröffentlicht und können bei SwissCompact angefragt werden.

## 8. Aufbewahrung

Wir bewahren Daten nur so lange auf, wie es für den jeweiligen Zweck, die Vertragsbeziehung, Sicherheit, Nachweisführung und gesetzliche Pflichten erforderlich ist. Vertrags- und Buchungsunterlagen werden in der Regel zehn Jahre aufbewahrt. Sicherheits-, Betriebs- und Supportdaten werden nach Erledigung regelmässig überprüft und gelöscht oder anonymisiert, sofern sie nicht weiterhin für die Kundenbeziehung, Gewährleistung, Rechtsansprüche oder Vorfallsaufklärung benötigt werden. Sicherungskopien werden nach dem jeweiligen Sicherungszyklus überschrieben; eine sofortige selektive Löschung aus jeder Sicherung ist technisch nicht immer möglich.

## 9. Datensicherheit

Wir setzen angemessene technische und organisatorische Massnahmen ein. Dazu gehören verschlüsselte Übertragung, rollenbasierte Zugriffe, Mandantentrennung, serverseitig geschützte Schlüssel, Mehrfaktor- beziehungsweise Passkey-Optionen, Protokollierung, private Speicherbereiche, Sicherungen und kontrollierte Wiederherstellungstests. Kein System kann absolute Sicherheit garantieren.

## 10. Rechte betroffener Personen

Betroffene Personen können im Rahmen des anwendbaren Rechts Auskunft, Berichtigung, Herausgabe oder Übertragung, Löschung und Einschränkung verlangen sowie einer Bearbeitung widersprechen oder eine Einwilligung widerrufen. Im Kundenportal stehen dafür Export- und Antragsfunktionen zur Verfügung. Anfragen können auch an kontakt@swisscompact.com gerichtet werden. Zur Verhinderung unbefugter Herausgabe kann ein Identitätsnachweis verlangt werden.

Betroffene Personen können sich zudem an den Eidgenössischen Datenschutz- und Öffentlichkeitsbeauftragten (EDÖB) wenden.

## 11. Datenschutzverletzungen

Wir untersuchen Sicherheitsvorfälle und informieren betroffene Kundenbetriebe, Personen und Behörden nach Massgabe der gesetzlichen Pflichten. Kundenbetriebe melden vermutete Vorfälle unverzüglich über das Supportcenter oder an kontakt@swisscompact.com.

## 12. Änderungen

Wir aktualisieren diese Erklärung, wenn sich Bearbeitungen oder Rechtsanforderungen ändern. Die aktuelle Fassung ist öffentlich auf swisscompact.com/rechtliches.html abrufbar; verbindliche Portalversionen werden zusätzlich versioniert und unveränderbar protokolliert.$legal$,
        requires_acceptance = false,
        effective_at = '2026-09-02 00:00:00+02'::timestamptz
    where id = target_id and status = 'draft';
  end if;

  update swisscompact.legal_documents
  set status = 'superseded'
  where document_type = 'privacy'
    and status = 'published'
    and id <> target_id;

  update swisscompact.legal_documents
  set status = 'published',
      effective_at = '2026-09-02 00:00:00+02'::timestamptz,
      published_at = now()
  where id = target_id and status = 'draft';
end;
$$;

do $$
declare
  target_id uuid;
  target_status text;
begin
  select id, status into target_id, target_status
  from swisscompact.legal_documents
  where document_type = 'data_processing' and version = '1.0';

  if target_status = 'published' then
    if not exists (
      select 1 from swisscompact.legal_documents
      where id = target_id
        and acceptance_scope = 'tenant'
        and title = $legal$Vereinbarung zur Auftragsbearbeitung$legal$
        and summary = $legal$Regelt die Bearbeitung von Personendaten im Auftrag des Kundenbetriebs.$legal$
        and content_markdown = $legal$# Vereinbarung zur Auftragsbearbeitung

Version 1.0 · gültig ab 2. September 2026

## 1. Parteien und Gegenstand

Diese Vereinbarung zur Auftragsbearbeitung („AVV“) gilt zwischen dem im Kundenportal bezeichneten Kundenbetrieb als Verantwortlichem und Marcel Spahr, handelnd unter SwissCompact, Schwarzenburgstrasse 65, 3008 Bern, Schweiz, als Auftragsbearbeiter. Sie ergänzt die angenommene Offerte oder sonstige Hauptvereinbarung.

SwissCompact bearbeitet Personendaten für den Kundenbetrieb, soweit dies zur Bereitstellung von Software, Kundenportal, Projekten, Medien- und Kampagnenverwaltung, Displaybetrieb, Support, Sicherung und vereinbarten KI-Funktionen erforderlich ist. Die Bearbeitung dauert grundsätzlich für die Laufzeit der Hauptvereinbarung zuzüglich Rückgabe-, Lösch-, Sicherungs- und gesetzlicher Aufbewahrungsfristen.

## 2. Weisungen und Verantwortlichkeit

SwissCompact bearbeitet Auftragsdaten nur gemäss dokumentierten Weisungen des Kundenbetriebs, der Hauptvereinbarung, dieser AVV und zwingendem Recht. Als dokumentierte Weisungen gelten insbesondere freigegebene Funktionen, Konfigurationen, Supportanfragen und schriftliche Mitteilungen berechtigter Personen.

Hält SwissCompact eine Weisung für rechtswidrig oder sicherheitsgefährdend, wird der Kundenbetrieb informiert und die Ausführung darf bis zur Klärung ausgesetzt werden. Der Kundenbetrieb ist für die Rechtmässigkeit der Erhebung, die Information betroffener Personen, erforderliche Einwilligungen sowie die Richtigkeit und Datenminimierung verantwortlich.

## 3. Daten und betroffene Personen

Je nach gebuchter Leistung können Kontakt-, Konto-, Rollen-, Vertrags-, Projekt-, Kommunikations-, Support-, Medien-, Kampagnen-, Nutzungs-, Geräte- und Protokolldaten bearbeitet werden. Betroffene Personen können Mitarbeiter, Beauftragte, Kunden, Interessenten, Lieferanten, Partner und Besucher des Kundenbetriebs sein.

Besonders schützenswerte Personendaten, Berufsgeheimnisse oder Daten mit aussergewöhnlich hohem Schutzbedarf dürfen nur bearbeitet werden, wenn dies vorab ausdrücklich vereinbart wurde und angemessene zusätzliche Massnahmen festgelegt sind. Passwörter, geheime Schlüssel und vollständige Zahlungsinstrumentdaten dürfen nicht in Freitextfelder oder KI-Funktionen eingegeben werden.

## 4. Vertraulichkeit und Sicherheit

SwissCompact verpflichtet zugriffsberechtigte Personen zur Vertraulichkeit und beschränkt Zugriffe nach Aufgabe und Rolle. Die technischen und organisatorischen Massnahmen umfassen insbesondere verschlüsselte Übertragung, sichere Sitzungen, rollenbasierte Rechte, Mandantentrennung auf Datenbankebene, private Speicherbereiche, serverseitig geschützte Administrationsschlüssel, Mehrfaktor- und Passkey-Verfahren, Protokollierung, Sicherungen, Wiederherstellungsprüfungen sowie Verfahren für Sicherheitsvorfälle.

Die Massnahmen werden unter Berücksichtigung von Risiko, Stand der Technik, Implementierungsaufwand und Art der Daten weiterentwickelt. SwissCompact informiert den Kundenbetrieb über wesentliche Änderungen, die das vereinbarte Schutzniveau beeinträchtigen könnten.

## 5. Unterauftragnehmer

Der Kundenbetrieb erteilt eine allgemeine Genehmigung für die folgenden Kategorien und aktuell eingesetzten Unterauftragnehmer:

- Supabase, Inc.: Datenbank, Authentifizierung und privater Dateispeicher;
- Vercel, Inc.: Hosting, Auslieferung und serverseitige Funktionen;
- OpenAI Ireland Ltd. und veröffentlichte Unterauftragnehmer: ausdrücklich genutzte KI-Funktionen;
- Mux, Inc.: Videoverarbeitung und -auslieferung;
- Plus Five Five, Inc. (Resend): E-Mail-Versand;
- Stripe Payments Europe, Ltd. und verbundene Unternehmen: Zahlungsabwicklung, soweit SwissCompact dabei Auftragsdaten übermittelt.

SwissCompact verpflichtet Unterauftragnehmer vertraglich zu einem angemessenen Datenschutz- und Sicherheitsniveau. Über einen beabsichtigten Austausch oder eine Ergänzung mit wesentlicher Auswirkung informiert SwissCompact vorab in geeigneter Form. Der Kundenbetrieb kann aus sachlich begründeten Datenschutzgründen widersprechen. Können die Parteien keine zumutbare Lösung finden, kann die betroffene Teilfunktion oder Hauptvereinbarung nach deren Regeln beendet werden.

## 6. Auslandübermittlungen

Bearbeitungen können in der Schweiz, im Europäischen Wirtschaftsraum, im Vereinigten Königreich, in den USA sowie je nach Teilfunktion und aktueller Unterauftragnehmerliste in Kanada, Japan, Singapur, Indien, Australien oder Brasilien erfolgen. Für Staaten ohne anerkannt angemessenes Datenschutzniveau stellt SwissCompact geeignete Garantien sicher, insbesondere anwendbare Standardvertragsklauseln mit schweizerischen Anpassungen, soweit keine gesetzliche Ausnahme greift.

## 7. Unterstützung und Vorfälle

SwissCompact unterstützt den Kundenbetrieb unter Berücksichtigung der Art der Bearbeitung angemessen bei Anfragen betroffener Personen, Datensicherheitsverletzungen, Datenschutz-Folgenabschätzungen und behördlichen Anfragen. Geht eine Anfrage unmittelbar bei SwissCompact ein, wird sie grundsätzlich an den Kundenbetrieb weitergeleitet, soweit SwissCompact nicht selbst verantwortlich oder gesetzlich zur direkten Antwort verpflichtet ist.

SwissCompact meldet dem Kundenbetrieb eine bestätigte Verletzung der Sicherheit von Auftragsdaten ohne unangemessene Verzögerung. Die Meldung enthält die verfügbaren Angaben zu Art, Folgen, betroffenen Daten und Personen, getroffenen oder vorgeschlagenen Massnahmen und einer Kontaktstelle. Neue Erkenntnisse können schrittweise ergänzt werden.

## 8. Rückgabe, Löschung und Sicherungen

Während der Vertragsdauer stellt SwissCompact vereinbarte Exportfunktionen bereit. Nach Ende der Leistung löscht oder gibt SwissCompact Auftragsdaten nach Weisung und technischer Möglichkeit zurück, sofern keine gesetzliche Pflicht oder ein überwiegender Nachweisgrund die weitere Aufbewahrung verlangt. Daten in rotierenden Sicherungen werden mit deren regulärem Zyklus überschrieben und bis dahin nicht produktiv verwendet, ausser dies ist für eine kontrollierte Wiederherstellung erforderlich.

## 9. Nachweise und Kontrollen

SwissCompact stellt auf angemessene Anfrage Informationen bereit, die zur Beurteilung der Einhaltung dieser AVV erforderlich sind. Bestehen konkrete begründete Zweifel, kann der Kundenbetrieb höchstens einmal jährlich eine verhältnismässige Prüfung durch eine zur Vertraulichkeit verpflichtete unabhängige Fachperson verlangen. Prüfungen müssen Betrieb, Sicherheit anderer Kunden und Geschäftsgeheimnisse schützen; vermeidbare Kosten trägt der Kundenbetrieb. Gesetzliche Aufsichtsrechte bleiben unberührt.

## 10. Rangfolge, Haftung und Dauer

Bei Widersprüchen geht diese AVV für die Auftragsbearbeitung der Hauptvereinbarung vor. Individuell vereinbarte strengere Datenschutzregeln gehen dieser Standardfassung vor. Haftung und Gerichtsstand richten sich nach der Hauptvereinbarung, soweit zwingendes Datenschutzrecht nichts anderes verlangt.

Die AVV tritt mit ihrer Bestätigung durch einen Inhaber oder Administrator des Kundenbetriebs in Kraft und endet, wenn SwissCompact keine Auftragsdaten mehr bearbeitet. Vertraulichkeits-, Nachweis- und gesetzliche Aufbewahrungspflichten gelten fort.

## 11. Kontakt

Datenschutz- und Sicherheitsanfragen: kontakt@swisscompact.com oder SwissCompact, Marcel Spahr, Schwarzenburgstrasse 65, 3008 Bern, Schweiz.$legal$
        and requires_acceptance = true
    ) then
      raise exception 'Die bereits veröffentlichte Version 1.0 von data_processing weicht von der geprüften Fassung ab';
    end if;
    return;
  end if;

  if target_status = 'superseded' then
    raise exception 'Version 1.0 von data_processing wurde bereits ersetzt; eine neue Version ist erforderlich';
  end if;

  if target_id is null then
    insert into swisscompact.legal_documents (
      document_type, acceptance_scope, version, title, summary, content_markdown,
      requires_acceptance, status, effective_at, published_at
    ) values (
      'data_processing', 'tenant', '1.0', $legal$Vereinbarung zur Auftragsbearbeitung$legal$,
      $legal$Regelt die Bearbeitung von Personendaten im Auftrag des Kundenbetriebs.$legal$, $legal$# Vereinbarung zur Auftragsbearbeitung

Version 1.0 · gültig ab 2. September 2026

## 1. Parteien und Gegenstand

Diese Vereinbarung zur Auftragsbearbeitung („AVV“) gilt zwischen dem im Kundenportal bezeichneten Kundenbetrieb als Verantwortlichem und Marcel Spahr, handelnd unter SwissCompact, Schwarzenburgstrasse 65, 3008 Bern, Schweiz, als Auftragsbearbeiter. Sie ergänzt die angenommene Offerte oder sonstige Hauptvereinbarung.

SwissCompact bearbeitet Personendaten für den Kundenbetrieb, soweit dies zur Bereitstellung von Software, Kundenportal, Projekten, Medien- und Kampagnenverwaltung, Displaybetrieb, Support, Sicherung und vereinbarten KI-Funktionen erforderlich ist. Die Bearbeitung dauert grundsätzlich für die Laufzeit der Hauptvereinbarung zuzüglich Rückgabe-, Lösch-, Sicherungs- und gesetzlicher Aufbewahrungsfristen.

## 2. Weisungen und Verantwortlichkeit

SwissCompact bearbeitet Auftragsdaten nur gemäss dokumentierten Weisungen des Kundenbetriebs, der Hauptvereinbarung, dieser AVV und zwingendem Recht. Als dokumentierte Weisungen gelten insbesondere freigegebene Funktionen, Konfigurationen, Supportanfragen und schriftliche Mitteilungen berechtigter Personen.

Hält SwissCompact eine Weisung für rechtswidrig oder sicherheitsgefährdend, wird der Kundenbetrieb informiert und die Ausführung darf bis zur Klärung ausgesetzt werden. Der Kundenbetrieb ist für die Rechtmässigkeit der Erhebung, die Information betroffener Personen, erforderliche Einwilligungen sowie die Richtigkeit und Datenminimierung verantwortlich.

## 3. Daten und betroffene Personen

Je nach gebuchter Leistung können Kontakt-, Konto-, Rollen-, Vertrags-, Projekt-, Kommunikations-, Support-, Medien-, Kampagnen-, Nutzungs-, Geräte- und Protokolldaten bearbeitet werden. Betroffene Personen können Mitarbeiter, Beauftragte, Kunden, Interessenten, Lieferanten, Partner und Besucher des Kundenbetriebs sein.

Besonders schützenswerte Personendaten, Berufsgeheimnisse oder Daten mit aussergewöhnlich hohem Schutzbedarf dürfen nur bearbeitet werden, wenn dies vorab ausdrücklich vereinbart wurde und angemessene zusätzliche Massnahmen festgelegt sind. Passwörter, geheime Schlüssel und vollständige Zahlungsinstrumentdaten dürfen nicht in Freitextfelder oder KI-Funktionen eingegeben werden.

## 4. Vertraulichkeit und Sicherheit

SwissCompact verpflichtet zugriffsberechtigte Personen zur Vertraulichkeit und beschränkt Zugriffe nach Aufgabe und Rolle. Die technischen und organisatorischen Massnahmen umfassen insbesondere verschlüsselte Übertragung, sichere Sitzungen, rollenbasierte Rechte, Mandantentrennung auf Datenbankebene, private Speicherbereiche, serverseitig geschützte Administrationsschlüssel, Mehrfaktor- und Passkey-Verfahren, Protokollierung, Sicherungen, Wiederherstellungsprüfungen sowie Verfahren für Sicherheitsvorfälle.

Die Massnahmen werden unter Berücksichtigung von Risiko, Stand der Technik, Implementierungsaufwand und Art der Daten weiterentwickelt. SwissCompact informiert den Kundenbetrieb über wesentliche Änderungen, die das vereinbarte Schutzniveau beeinträchtigen könnten.

## 5. Unterauftragnehmer

Der Kundenbetrieb erteilt eine allgemeine Genehmigung für die folgenden Kategorien und aktuell eingesetzten Unterauftragnehmer:

- Supabase, Inc.: Datenbank, Authentifizierung und privater Dateispeicher;
- Vercel, Inc.: Hosting, Auslieferung und serverseitige Funktionen;
- OpenAI Ireland Ltd. und veröffentlichte Unterauftragnehmer: ausdrücklich genutzte KI-Funktionen;
- Mux, Inc.: Videoverarbeitung und -auslieferung;
- Plus Five Five, Inc. (Resend): E-Mail-Versand;
- Stripe Payments Europe, Ltd. und verbundene Unternehmen: Zahlungsabwicklung, soweit SwissCompact dabei Auftragsdaten übermittelt.

SwissCompact verpflichtet Unterauftragnehmer vertraglich zu einem angemessenen Datenschutz- und Sicherheitsniveau. Über einen beabsichtigten Austausch oder eine Ergänzung mit wesentlicher Auswirkung informiert SwissCompact vorab in geeigneter Form. Der Kundenbetrieb kann aus sachlich begründeten Datenschutzgründen widersprechen. Können die Parteien keine zumutbare Lösung finden, kann die betroffene Teilfunktion oder Hauptvereinbarung nach deren Regeln beendet werden.

## 6. Auslandübermittlungen

Bearbeitungen können in der Schweiz, im Europäischen Wirtschaftsraum, im Vereinigten Königreich, in den USA sowie je nach Teilfunktion und aktueller Unterauftragnehmerliste in Kanada, Japan, Singapur, Indien, Australien oder Brasilien erfolgen. Für Staaten ohne anerkannt angemessenes Datenschutzniveau stellt SwissCompact geeignete Garantien sicher, insbesondere anwendbare Standardvertragsklauseln mit schweizerischen Anpassungen, soweit keine gesetzliche Ausnahme greift.

## 7. Unterstützung und Vorfälle

SwissCompact unterstützt den Kundenbetrieb unter Berücksichtigung der Art der Bearbeitung angemessen bei Anfragen betroffener Personen, Datensicherheitsverletzungen, Datenschutz-Folgenabschätzungen und behördlichen Anfragen. Geht eine Anfrage unmittelbar bei SwissCompact ein, wird sie grundsätzlich an den Kundenbetrieb weitergeleitet, soweit SwissCompact nicht selbst verantwortlich oder gesetzlich zur direkten Antwort verpflichtet ist.

SwissCompact meldet dem Kundenbetrieb eine bestätigte Verletzung der Sicherheit von Auftragsdaten ohne unangemessene Verzögerung. Die Meldung enthält die verfügbaren Angaben zu Art, Folgen, betroffenen Daten und Personen, getroffenen oder vorgeschlagenen Massnahmen und einer Kontaktstelle. Neue Erkenntnisse können schrittweise ergänzt werden.

## 8. Rückgabe, Löschung und Sicherungen

Während der Vertragsdauer stellt SwissCompact vereinbarte Exportfunktionen bereit. Nach Ende der Leistung löscht oder gibt SwissCompact Auftragsdaten nach Weisung und technischer Möglichkeit zurück, sofern keine gesetzliche Pflicht oder ein überwiegender Nachweisgrund die weitere Aufbewahrung verlangt. Daten in rotierenden Sicherungen werden mit deren regulärem Zyklus überschrieben und bis dahin nicht produktiv verwendet, ausser dies ist für eine kontrollierte Wiederherstellung erforderlich.

## 9. Nachweise und Kontrollen

SwissCompact stellt auf angemessene Anfrage Informationen bereit, die zur Beurteilung der Einhaltung dieser AVV erforderlich sind. Bestehen konkrete begründete Zweifel, kann der Kundenbetrieb höchstens einmal jährlich eine verhältnismässige Prüfung durch eine zur Vertraulichkeit verpflichtete unabhängige Fachperson verlangen. Prüfungen müssen Betrieb, Sicherheit anderer Kunden und Geschäftsgeheimnisse schützen; vermeidbare Kosten trägt der Kundenbetrieb. Gesetzliche Aufsichtsrechte bleiben unberührt.

## 10. Rangfolge, Haftung und Dauer

Bei Widersprüchen geht diese AVV für die Auftragsbearbeitung der Hauptvereinbarung vor. Individuell vereinbarte strengere Datenschutzregeln gehen dieser Standardfassung vor. Haftung und Gerichtsstand richten sich nach der Hauptvereinbarung, soweit zwingendes Datenschutzrecht nichts anderes verlangt.

Die AVV tritt mit ihrer Bestätigung durch einen Inhaber oder Administrator des Kundenbetriebs in Kraft und endet, wenn SwissCompact keine Auftragsdaten mehr bearbeitet. Vertraulichkeits-, Nachweis- und gesetzliche Aufbewahrungspflichten gelten fort.

## 11. Kontakt

Datenschutz- und Sicherheitsanfragen: kontakt@swisscompact.com oder SwissCompact, Marcel Spahr, Schwarzenburgstrasse 65, 3008 Bern, Schweiz.$legal$, true,
      'draft', '2026-09-02 00:00:00+02'::timestamptz, null
    ) returning id into target_id;
  else
    update swisscompact.legal_documents
    set acceptance_scope = 'tenant',
        title = $legal$Vereinbarung zur Auftragsbearbeitung$legal$,
        summary = $legal$Regelt die Bearbeitung von Personendaten im Auftrag des Kundenbetriebs.$legal$,
        content_markdown = $legal$# Vereinbarung zur Auftragsbearbeitung

Version 1.0 · gültig ab 2. September 2026

## 1. Parteien und Gegenstand

Diese Vereinbarung zur Auftragsbearbeitung („AVV“) gilt zwischen dem im Kundenportal bezeichneten Kundenbetrieb als Verantwortlichem und Marcel Spahr, handelnd unter SwissCompact, Schwarzenburgstrasse 65, 3008 Bern, Schweiz, als Auftragsbearbeiter. Sie ergänzt die angenommene Offerte oder sonstige Hauptvereinbarung.

SwissCompact bearbeitet Personendaten für den Kundenbetrieb, soweit dies zur Bereitstellung von Software, Kundenportal, Projekten, Medien- und Kampagnenverwaltung, Displaybetrieb, Support, Sicherung und vereinbarten KI-Funktionen erforderlich ist. Die Bearbeitung dauert grundsätzlich für die Laufzeit der Hauptvereinbarung zuzüglich Rückgabe-, Lösch-, Sicherungs- und gesetzlicher Aufbewahrungsfristen.

## 2. Weisungen und Verantwortlichkeit

SwissCompact bearbeitet Auftragsdaten nur gemäss dokumentierten Weisungen des Kundenbetriebs, der Hauptvereinbarung, dieser AVV und zwingendem Recht. Als dokumentierte Weisungen gelten insbesondere freigegebene Funktionen, Konfigurationen, Supportanfragen und schriftliche Mitteilungen berechtigter Personen.

Hält SwissCompact eine Weisung für rechtswidrig oder sicherheitsgefährdend, wird der Kundenbetrieb informiert und die Ausführung darf bis zur Klärung ausgesetzt werden. Der Kundenbetrieb ist für die Rechtmässigkeit der Erhebung, die Information betroffener Personen, erforderliche Einwilligungen sowie die Richtigkeit und Datenminimierung verantwortlich.

## 3. Daten und betroffene Personen

Je nach gebuchter Leistung können Kontakt-, Konto-, Rollen-, Vertrags-, Projekt-, Kommunikations-, Support-, Medien-, Kampagnen-, Nutzungs-, Geräte- und Protokolldaten bearbeitet werden. Betroffene Personen können Mitarbeiter, Beauftragte, Kunden, Interessenten, Lieferanten, Partner und Besucher des Kundenbetriebs sein.

Besonders schützenswerte Personendaten, Berufsgeheimnisse oder Daten mit aussergewöhnlich hohem Schutzbedarf dürfen nur bearbeitet werden, wenn dies vorab ausdrücklich vereinbart wurde und angemessene zusätzliche Massnahmen festgelegt sind. Passwörter, geheime Schlüssel und vollständige Zahlungsinstrumentdaten dürfen nicht in Freitextfelder oder KI-Funktionen eingegeben werden.

## 4. Vertraulichkeit und Sicherheit

SwissCompact verpflichtet zugriffsberechtigte Personen zur Vertraulichkeit und beschränkt Zugriffe nach Aufgabe und Rolle. Die technischen und organisatorischen Massnahmen umfassen insbesondere verschlüsselte Übertragung, sichere Sitzungen, rollenbasierte Rechte, Mandantentrennung auf Datenbankebene, private Speicherbereiche, serverseitig geschützte Administrationsschlüssel, Mehrfaktor- und Passkey-Verfahren, Protokollierung, Sicherungen, Wiederherstellungsprüfungen sowie Verfahren für Sicherheitsvorfälle.

Die Massnahmen werden unter Berücksichtigung von Risiko, Stand der Technik, Implementierungsaufwand und Art der Daten weiterentwickelt. SwissCompact informiert den Kundenbetrieb über wesentliche Änderungen, die das vereinbarte Schutzniveau beeinträchtigen könnten.

## 5. Unterauftragnehmer

Der Kundenbetrieb erteilt eine allgemeine Genehmigung für die folgenden Kategorien und aktuell eingesetzten Unterauftragnehmer:

- Supabase, Inc.: Datenbank, Authentifizierung und privater Dateispeicher;
- Vercel, Inc.: Hosting, Auslieferung und serverseitige Funktionen;
- OpenAI Ireland Ltd. und veröffentlichte Unterauftragnehmer: ausdrücklich genutzte KI-Funktionen;
- Mux, Inc.: Videoverarbeitung und -auslieferung;
- Plus Five Five, Inc. (Resend): E-Mail-Versand;
- Stripe Payments Europe, Ltd. und verbundene Unternehmen: Zahlungsabwicklung, soweit SwissCompact dabei Auftragsdaten übermittelt.

SwissCompact verpflichtet Unterauftragnehmer vertraglich zu einem angemessenen Datenschutz- und Sicherheitsniveau. Über einen beabsichtigten Austausch oder eine Ergänzung mit wesentlicher Auswirkung informiert SwissCompact vorab in geeigneter Form. Der Kundenbetrieb kann aus sachlich begründeten Datenschutzgründen widersprechen. Können die Parteien keine zumutbare Lösung finden, kann die betroffene Teilfunktion oder Hauptvereinbarung nach deren Regeln beendet werden.

## 6. Auslandübermittlungen

Bearbeitungen können in der Schweiz, im Europäischen Wirtschaftsraum, im Vereinigten Königreich, in den USA sowie je nach Teilfunktion und aktueller Unterauftragnehmerliste in Kanada, Japan, Singapur, Indien, Australien oder Brasilien erfolgen. Für Staaten ohne anerkannt angemessenes Datenschutzniveau stellt SwissCompact geeignete Garantien sicher, insbesondere anwendbare Standardvertragsklauseln mit schweizerischen Anpassungen, soweit keine gesetzliche Ausnahme greift.

## 7. Unterstützung und Vorfälle

SwissCompact unterstützt den Kundenbetrieb unter Berücksichtigung der Art der Bearbeitung angemessen bei Anfragen betroffener Personen, Datensicherheitsverletzungen, Datenschutz-Folgenabschätzungen und behördlichen Anfragen. Geht eine Anfrage unmittelbar bei SwissCompact ein, wird sie grundsätzlich an den Kundenbetrieb weitergeleitet, soweit SwissCompact nicht selbst verantwortlich oder gesetzlich zur direkten Antwort verpflichtet ist.

SwissCompact meldet dem Kundenbetrieb eine bestätigte Verletzung der Sicherheit von Auftragsdaten ohne unangemessene Verzögerung. Die Meldung enthält die verfügbaren Angaben zu Art, Folgen, betroffenen Daten und Personen, getroffenen oder vorgeschlagenen Massnahmen und einer Kontaktstelle. Neue Erkenntnisse können schrittweise ergänzt werden.

## 8. Rückgabe, Löschung und Sicherungen

Während der Vertragsdauer stellt SwissCompact vereinbarte Exportfunktionen bereit. Nach Ende der Leistung löscht oder gibt SwissCompact Auftragsdaten nach Weisung und technischer Möglichkeit zurück, sofern keine gesetzliche Pflicht oder ein überwiegender Nachweisgrund die weitere Aufbewahrung verlangt. Daten in rotierenden Sicherungen werden mit deren regulärem Zyklus überschrieben und bis dahin nicht produktiv verwendet, ausser dies ist für eine kontrollierte Wiederherstellung erforderlich.

## 9. Nachweise und Kontrollen

SwissCompact stellt auf angemessene Anfrage Informationen bereit, die zur Beurteilung der Einhaltung dieser AVV erforderlich sind. Bestehen konkrete begründete Zweifel, kann der Kundenbetrieb höchstens einmal jährlich eine verhältnismässige Prüfung durch eine zur Vertraulichkeit verpflichtete unabhängige Fachperson verlangen. Prüfungen müssen Betrieb, Sicherheit anderer Kunden und Geschäftsgeheimnisse schützen; vermeidbare Kosten trägt der Kundenbetrieb. Gesetzliche Aufsichtsrechte bleiben unberührt.

## 10. Rangfolge, Haftung und Dauer

Bei Widersprüchen geht diese AVV für die Auftragsbearbeitung der Hauptvereinbarung vor. Individuell vereinbarte strengere Datenschutzregeln gehen dieser Standardfassung vor. Haftung und Gerichtsstand richten sich nach der Hauptvereinbarung, soweit zwingendes Datenschutzrecht nichts anderes verlangt.

Die AVV tritt mit ihrer Bestätigung durch einen Inhaber oder Administrator des Kundenbetriebs in Kraft und endet, wenn SwissCompact keine Auftragsdaten mehr bearbeitet. Vertraulichkeits-, Nachweis- und gesetzliche Aufbewahrungspflichten gelten fort.

## 11. Kontakt

Datenschutz- und Sicherheitsanfragen: kontakt@swisscompact.com oder SwissCompact, Marcel Spahr, Schwarzenburgstrasse 65, 3008 Bern, Schweiz.$legal$,
        requires_acceptance = true,
        effective_at = '2026-09-02 00:00:00+02'::timestamptz
    where id = target_id and status = 'draft';
  end if;

  update swisscompact.legal_documents
  set status = 'superseded'
  where document_type = 'data_processing'
    and status = 'published'
    and id <> target_id;

  update swisscompact.legal_documents
  set status = 'published',
      effective_at = '2026-09-02 00:00:00+02'::timestamptz,
      published_at = now()
  where id = target_id and status = 'draft';
end;
$$;

commit;

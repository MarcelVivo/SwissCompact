# Erster isolierter Backup-Wiederherstellungstest

Produktionsdaten werden niemals in die laufende Produktionsdatenbank zurückgespielt. Der Test erfolgt in einem neuen, leeren Supabase-Projekt ohne öffentliche Anwendung, Webhooks oder E-Mail-Versand.

## 1. Isolierte Umgebung

1. Ein separates Supabase-Projekt mit Bezeichnung `SwissCompact Restore Drill YYYY-MM-DD` erstellen.
2. Keine Produktionsdomain verbinden und keine Stripe-, Mux-, Resend- oder OpenAI-Schlüssel hinterlegen.
3. Netzwerkzugriff auf die testenden Administratoren begrenzen.
4. Im internen Dashboard unter **Systeme → Test planen** Umgebung **Separates Supabase-Projekt** wählen und Backup-Referenz/Zeitpunkt erfassen.

## 2. Wiederherstellung

1. Im Produktionsprojekt unter **Database → Backups** einen geeigneten Wiederherstellungspunkt beziehungsweise ein herunterladbares Backup wählen.
2. Das Backup gemäss dem im Supabase-Plan verfügbaren Restore-Verfahren ausschliesslich in das isolierte Projekt einspielen.
3. Vor jedem Anwendungstest alle ausgehenden Integrationen deaktiviert lassen.
4. Start- und Endzeit sowie Backup-ID oder Wiederherstellungspunkt notieren.

## 3. Pflichtkontrollen

- Tabellen, Funktionen, Trigger und Migrationen sind vorhanden.
- Stichprobe aus Kunden, Projekten und Mandantenzuordnungen ist konsistent.
- RLS ist auf geschützten Tabellen aktiv; ein Testbenutzer sieht keine fremden Mandanten.
- Authentifizierung funktioniert nur mit Testkonten; Produktionsbenutzer werden nicht angeschrieben.
- Private Storage-Buckets und eine Stichprobe von Dateien sind vorhanden beziehungsweise ihr getrennter Restore-Bedarf ist dokumentiert.
- Keine E-Mail, kein Webhook, keine Zahlung und keine KI-Aktion wurde extern ausgelöst.

## 4. Abschluss

Im Dashboard **Durchführen & dokumentieren** öffnen, mindestens drei Kontrollen markieren, Wiederherstellungszeit und Abweichungen erfassen und erst dann **Bestanden** wählen. Bei einer Abweichung wird **Fehlgeschlagen** dokumentiert und eine Betriebsmeldung beziehungsweise Aufgabe angelegt.

Nach Sicherung des Nachweises das isolierte Projekt über die Supabase-Projekteinstellungen löschen. Vor dem Löschen den Projektnamen und die Referenz nochmals kontrollieren; niemals das Produktionsprojekt auswählen.

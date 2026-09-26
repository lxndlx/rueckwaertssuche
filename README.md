# Rückwärtssuche

Eine einfache lokale Webseite für Telefonnummern: öffentlich eingetragene Firmen
und Einrichtungen über **OpenStreetMap** finden und **Spam-Hinweise von PhoneBlock**
direkt daneben anzeigen. Internationale Nummern werden unterstützt. Die Oberfläche
ist deutsch und passt sich an schmale Fenster an.

## Starten auf diesem PC

Voraussetzung: **Node.js ab Version 24** und eine Internetverbindung. Node.js ist auf
dem Entwicklungs-PC bereits installiert.

1. Öffne ein Terminal im Projektordner.
2. Führe einmalig `npm install` aus.
3. Starte die Seite mit `npm start`.
4. Öffne [http://127.0.0.1:3000](http://127.0.0.1:3000) in deinem Browser.

Zum Beenden im Terminal **Strg+C** drücken. Für einen späteren Start genügt
`npm start`. Der Terminalhinweis, dass keine `.env` gefunden wurde, ist normal:
die Standardeinstellungen funktionieren ohne diese Datei.

Die Seite ist standardmäßig nur auf diesem PC erreichbar. Sie wird als lokale
Webanwendung gestartet; ein Doppelklick auf die HTML-Datei genügt nicht, weil der
lokale Server die Datenquellen abfragt.

## Eine Nummer suchen

- Gib die vollständige Telefonnummer mit Vorwahl ein und drücke **Suchen** oder
  die **Eingabetaste**.
- Ohne internationale Vorwahl wird das ausgewählte Land verwendet, anfangs
  Deutschland. Für ausländische nationale Nummern wähle das entsprechende Land.
- Bei `+` oder `00` bestimmt die Vorwahl das Land. Leerzeichen, Klammern,
  Schrägstriche und Bindestriche sind möglich.
- Beide Ergebnisbereiche laden unabhängig. Eine neue Suche ersetzt die vorherige
  und bricht deren noch laufende Abfragen ab. Pro Quelle wird maximal 20 Sekunden
  gewartet; nach Fehlern wird nicht automatisch erneut gesucht.
- Ein fehlender Treffer, eine nicht erreichbare Quelle und eine ungültige Eingabe
  werden unterschiedlich angezeigt.

## Was die Suche leisten kann

**Firmen und Einrichtungen:** OpenStreetMap enthält freiwillig erfasste Einträge,
kein vollständiges Telefonbuch. Gesucht wird weltweit in den Feldern `phone` und
`contact:phone` nach international gespeicherten Nummern mit `+` oder `00`.
Übliche Trennzeichen und durch Semikolon getrennte Nummern werden berücksichtigt.
Nur exakt passende, normalisierte Nummern mit einem benannten Eintrag werden
angezeigt; lokale Nummern ohne internationale Vorwahl können in der Datenquelle
übersehen werden. Bis zu 20 Treffer werden dargestellt. Die Angaben können
unvollständig oder veraltet sein; Privatpersonen werden nicht gezielt gesucht.

**Spam-Hinweise:** PhoneBlock liefert Community-Bewertungen. Die Darstellung
übernimmt deren Kategorie und, falls vorhanden, deren Spam-Einschätzung. Hinweise
zu einem Nummernbereich werden ausdrücklich von Bewertungen der genauen Nummer
unterschieden. Gewichtete Bewertungswerte werden nicht als Anzahl von Meldungen
ausgegeben. **Keine Hinweise sind keine Entwarnung.** Auch ein vorhandener
Firmeneintrag beweist nicht die Identität eines Anrufers.

Die Quellen sind kostenlos und ohne eigenen Benutzerzugang angebunden. Ihre
Verfügbarkeit und Abdeckung sind nicht garantiert. Bei Überlastung oder einer
Sperre für zu viele Abfragen später manuell erneut versuchen.

## Speicherung und externe Abfragen

- Kein Suchverlauf, keine Datenbank, keine Cookies und kein Browser-Speicher.
- Keine Protokollierung von Telefonnummern oder Anfrageinhalten durch die App.
- Antworten werden mit `Cache-Control: no-store` ausgeliefert. Beim Neuladen wird
  das Formular zurückgesetzt. Ergebnisse leben nur im Arbeitsspeicher während
  der aktuellen Nutzung.
- Erst beim Absenden wird die normalisierte Telefonnummer an OpenStreetMap /
  Overpass und PhoneBlock übertragen. Diese externen Dienste haben eigene
  Betriebs- und Datenschutzregeln; deren Speicherung steuert diese App nicht.
- Schriftarten, Skripte und Gestaltung werden lokal ausgeliefert. Beim Öffnen
  eines Quellenlinks wird die jeweilige externe Webseite aufgerufen.

## Auf dem Homeserver mit Docker Compose starten

Voraussetzung auf dem Homeserver: Git, Docker mit dem Befehl `docker compose`,
Internetverbindung und ein freier Port 3000. Öffne dort ein Terminal und lade das
öffentliche Repository herunter:

```sh
git clone https://github.com/lxndlx/rueckwaertssuche.git
cd rueckwaertssuche
docker compose up -d --build
docker compose ps
```

Der Homeserver lädt beim ersten Start das Node-Image und die
Programmabhängigkeiten aus dem Internet. Für das öffentliche Repository brauchst
du beim Herunterladen über HTTPS kein GitHub-Konto.

Nach späteren Änderungen im Repository aktualisierst du die Anwendung im selben
Ordner mit:

```sh
git pull --ff-only
docker compose up -d --build
```

Wenn bei `docker compose ps` der Dienst `rueckwaertssuche` als `healthy` angezeigt
wird, öffne auf einem Gerät in deinem Heimnetz
`http://IP-DEINES-HOMESERVERS:3000`. Setze dabei die tatsächliche IP-Adresse des
Homeservers ein. Der erste Start kann wegen des Downloads einige Minuten dauern.
Falls die Seite nicht erreichbar ist, prüfe die Firewall des Homeservers und
die Meldungen mit `docker compose logs --tail=50 rueckwaertssuche`.

Port 3000 ist auf dem Homeserver bereits belegt? Lege im Projektordner eine
Datei namens `.env` mit folgendem Inhalt an:

```ini
WEB_PORT=3001
```

Starte dann erneut mit `docker compose up -d --build` und öffne die Seite über
Port 3001. Wenn ein Reverse Proxy **direkt auf dem Homeserver** läuft, kann die
Veröffentlichung auf den Homeserver selbst beschränkt werden, indem du zusätzlich
`BIND_ADDRESS=127.0.0.1` in `.env` einträgst. Ohne diese Einstellung ist die
Seite über alle Netzwerkschnittstellen des Homeservers erreichbar. Sie hat keine
Benutzeranmeldung; richte deshalb keine Portfreigabe vom Internet-Router auf
diesen Dienst ein.

Zum Beenden: `docker compose down`. Die Anwendung braucht keine Datenbank und
keine Speicherordner auf dem Homeserver; Suchanfragen werden von ihr nicht gespeichert.
Der Container startet nach einem Neustart des Homeservers automatisch wieder,
solange er nicht mit `docker compose down` entfernt wurde.

## Einstellungen für den Start ohne Docker

Kopiere bei Bedarf `.env.example` nach `.env`. Die Voreinstellungen sind:

```ini
HOST=127.0.0.1
PORT=3000
```

Falls Port 3000 belegt ist, ändere beispielsweise `PORT=3001` und starte die App
neu. Die Adresse lautet dann `http://127.0.0.1:3001`.

Beim Start ohne Docker bleibt `HOST` standardmäßig auf der lokalen Adresse.
Ein abweichender Host kann Netzwerkzugriff ermöglichen; eine Anmeldung ist nicht
vorgesehen. Die Docker-Einstellungen `WEB_PORT` und `BIND_ADDRESS` in `.env`
gelten nur für Docker Compose; `HOST` und `PORT` gelten für `npm start`.

## Entwicklung und Tests

```sh
npm test
npm run dev
```

`npm test` prüft Nummernformate, exakte Treffer, Spam-Auswertung, Datenquellenfehler,
Zeitüberschreitungen, Abbrüche und die lokale HTTP-Schnittstelle. Die Tests
verwenden feste Daten und führen keine echten Abfragen bei den Datenquellen aus.
`npm run dev` startet den Server mit automatischem Neustart bei Codeänderungen;
die Browserseite anschließend neu laden.

Für eine manuelle Prüfung mit echten Diensten: `node scripts/check-live.mjs`.
Dieser gesonderte Prüflauf fragt einen öffentlichen Firmeneintrag und die
PhoneBlock-Testinstallation ab. Er ist nicht Teil von `npm test`.

Für Browserprüfungen ohne externe Anfragen: `node test/support/preview.mjs`.
Die ausgegebene lokale Adresse nutzt ausschließlich feste Testdaten: eine
deutsche Nummer zeigt zwei Einträge und einen Spam-Hinweis, eine US-Nummer einen
Quellenfehler neben einem Spam-Hinweis, eine britische Nummer keinen Treffer.
Der normale Start mit `npm start` nutzt immer die echten Datenquellen.

### Interne Schnittstelle

`POST /api/lookup` mit JSON:

```json
{ "phone": "030 2426881", "country": "DE", "source": "osm" }
```

`source` ist `osm` oder `phoneblock`. Die Antwort enthält `phone` (normalisierte
Nummer, Anzeigeformat, Land), `source`, `status` und `results`. `status` ist
`found`, `not_found` oder `unavailable`; beim letzten Zustand enthält `error`
einen maschinenlesbaren `code` und eine deutsche `message`. Eingabefehler liefern
HTTP 400 mit `error` als Text. Ein Quellenfehler ist ein normaler HTTP-200-Bericht
über den Zustand dieser Quelle. `GET /api/countries` liefert die Länderliste;
`GET /api/health` bestätigt ausschließlich, dass der lokale Server läuft.

Quellenzugriffe sind in `src/providers.mjs` gekapselt und durch Testantworten
ersetzbar. Die PhoneBlock-Testinstallation kann für manuelle Integrationstests
über `createProviders({ phoneBlockBaseUrl: PHONEBLOCK_TEST_URL })` verwendet werden.
Sie ist nicht die Quelle der normalen Anwendung.

## Quellen

- [OpenStreetMap-Telefonnummern](https://wiki.openstreetmap.org/wiki/Key:phone)
- [Overpass API und faire Nutzung](https://dev.overpass-api.de/overpass-doc/en/preface/commons.html)
- [© OpenStreetMap-Mitwirkende, ODbL](https://www.openstreetmap.org/copyright)
- [PhoneBlock-API](https://phoneblock.net/phoneblock/api)
- [PhoneBlock-Projekt](https://github.com/haumacher/phoneblock)
- [libphonenumber-js](https://github.com/catamphetamine/libphonenumber-js)

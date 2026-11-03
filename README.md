# Sudoku Mosaik

Spielbare Sudoku-Varianten im Browser, inspiriert vom „Super Sudoku“ (acht verschachtelte Sudokus mit verschiedenen Regeln).
Alle Rätsel werden **neu erzeugt** und haben **genau eine Lösung**.

## Rätsel

**Meister-Rätsel** (9 × 9, kaum Vorgaben, immer Stufe „Extrem“ – schwer durch die Regeln, nicht durch die Größe)

| Name | Mechanismus |
| --- | --- |
| Lügen-Käfige | Killer, aber jede Käfigsumme ist um genau 1 falsch (zu groß oder zu klein) |
| Hebel-Sudoku | Balken mit Drehpunkt: Σ Ziffer × Abstand ist links und rechts gleich |
| Kompass-Sudoku | Pfeil-Länge = Ziffer im Feld; das Ziel ist eine 9 (gefüllter Pfeil) oder eine 1 (hohler Pfeil) |
| Linien-Labyrinth | Thermometer, Flüsterlinien (Abstand ≥ 5), Ketten (Renban) und Palindrome in einem Gitter |

**Riesen-Rätsel** (mehrere Gitter teilen sich Blöcke)

| Name | Form |
| --- | --- |
| Super-Sudoku | 8 Gitter im Ring (33 × 33): Klassisch, >Sudoku<, Addition, Killer, Nachbarn, Sudoku X, Seltsame Boxen, Farben |
| Super-Mix | gleicher Ring, Regeln zufällig verteilt |
| Samurai / Samurai-Mix | 5 Gitter (21 × 21) |
| Doppel | 2 Gitter, ein gemeinsamer Block |

**Einzelne Varianten:** Klassisch, Killer, >Sudoku< (Größer/Kleiner), Addition, Nachbar-Sudoku (Consecutive),
Sudoku X, Seltsame Boxen (Jigsaw), Farb-Sudoku (Offset), Fenster (Windoku), Gerade/Ungerade, Anti-Springer.

Vier Stufen: *Leicht* und *Mittel* sind ohne Raten lösbar, *Schwer* und *Extrem* haben die wenigsten Vorgaben und brauchen tiefere Schlussketten.

## Bedienung

- Feld antippen, dann Ziffer im Zahlenfeld wählen (oder Tastatur `1`–`9`, Pfeiltasten, `Entf`)
- **Notizen** (`N` / Leertaste), **Löschen**, **Zurück** (`Strg+Z`), **Tipp** (`H`)
- Menü (⋮): neues Rätsel, von vorn, Fehler prüfen, „Fehler sofort zeigen“
- Zoomen: mit zwei Fingern, mit Strg + Mausrad oder mit − / +; wischen zum Verschieben
- Pause: auf die Uhr tippen (oder `P`); Zurück-Taste des Handys führt zur Übersicht
- „Weiterspielen“ oben auf der Startseite zeigt angefangene Rätsel mit Fortschritt
- Fortschritt, Zeit und Bestzeiten werden lokal im Browser gespeichert
- Rätsel werden im Hintergrund (Web Worker) vorbereitet, das nächste startet meist sofort

## Starten

Keine Abhängigkeiten, kein Build nötig:

```bash
python3 -m http.server 8000   # dann http://localhost:8000 öffnen
```

`index.html` funktioniert auch direkt per Doppelklick. Über HTTP(S) ausgeliefert ist die Seite eine
installierbare Web-App (Manifest + Service Worker, offline spielbar).

```bash
node tools/test.js              # erzeugt jede Variante und prüft Regeln + Eindeutigkeit
node tools/build.js             # baut dist/sudoku-mosaik.html (alles in einer Datei)
```

## Aufbau

| Datei | Inhalt |
| --- | --- |
| `js/engine.js` | Constraint-Löser (Bitmasken, Propagation, Käfig-Kombinationen, Backtracking) |
| `js/generator.js` | Varianten, Layouts, Erzeugung von Lösung und Hinweisen, Entfernen der Vorgaben |
| `js/app.js` | Oberfläche: SVG-Spielfeld, Eingabe, Notizen, Zoom, Speichern |
| `css/style.css` | Gestaltung inkl. Dunkelmodus |

Ein Rätsel ist nur eine Menge von Regeln („Häuser“ mit 1–9, Käfige, Paarbeziehungen, Summen, Parität),
daher lassen sich neue Varianten und Formen mit wenigen Zeilen in `generator.js` ergänzen.

## Später als App

Der Code ist reines HTML/CSS/JS und kann unverändert mit z. B. [Capacitor](https://capacitorjs.com/)
als Android-/iOS-App verpackt werden (`dist/sudoku-mosaik.html` oder der ganze Ordner als `webDir`).

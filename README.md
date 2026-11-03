# Sudoku Mosaik

Spielbare Sudoku-Varianten im Browser, inspiriert vom „Super Sudoku“ (acht verschachtelte Sudokus mit verschiedenen Regeln).
Alle Rätsel werden **neu erzeugt** und haben **genau eine Lösung**.

## Rätsel

**Riesen-Rätsel** (mehrere Gitter teilen sich Blöcke)

| Name | Form |
| --- | --- |
| Super-Sudoku | 8 Gitter im Ring (33 × 33): Klassisch, >Sudoku<, Addition, Killer, Nachbarn, Sudoku X, Seltsame Boxen, Farben |
| Super-Mix | gleicher Ring, Regeln zufällig verteilt |
| Samurai / Samurai-Mix | 5 Gitter (21 × 21) |
| Doppel | 2 Gitter, ein gemeinsamer Block |

**Einzelne Varianten:** Klassisch, Killer, >Sudoku< (Größer/Kleiner), Addition, Nachbar-Sudoku (Consecutive),
Sudoku X, Seltsame Boxen (Jigsaw), Farb-Sudoku (Offset), Fenster (Windoku), Gerade/Ungerade, Anti-Springer.

Drei Schwierigkeitsstufen: *Leicht* und *Mittel* sind ohne Raten lösbar, *Schwer* hat die wenigsten Vorgaben.

## Bedienung

- Feld antippen, dann Ziffer im Zahlenfeld wählen (oder Tastatur `1`–`9`, Pfeiltasten, `Entf`)
- **Notizen** (`N` / Leertaste), **Löschen**, **Zurück** (`Strg+Z`), **Tipp** (`H`)
- Menü (⋮): neues Rätsel, von vorn, Fehler prüfen, „Fehler sofort zeigen“
- Riesen-Rätsel: mit − / + zoomen und wischen zum Verschieben
- Fortschritt, Zeit und Bestzeiten werden lokal im Browser gespeichert

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

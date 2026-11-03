/*
 * Sudoku Mosaik – Rätselgenerator
 * Erzeugt einzelne Varianten und verschachtelte Riesen-Rätsel (Doppel, Samurai, Super-Ring).
 * Jedes Rätsel hat genau eine Lösung.
 */
(function generatorFactory(root) {
  'use strict';
  const E = root.SudokuEngine || (typeof require !== 'undefined' ? require('./engine.js') : null);
  const { rng, compile, solve } = E;

  /* ---------- Varianten ---------- */
  // cls: Darstellungsklasse – zwei Gitter mit gemeinsamem Block dürfen nicht dieselbe haben,
  // sonst überlagern sich ihre Markierungen.
  const TYPES = {
    classic:     { name: 'Klassisch',        short: 'Klassisch', cls: null,
      rule: 'Jede Zeile, Spalte und jeder 3×3-Block enthält die Ziffern 1–9 genau einmal.' },
    killer:      { name: 'Killer-Sudoku',    short: 'Killer', cls: 'cage',
      rule: 'Die kleine Zahl in einem gestrichelten Käfig ist die Summe seiner Ziffern. Innerhalb eines Käfigs wiederholt sich keine Ziffer.' },
    greater:     { name: '>Sudoku<',         short: 'Größer/Kleiner', cls: 'edge',
      rule: 'Die Zeichen zwischen zwei Feldern müssen stimmen: Die Spitze zeigt immer auf die kleinere Ziffer.' },
    addition:    { name: 'Additions-Sudoku', short: 'Addition', cls: 'fill',
      rule: 'Die blauen Felder einer Gruppe ergeben addiert die Ziffer im angrenzenden roten Feld.' },
    consecutive: { name: 'Nachbar-Sudoku',   short: 'Nachbarn', cls: 'edge',
      rule: 'Ein rosa Steg verbindet zwei Nachbarfelder genau dann, wenn ihre Ziffern direkt aufeinanderfolgen (z. B. 4 und 5). Ohne Steg folgen Nachbarn nie aufeinander.' },
    x:           { name: 'Sudoku X',         short: 'Diagonal', cls: null,
      rule: 'Auch die beiden roten Diagonalen enthalten die Ziffern 1–9 genau einmal.' },
    jigsaw:      { name: 'Seltsame Boxen',   short: 'Seltsame Boxen', cls: null,
      rule: 'Statt 3×3-Blöcken gibt es unregelmäßige Gebiete (dicke Linien). Jedes enthält 1–9 genau einmal.' },
    offset:      { name: 'Farb-Sudoku',      short: 'Farben', cls: 'fill',
      rule: 'Zusätzlich enthalten alle Felder einer Farbe die Ziffern 1–9 genau einmal.' },
    windoku:     { name: 'Fenster-Sudoku',   short: 'Fenster', cls: 'fill',
      rule: 'Auch die vier hinterlegten Fenster (3×3) enthalten die Ziffern 1–9 genau einmal.' },
    evenodd:     { name: 'Gerade/Ungerade',  short: 'Gerade/Ungerade', cls: null,
      rule: 'In ein Feld mit Quadrat gehört eine gerade Ziffer, in ein Feld mit Kreis eine ungerade.' },
    liar:        { name: 'Lügen-Käfige',     short: 'Lügner', cls: 'cage',
      rule: 'Wie Killer, aber jede Käfigzahl lügt: Die echte Summe ist um genau 1 größer oder kleiner als angegeben. Im Käfig wiederholt sich keine Ziffer.' },
    lever:       { name: 'Hebel-Sudoku',     short: 'Hebel', cls: 'line',
      rule: 'Jeder Balken ist ein Hebel im Gleichgewicht, das Dreieck ist der Drehpunkt. Ziffer × Abstand zum Drehpunkt, aufsummiert, ist links und rechts gleich. Beispiel: 3 4 ▲ 6 2 → 3·2 + 4·1 = 6·1 + 2·2. Das Feld am Drehpunkt zählt nicht.' },
    compass:     { name: 'Kompass-Sudoku',   short: 'Kompass', cls: 'line',
      rule: 'Geht man von einem Pfeilfeld so viele Felder in Pfeilrichtung, wie seine Ziffer angibt, landet man bei einem ausgefüllten Pfeil auf einer 9, bei einem hohlen Pfeil (nur Umriss) auf einer 1.' },
    lines:       { name: 'Linien-Labyrinth', short: 'Linien', cls: 'line',
      rule: 'Grau (Thermometer): Ziffern steigen von der Kugel aus. Grün (Flüstern): Nachbarn auf der Linie unterscheiden sich um mindestens 5. Lila (Kette): aufeinanderfolgende Ziffern in beliebiger Reihenfolge, ohne Wiederholung. Orange (Palindrom): von beiden Enden gelesen gleich.' },
    antiknight:  { name: 'Anti-Springer',    short: 'Anti-Springer', cls: null,
      rule: 'Zwei Felder, die einen Rösselsprung (wie beim Schach) auseinanderliegen, haben nie dieselbe Ziffer.' },
  };

  /* Position der Teilgitter in Block-Einheiten (Zeile, Spalte der linken oberen Ecke). */
  const LAYOUTS = {
    single:  [[0, 0]],
    twin:    [[0, 0], [2, 2]],
    samurai: [[0, 0], [0, 4], [2, 2], [4, 0], [4, 4]],
    ring:    [[0, 4], [2, 2], [2, 6], [4, 0], [4, 8], [6, 2], [6, 6], [8, 4]],
  };

  const MIX_POOL = ['killer', 'greater', 'addition', 'consecutive', 'x', 'jigsaw', 'offset', 'windoku', 'evenodd', 'antiknight', 'classic'];

  const CATALOG = [
    { id: 'super', group: 'giant', name: 'Super-Sudoku', layout: 'ring',
      types: ['classic', 'greater', 'addition', 'killer', 'consecutive', 'x', 'jigsaw', 'offset'],
      blurb: 'Acht verschachtelte Sudokus mit acht verschiedenen Regeln. Die gemeinsamen Blöcke müssen für beide Gitter stimmen.' },
    { id: 'super-mix', group: 'giant', name: 'Super-Mix', layout: 'ring', types: 'mix',
      blurb: 'Der gleiche Achter-Ring, aber jedes Mal mit neu ausgewürfelten Regeln.' },
    { id: 'samurai', group: 'giant', name: 'Samurai', layout: 'samurai', types: ['classic', 'classic', 'classic', 'classic', 'classic'],
      blurb: 'Fünf klassische Sudokus, das mittlere teilt seine Ecken mit den vier äußeren.' },
    { id: 'samurai-mix', group: 'giant', name: 'Samurai-Mix', layout: 'samurai', types: 'mix',
      blurb: 'Samurai-Form mit fünf verschiedenen Varianten.' },
    { id: 'twin', group: 'giant', name: 'Doppel', layout: 'twin', types: 'mix',
      blurb: 'Zwei Varianten, die sich einen Block teilen. Guter Einstieg in die Riesen-Rätsel.' },
  ];
  CATALOG.push(
    { id: 'liar', group: 'master', name: 'Lügen-Käfige', layout: 'single', types: ['liar'], fixed: 'extreme',
      blurb: 'Killer mit kaum Vorgaben, bei dem keine einzige Käfigzahl stimmt. Die 45er-Regel wird zum Rätsel für sich.' },
    { id: 'lever', group: 'master', name: 'Hebel-Sudoku', layout: 'single', types: ['lever'], fixed: 'extreme',
      blurb: 'Balken mit Drehpunkt: Ziffern wirken mit ihrem Abstand wie Gewichte. Gleichungen mit Hebelgesetz statt Summen.' },
    { id: 'compass', group: 'master', name: 'Kompass-Sudoku', layout: 'single', types: ['compass'], fixed: 'extreme',
      blurb: 'Pfeile, deren Länge die Ziffer selbst ist. Jede Ziffer entscheidet, wo eine 9 oder 1 liegt, und umgekehrt.' },
    { id: 'lines', group: 'master', name: 'Linien-Labyrinth', layout: 'single', types: ['lines'], fixed: 'extreme',
      blurb: 'Vier Linienarten mit vier Gesetzen in einem Gitter: Thermometer, Flüstern, Kette und Palindrom.' },
  );
  for (const t of ['classic', 'killer', 'greater', 'addition', 'consecutive', 'x', 'jigsaw', 'offset', 'windoku', 'evenodd', 'antiknight']) {
    CATALOG.push({ id: t, group: 'single', name: TYPES[t].name, layout: 'single', types: [t], blurb: TYPES[t].rule });
  }

  // logic: nur ohne Raten lösbare Rätsel zulassen; guess: Suchknoten-Budget für "Schwer"
  // extra: zusätzliche Vorgaben pro 81 Felder
  const DIFFICULTY = {
    easy:   { name: 'Leicht', logic: true,  extra: 10 },
    medium: { name: 'Mittel', logic: true,  extra: 2 },
    hard:   { name: 'Schwer', logic: false, guess: 40, extra: 0 },
    extreme: { name: 'Extrem', logic: false, guess: 140, extra: 0 },
  };

  /* ---------- Hilfen ---------- */
  const D4 = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  const KNIGHT = [[1, 2], [2, 1], [2, -1], [1, -2]];

  function boxesOf(pos) {
    const s = new Set();
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) s.add((pos[0] + r) + ',' + (pos[1] + c));
    return s;
  }

  function adjacencyOf(layout) {
    const sets = layout.map(boxesOf);
    return layout.map((_, i) => layout.map((__, j) => {
      if (i === j) return false;
      for (const b of sets[i]) if (sets[j].has(b)) return true;
      return false;
    }));
  }

  /* Zufällige Regelverteilung für Mix-Rätsel: Nachbarn haben verschiedene Typen und Darstellungsklassen. */
  function assignMix(layout, R) {
    const adj = adjacencyOf(layout);
    for (let attempt = 0; attempt < 200; attempt++) {
      const types = [];
      let ok = true;
      for (let i = 0; i < layout.length && ok; i++) {
        const opts = R.shuffle(MIX_POOL.slice()).filter((t) => {
          if (types.includes(t) && layout.length <= MIX_POOL.length) return false;
          for (let j = 0; j < i; j++) {
            if (!adj[i][j]) continue;
            const ci = TYPES[t].cls, cj = TYPES[types[j]].cls;
            if (ci && ci === cj) return false;
          }
          return true;
        });
        if (!opts.length) ok = false; else types.push(opts[0]);
      }
      if (ok) return types;
    }
    return layout.map(() => 'classic');
  }

  /* Unregelmäßige Gebiete: Start mit 3×3-Blöcken, dann zufällige Tauschzüge, die zusammenhängend bleiben. */
  function jigsawRegions(R, locked) {
    const reg = new Int8Array(81);
    for (let i = 0; i < 81; i++) reg[i] = Math.floor(i / 27) * 3 + Math.floor((i % 9) / 3);
    const nb = (i) => {
      const r = Math.floor(i / 9), c = i % 9, out = [];
      for (const [dr, dc] of D4) {
        const rr = r + dr, cc = c + dc;
        if (rr >= 0 && rr < 9 && cc >= 0 && cc < 9) out.push(rr * 9 + cc);
      }
      return out;
    };
    const connected = (rid) => {
      const cells = [];
      for (let i = 0; i < 81; i++) if (reg[i] === rid) cells.push(i);
      if (cells.length !== 9) return false;
      const seen = new Set([cells[0]]);
      const stack = [cells[0]];
      while (stack.length) {
        const x = stack.pop();
        for (const y of nb(x)) if (reg[y] === rid && !seen.has(y)) { seen.add(y); stack.push(y); }
      }
      return seen.size === 9;
    };
    let moved = 0;
    for (let step = 0; step < 3000 && moved < 60; step++) {
      const a = R.int(81);
      const ra = reg[a];
      if (locked.has(ra)) continue;
      const others = nb(a).filter((b) => reg[b] !== ra && !locked.has(reg[b]));
      if (!others.length) continue;
      const rb = reg[R.pick(others)];
      // Ein Feld c aus rb, das an ra grenzt, wandert im Tausch nach ra
      const cs = [];
      for (let i = 0; i < 81; i++) {
        if (reg[i] === rb && nb(i).some((y) => y !== a && reg[y] === ra)) cs.push(i);
      }
      if (!cs.length) continue;
      const c = R.pick(cs);
      reg[a] = rb; reg[c] = ra;
      if (connected(ra) && connected(rb)) moved++;
      else { reg[a] = ra; reg[c] = rb; }
    }
    return Array.from(reg);
  }

  /* ---------- Aufbau ---------- */
  function buildLayout(layoutPos, types, R) {
    let rows = 0, cols = 0;
    for (const [br, bc] of layoutPos) { rows = Math.max(rows, (br + 3) * 3); cols = Math.max(cols, (bc + 3) * 3); }
    const map = new Map();
    const cells = [];
    const adj = adjacencyOf(layoutPos);
    const grids = layoutPos.map(([br, bc], gi) => {
      const ids = [];
      for (let lr = 0; lr < 9; lr++) {
        for (let lc = 0; lc < 9; lc++) {
          const r = br * 3 + lr, c = bc * 3 + lc, key = r * cols + c;
          if (!map.has(key)) { map.set(key, cells.length); cells.push([r, c]); }
          ids.push(map.get(key));
        }
      }
      return { type: types[gi], br, bc, ids };
    });
    // Welche Blöcke eines Gitters werden mit anderen geteilt?
    grids.forEach((g, gi) => {
      g.shared = [];
      for (let b = 0; b < 9; b++) {
        const key = (g.br + Math.floor(b / 3)) + ',' + (g.bc + (b % 3));
        let s = false;
        layoutPos.forEach((p, j) => { if (j !== gi && adj[gi][j] && boxesOf(p).has(key)) s = true; });
        if (s) g.shared.push(b);
      }
    });
    return { rows, cols, cells, grids };
  }

  function addBaseConstraints(L, R) {
    const houses = [];
    const houseKeys = new Set();
    const distinct = [];
    const addHouse = (ids) => {
      const key = ids.slice().sort((a, b) => a - b).join(',');
      if (houseKeys.has(key)) return;
      houseKeys.add(key);
      houses.push(ids);
    };
    for (const g of L.grids) {
      const id = (r, c) => g.ids[r * 9 + c];
      // Gebiete
      if (g.type === 'jigsaw') g.region = jigsawRegions(R, new Set(g.shared));
      else g.region = Array.from({ length: 81 }, (_, i) => Math.floor(i / 27) * 3 + Math.floor((i % 9) / 3));
      for (let k = 0; k < 9; k++) {
        const row = [], col = [];
        for (let j = 0; j < 9; j++) { row.push(id(k, j)); col.push(id(j, k)); }
        addHouse(row); addHouse(col);
      }
      for (let rg = 0; rg < 9; rg++) {
        const h = [];
        for (let i = 0; i < 81; i++) if (g.region[i] === rg) h.push(g.ids[i]);
        addHouse(h);
      }
      if (g.type === 'x') {
        const d1 = [], d2 = [];
        for (let k = 0; k < 9; k++) { d1.push(id(k, k)); d2.push(id(k, 8 - k)); }
        addHouse(d1); addHouse(d2);
      }
      if (g.type === 'windoku') {
        for (const [r0, c0] of [[1, 1], [1, 5], [5, 1], [5, 5]]) {
          const h = [];
          for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) h.push(id(r0 + r, c0 + c));
          addHouse(h);
        }
      }
      if (g.type === 'offset') {
        const perm = R.shuffle([0, 1, 2, 3, 4, 5, 6, 7, 8]);
        g.colors = [];
        for (let i = 0; i < 81; i++) {
          const r = Math.floor(i / 9), c = i % 9;
          g.colors.push(perm[(r % 3) * 3 + (c % 3)]);
        }
        for (let p = 0; p < 9; p++) {
          const h = [];
          for (let i = 0; i < 81; i++) if (g.colors[i] === p) h.push(g.ids[i]);
          addHouse(h);
        }
      }
      if (g.type === 'antiknight') {
        for (let r = 0; r < 9; r++) {
          for (let c = 0; c < 9; c++) {
            for (const [dr, dc] of KNIGHT) {
              const rr = r + dr, cc = c + dc;
              if (rr >= 0 && rr < 9 && cc >= 0 && cc < 9) distinct.push([id(r, c), id(rr, cc)]);
            }
          }
        }
      }
    }
    return { houses, distinct };
  }

  /* Killer-Aufteilung in Käfige (lokale Feldindizes) */
  function killerPartition(g, sol, R) {
    const inGrid = (r, c) => r >= 0 && r < 9 && c >= 0 && c < 9;
    const cageOf = new Int16Array(81).fill(-1);
    const list = [];
    for (const start of R.shuffle([...Array(81).keys()])) {
      if (cageOf[start] >= 0) continue;
      const roll = R();
      const size = roll < 0.08 ? 1 : roll < 0.38 ? 2 : roll < 0.75 ? 3 : roll < 0.93 ? 4 : 5;
      const cage = [start];
      const vals = new Set([sol[g.ids[start]]]);
      cageOf[start] = list.length;
      while (cage.length < size) {
        const front = [];
        for (const x of cage) {
          const r = Math.floor(x / 9), c = x % 9;
          for (const [dr, dc] of D4) {
            const rr = r + dr, cc = c + dc;
            if (!inGrid(rr, cc)) continue;
            const y = rr * 9 + cc;
            if (cageOf[y] < 0 && !vals.has(sol[g.ids[y]]) && !front.includes(y)) front.push(y);
          }
        }
        if (!front.length) break;
        const y = R.pick(front);
        cage.push(y); vals.add(sol[g.ids[y]]); cageOf[y] = list.length;
      }
      list.push(cage);
    }
    // Einzelfelder möglichst an Nachbarkäfige anhängen
    list.forEach((cage, ci) => {
      if (cage.length !== 1) return;
      const x = cage[0], r = Math.floor(x / 9), c = x % 9;
      for (const [dr, dc] of R.shuffle(D4.slice())) {
        const rr = r + dr, cc = c + dc;
        if (!inGrid(rr, cc)) continue;
        const other = cageOf[rr * 9 + cc];
        const oc = list[other];
        if (oc.length < 5 && !oc.some((y) => sol[g.ids[y]] === sol[g.ids[x]])) {
          oc.push(x); cageOf[x] = other; list[ci] = [];
          return;
        }
      }
    });
    return list.filter((c) => c.length);
  }

  /* ---------- Hinweise aus der Lösung ableiten ---------- */
  function deriveClues(L, sol, R, cellGridCount) {
    const cages = [], pairs = [], sums = [], parity = [], lines = [], levers = [], arrows = [];
    for (const g of L.grids) {
      const id = (r, c) => g.ids[r * 9 + c];
      const inGrid = (r, c) => r >= 0 && r < 9 && c >= 0 && c < 9;

      if (g.type === 'killer' || g.type === 'liar') {
        for (const cage of killerPartition(g, sol, R)) {
          const cellsG = cage.map((x) => g.ids[x]);
          const sum = cellsG.reduce((acc, v) => acc + sol[v], 0);
          if (g.type === 'killer') { cages.push({ cells: cellsG, sum }); continue; }
          // Lügen-Käfig: angezeigt wird sum±1; bevorzugt so, dass beide Deutungen möglich bleiben
          const k = cellsG.length, mn = k * (k + 1) / 2, mx = k * (19 - k) / 2;
          const opts = R.shuffle([sum - 1, sum + 1]).filter((D) => D >= 1);
          const amb = opts.filter((D) => { const other = D * 2 - sum; return other >= mn && other <= mx; });
          cages.push({ cells: cellsG, sum: (amb[0] || opts[0]), liar: true });
        }
      }

      if (g.type === 'lever') {
        const cand = [];
        for (const horiz of [true, false]) {
          for (let k = 0; k < 9; k++) for (let a = 0; a < 9; a++) for (let L = 4; L <= 7 && a + L <= 9; L++) {
            const cells = [];
            for (let i = 0; i < L; i++) cells.push(horiz ? k * 9 + a + i : (a + i) * 9 + k);
            for (let f = 1; f <= L - 2; f++) {
              let t = 0;
              cells.forEach((x, i) => { t += (i - f) * sol[g.ids[x]]; });
              if (t === 0) cand.push({ cells, f, score: L * 0.6 + R() * 5 });
            }
          }
        }
        cand.sort((x, y) => y.score - x.score);
        const used = new Uint8Array(81);
        let count = 0;
        for (const c of cand) {
          if (count >= 11) break;
          if (c.cells.some((x) => used[x])) continue;
          c.cells.forEach((x) => { used[x] = 1; });
          levers.push({ cells: c.cells.map((x) => g.ids[x]), fulcrum: c.f });
          count++;
        }
      }

      if (g.type === 'compass') {
        const cand = [];
        for (let x = 0; x < 81; x++) {
          const v = sol[g.ids[x]], r = Math.floor(x / 9), c = x % 9;
          for (const [dr, dc] of E.DIRS8) {
            const rr = r + dr * v, cc = c + dc * v;
            if (!inGrid(rr, cc)) continue;
            const tv = sol[g.ids[rr * 9 + cc]];
            if (tv === 9 || tv === 1) cand.push({ x, dr, dc, digit: tv });
          }
        }
        R.shuffle(cand);
        const usedCell = new Set();
        let n9 = 0, n1 = 0;
        for (const a of cand) {
          if (usedCell.has(a.x)) continue;
          if (a.digit === 9 ? n9 >= 9 : n1 >= 7) continue;
          usedCell.add(a.x);
          a.digit === 9 ? n9++ : n1++;
          const r = Math.floor(a.x / 9), c = a.x % 9, targets = [-1];
          for (let d = 1; d <= 9; d++) {
            const rr = r + a.dr * d, cc = c + a.dc * d;
            targets.push(inGrid(rr, cc) ? g.ids[rr * 9 + cc] : -1);
          }
          arrows.push({ cell: g.ids[a.x], dir: [a.dr, a.dc], digit: a.digit, targets });
        }
      }

      if (g.type === 'lines') {
        const used = new Uint8Array(81);
        const diag = new Set();
        const val = (x) => sol[g.ids[x]];
        const nb8 = (x) => {
          const r = Math.floor(x / 9), c = x % 9, out = [];
          for (const [dr, dc] of E.DIRS8) if (inGrid(r + dr, c + dc)) out.push((r + dr) * 9 + c + dc);
          return out;
        };
        const ekey = (a, b) => a < b ? a + '-' + b : b + '-' + a;
        // Diagonale Schritte dürfen sich nicht kreuzen
        const stepOk = (a, b) => {
          const ra = Math.floor(a / 9), ca = a % 9, rb = Math.floor(b / 9), cb = b % 9;
          if (ra === rb || ca === cb) return true;
          return !diag.has(ekey(ra * 9 + cb, rb * 9 + ca));
        };
        const commit = (path, type) => {
          path.forEach((x) => { used[x] = 1; });
          for (let i = 0; i + 1 < path.length; i++) diag.add(ekey(path[i], path[i + 1]));
          lines.push({ type, cells: path.map((x) => g.ids[x]) });
        };
        const walk = (len, ok) => {
          const free = [...Array(81).keys()].filter((x) => !used[x]);
          const start = R.pick(free);
          const path = [start];
          while (path.length < len) {
            const last = path[path.length - 1];
            const nx = R.shuffle(nb8(last).filter((y) => !used[y] && !path.includes(y) && stepOk(last, y) && ok(path, y)));
            if (!nx.length) break;
            path.push(nx[0]);
          }
          return path;
        };
        const want = { thermo: 3, whisper: 3, renban: 2, palindrome: 2 };
        const got = { thermo: 0, whisper: 0, renban: 0, palindrome: 0 };
        for (let attempt = 0; attempt < 3000; attempt++) {
          const type = ['thermo', 'whisper', 'renban', 'palindrome'][attempt % 4];
          if (got[type] >= want[type]) { if (Object.keys(want).every((t) => got[t] >= want[t])) break; continue; }
          let path = null;
          if (type === 'thermo') {
            const p = walk(4 + R.int(3), (pa, y) => val(y) > val(pa[pa.length - 1]));
            if (p.length >= 4) path = p;
          } else if (type === 'whisper') {
            const p = walk(4 + R.int(3), (pa, y) => Math.abs(val(y) - val(pa[pa.length - 1])) >= 5);
            if (p.length >= 4) path = p;
          } else if (type === 'renban') {
            const k = 3 + R.int(3);
            const p = walk(k, (pa, y) => {
              const vs = pa.map(val);
              if (vs.includes(val(y))) return false;
              return Math.max(...vs, val(y)) - Math.min(...vs, val(y)) <= k - 1;
            });
            if (p.length === k) path = p;
          } else {
            const free = [...Array(81).keys()].filter((x) => !used[x]);
            const m = R.pick(free);
            let left = [m], right = [];
            const half = 2 + R.int(2);
            for (let h = 0; h < half; h++) {
              const le = left[left.length - 1], re = right.length ? right[right.length - 1] : m;
              const inPath = (y) => left.includes(y) || right.includes(y);
              const opts = [];
              for (const a of nb8(le)) for (const b of nb8(re)) {
                if (a !== b && !used[a] && !used[b] && !inPath(a) && !inPath(b) && val(a) === val(b) && stepOk(le, a) && stepOk(re, b)) opts.push([a, b]);
              }
              if (!opts.length) break;
              const [a, b] = R.pick(opts);
              left.push(a); right.push(b);
            }
            if (right.length >= 2) path = [...left.slice().reverse(), ...right];
          }
          if (path) { commit(path, type); got[type]++; }
        }
      }

      if (g.type === 'greater') {
        for (let r = 0; r < 9; r++) {
          for (let c = 0; c < 9; c++) {
            if (c % 3 !== 2) {
              const a = id(r, c), b = id(r, c + 1);
              pairs.push(sol[a] < sol[b] ? { a, b, type: 'lt' } : { a: b, b: a, type: 'lt' });
            }
            if (r % 3 !== 2) {
              const a = id(r, c), b = id(r + 1, c);
              pairs.push(sol[a] < sol[b] ? { a, b, type: 'lt' } : { a: b, b: a, type: 'lt' });
            }
          }
        }
      }

      if (g.type === 'consecutive') {
        for (let r = 0; r < 9; r++) {
          for (let c = 0; c < 9; c++) {
            for (const [dr, dc] of [[0, 1], [1, 0]]) {
              const rr = r + dr, cc = c + dc;
              if (!inGrid(rr, cc)) continue;
              const a = id(r, c), b = id(rr, cc);
              pairs.push({ a, b, type: Math.abs(sol[a] - sol[b]) === 1 ? 'cons' : 'noncons' });
            }
          }
        }
      }

      if (g.type === 'addition') {
        const blocked = new Uint8Array(81);
        // Felder in geteilten Blöcken bleiben frei, damit sich keine Farben überlagern
        for (let i = 0; i < 81; i++) if (cellGridCount[g.ids[i]] > 1) blocked[i] = 1;
        const nbs = (x) => {
          const r = Math.floor(x / 9), c = x % 9, out = [];
          for (const [dr, dc] of D4) if (inGrid(r + dr, c + dc)) out.push((r + dr) * 9 + c + dc);
          return out;
        };
        let groups = 0;
        const want = 9 + R.int(3);
        for (let attempt = 0; attempt < 400 && groups < want; attempt++) {
          const t = R.int(81);
          if (blocked[t]) continue;
          const v = sol[g.ids[t]];
          if (v < 3) continue;
          const k = v >= 6 && R() < 0.6 ? 3 : 2;
          // Tiefensuche nach k zusammenhängenden Feldern mit Summe v, eines davon neben t
          let found = null;
          const dfs = (set, sum) => {
            if (found) return;
            if (set.length === k) { if (sum === v) found = set.slice(); return; }
            const front = [];
            const base = set.length ? set : [t];
            for (const x of base) for (const y of nbs(x)) {
              if (y !== t && !blocked[y] && !set.includes(y) && !front.includes(y)) front.push(y);
            }
            for (const y of R.shuffle(front)) {
              const val = sol[g.ids[y]];
              if (sum + val > v) continue;
              set.push(y); dfs(set, sum + val); set.pop();
              if (found) return;
            }
          };
          dfs([], 0);
          if (!found) continue;
          for (const x of [...found, t]) { blocked[x] = 1; for (const y of nbs(x)) blocked[y] = 1; }
          sums.push({ cells: found.map((x) => g.ids[x]), target: g.ids[t] });
          groups++;
        }
      }

      if (g.type === 'evenodd') {
        const pick = R.shuffle([...Array(81).keys()]).slice(0, 30);
        for (const x of pick) parity.push([g.ids[x], sol[g.ids[x]] % 2 === 0 ? 'e' : 'o']);
      }
    }
    return { cages, pairs, sums, parity, lines, levers, arrows };
  }

  /* ---------- Generierung (als Generator, damit die Oberfläche flüssig bleibt) ---------- */
  function* generateSteps(specId, difficulty, seed) {
    const spec = CATALOG.find((s) => s.id === specId);
    if (!spec) throw new Error('Unbekannte Variante: ' + specId);
    const R = rng(seed);
    const layoutPos = LAYOUTS[spec.layout];
    if (spec.fixed) difficulty = spec.fixed;
    const diff = DIFFICULTY[difficulty] || DIFFICULTY.medium;

    let L, base, full;
    for (let attempt = 0; attempt < 40; attempt++) {
      const types = spec.types === 'mix' ? assignMix(layoutPos, R) : spec.types.slice();
      L = buildLayout(layoutPos, types, R);
      base = addBaseConstraints(L, R);
      const C0 = compile({ n: L.cells.length, houses: base.houses, distinct: base.distinct });
      yield { phase: 'solution', progress: 0.02 };
      const res = solve(C0, null, { limit: 1, maxNodes: 4000, rand: R });
      if (res.count) { full = res.solution; break; }
    }
    if (!full) throw new Error('Konnte keine Lösung erzeugen');

    const n = L.cells.length;
    const cellGridCount = new Uint8Array(n);
    for (const g of L.grids) for (const x of g.ids) cellGridCount[x]++;
    const clues = deriveClues(L, full, R, cellGridCount);
    const P = {
      n,
      houses: base.houses,
      distinct: base.distinct,
      cages: clues.cages,
      pairs: clues.pairs,
      sums: clues.sums,
      parity: clues.parity,
      lines: clues.lines,
      levers: clues.levers,
      arrows: clues.arrows,
    };
    const C = compile(P);

    // Vorgaben entfernen, solange das Rätsel eindeutig bleibt
    const givens = full.slice();
    const order = R.shuffle([...Array(n).keys()]);
    const removed = [];
    const step = Math.max(1, Math.floor(n / 60));
    for (let i = 0; i < order.length; i++) {
      const x = order[i];
      const val = givens[x];
      givens[x] = 0;
      let keep;
      if (diff.logic) {
        keep = !E.solvesByLogic(C, givens);
      } else if (E.solvesByLogic(C, givens)) {
        keep = false; // ohne Raten lösbar -> sicher eindeutig, teure Suche unnötig
      } else {
        // Eine Suche genügt: eindeutig UND innerhalb des Rate-Budgets?
        const budget = Math.round(diff.guess * (n / 81));
        const res = solve(C, givens, { limit: 2, maxNodes: budget + 1 });
        keep = res.aborted || res.count !== 1 || res.nodes > budget;
      }
      if (keep) givens[x] = val;
      else removed.push(x);
      if (i % step === 0) yield { phase: 'reduce', progress: 0.05 + 0.93 * (i / order.length) };
    }

    // Leichtere Stufen: einige Ziffern zurückgeben
    const extra = Math.round(diff.extra * n / 81);
    R.shuffle(removed);
    for (let i = 0; i < Math.min(extra, removed.length); i++) givens[removed[i]] = full[removed[i]];

    yield { phase: 'done', progress: 1 };
    return {
      v: 1,
      variant: spec.id,
      name: spec.name,
      difficulty,
      seed,
      rows: L.rows,
      cols: L.cols,
      cells: L.cells,
      grids: L.grids.map((g) => ({
        type: g.type, br: g.br, bc: g.bc, ids: g.ids, region: g.region, colors: g.colors || null,
      })),
      ...P,
      givens,
      solution: full,
    };
  }

  function generate(specId, difficulty, seed) {
    const it = generateSteps(specId, difficulty, seed);
    for (;;) {
      const r = it.next();
      if (r.done) return r.value;
    }
  }

  const api = { TYPES, LAYOUTS, CATALOG, DIFFICULTY, generateSteps, generate };
  api.factory = generatorFactory; // Quelltext für den Hintergrund-Worker
  root.SudokuGenerator = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);

/*
 * Sudoku Mosaik – Rätselgenerator
 * Erzeugt einzelne Varianten und verschachtelte Riesen-Rätsel (Doppel, Samurai, Super-Ring).
 * Jedes Rätsel hat genau eine Lösung.
 */
(function (root) {
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
  for (const t of ['classic', 'killer', 'greater', 'addition', 'consecutive', 'x', 'jigsaw', 'offset', 'windoku', 'evenodd', 'antiknight']) {
    CATALOG.push({ id: t, group: 'single', name: TYPES[t].name, layout: 'single', types: [t], blurb: TYPES[t].rule });
  }

  // logic: nur ohne Raten lösbare Rätsel zulassen; guess: Suchknoten-Budget für "Schwer"
  // extra: zusätzliche Vorgaben pro 81 Felder
  const DIFFICULTY = {
    easy:   { name: 'Leicht', logic: true,  extra: 10 },
    medium: { name: 'Mittel', logic: true,  extra: 2 },
    hard:   { name: 'Schwer', logic: false, guess: 40, extra: 0 },
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

  /* ---------- Hinweise aus der Lösung ableiten ---------- */
  function deriveClues(L, sol, R, cellGridCount) {
    const cages = [], pairs = [], sums = [], parity = [];
    for (const g of L.grids) {
      const id = (r, c) => g.ids[r * 9 + c];
      const inGrid = (r, c) => r >= 0 && r < 9 && c >= 0 && c < 9;

      if (g.type === 'killer') {
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
        for (const cage of list) {
          if (!cage.length) continue;
          const cellsG = cage.map((x) => g.ids[x]);
          cages.push({ cells: cellsG, sum: cellsG.reduce((s, v) => s + sol[v], 0) });
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
    return { cages, pairs, sums, parity };
  }

  /* ---------- Generierung (als Generator, damit die Oberfläche flüssig bleibt) ---------- */
  function* generateSteps(specId, difficulty, seed) {
    const spec = CATALOG.find((s) => s.id === specId);
    if (!spec) throw new Error('Unbekannte Variante: ' + specId);
    const R = rng(seed);
    const layoutPos = LAYOUTS[spec.layout];
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
      } else {
        const res = solve(C, givens, { limit: 1, maxNodes: 3000, exclude: { cell: x, val } });
        keep = res.count > 0 || res.aborted;
        if (!keep) keep = solve(C, givens, { limit: 2, maxNodes: diff.guess * 8 }).nodes > diff.guess * (n / 81);
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
  root.SudokuGenerator = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);

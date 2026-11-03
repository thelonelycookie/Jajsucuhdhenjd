/*
 * Sudoku Mosaik – Löser-Kern
 * Generischer Constraint-Löser für beliebige (auch verschachtelte) Sudoku-Varianten.
 * Kandidaten werden als Bitmasken gespeichert: Ziffer d -> Bit (1 << (d-1)).
 */
(function engineFactory(root) {
  'use strict';

  const ALL = 511;
  const POP = new Uint8Array(512);
  const MIN = new Uint8Array(512);
  const MAX = new Uint8Array(512);
  for (let m = 1; m < 512; m++) {
    let p = 0, mn = 0, mx = 0;
    for (let d = 1; d <= 9; d++) {
      if (m & (1 << (d - 1))) { p++; if (!mn) mn = d; mx = d; }
    }
    POP[m] = p; MIN[m] = mn; MAX[m] = mx;
  }
  const BIT = (d) => 1 << (d - 1);

  function rangeMask(lo, hi) {
    if (lo < 1) lo = 1;
    if (hi > 9) hi = 9;
    if (lo > hi) return 0;
    return ((1 << hi) - 1) & ~((1 << (lo - 1)) - 1);
  }

  /* Deterministischer Zufallsgenerator (mulberry32) – gleicher Seed, gleiches Rätsel. */
  function rng(seed) {
    let a = seed >>> 0;
    const f = function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    for (let k = 0; k < 6; k++) f(); // Aufwärmen, damit ähnliche Seeds verschieden starten
    f.int = (n) => Math.floor(f() * n);
    f.pick = (arr) => arr[f.int(arr.length)];
    f.shuffle = (arr) => {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = f.int(i + 1);
        const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
      }
      return arr;
    };
    return f;
  }

  /* Binäre Beziehungen zwischen zwei Feldern a und b. */
  const RELATIONS = {
    lt: (a, b) => a < b,
    cons: (a, b) => Math.abs(a - b) === 1,
    noncons: (a, b) => Math.abs(a - b) !== 1,
    ne: (a, b) => a !== b,
    eq: (a, b) => a === b,                    // Palindrom
    whisper: (a, b) => Math.abs(a - b) >= 5,  // Flüsterlinie
  };
  const relCache = {};
  function relTables(type) {
    if (relCache[type]) return relCache[type];
    const test = RELATIONS[type];
    const fwd = new Uint16Array(10), bwd = new Uint16Array(10);
    for (let d = 1; d <= 9; d++) {
      for (let e = 1; e <= 9; e++) {
        if (test(d, e)) { fwd[d] |= BIT(e); bwd[e] |= BIT(d); }
      }
    }
    // Erweiterung auf ganze Masken: erlaubte Partner-Ziffern für eine Kandidatenmenge
    const fwdM = new Uint16Array(512), bwdM = new Uint16Array(512);
    for (let m = 1; m < 512; m++) {
      let f = 0, b = 0;
      for (let d = 1; d <= 9; d++) if (m & BIT(d)) { f |= fwd[d]; b |= bwd[d]; }
      fwdM[m] = f; bwdM[m] = b;
    }
    relCache[type] = { fwdM, bwdM, test };
    return relCache[type];
  }

  /* Alle Ziffernmengen (als Maske) mit k verschiedenen Ziffern und Summe s. */
  const comboCache = {};
  function comboList(k, s) {
    const key = k + ':' + s;
    if (comboCache[key]) return comboCache[key];
    const out = [];
    for (let m = 1; m < 512; m++) {
      if (POP[m] !== k) continue;
      let sum = 0;
      for (let d = 1; d <= 9; d++) if (m & BIT(d)) sum += d;
      if (sum === s) out.push(m);
    }
    comboCache[key] = Uint16Array.from(out);
    return comboCache[key];
  }

  /* Mengen aus k aufeinanderfolgenden Ziffern (Kette / Renban). */
  function runList(k) {
    const out = [];
    for (let s = 1; s + k - 1 <= 9; s++) out.push(((1 << k) - 1) << (s - 1));
    return Uint16Array.from(out);
  }

  const DIRS8 = [[-1, 0], [-1, 1], [0, 1], [1, 1], [1, 0], [1, -1], [0, -1], [-1, -1]];

  /*
   * Ein Rätsel P beschreibt nur Regeln, keine Darstellung:
   *   n          Anzahl Felder
   *   houses     Gruppen von 9 Feldern, die 1–9 genau einmal enthalten
   *   distinct   zusätzliche Paare mit verschiedenen Ziffern
   *   cages      { cells, sum } – Killer-Käfige (Ziffern verschieden)
   *   pairs      { a, b, type } – Beziehungen (lt, cons, noncons)
   *   sums       { cells, target } – Summe der cells = Ziffer im target
   *   parity     [[id, 'e'|'o'], ...]
   *   cages[].liar  Lügen-Käfig: echte Summe ist sum-1 oder sum+1
   *   lines      { type: thermo|whisper|renban|palindrome, cells }
   *   levers     { cells, fulcrum } – Drehmoment links = rechts
   *   arrows     { cell, targets[1..9], digit } – d Schritte weiter steht digit
   */
  function compile(P) {
    const n = P.n;
    const peerSets = Array.from({ length: n }, () => new Set());
    const addGroup = (ids) => {
      for (const a of ids) for (const b of ids) if (a !== b) peerSets[a].add(b);
    };
    (P.houses || []).forEach(addGroup);
    (P.cages || []).forEach((c) => addGroup(c.cells));
    (P.lines || []).forEach((l) => { if (l.type === 'renban') addGroup(l.cells); });
    (P.distinct || []).forEach(([a, b]) => { peerSets[a].add(b); peerSets[b].add(a); });
    const peers = peerSets.map((s) => Int32Array.from(s));
    const houses = (P.houses || []).map((h) => Int32Array.from(h));

    const pairs = [];
    const allPairs = (P.pairs || []).slice();
    for (const l of P.lines || []) {
      const c = l.cells;
      if (l.type === 'thermo') for (let i = 0; i + 1 < c.length; i++) allPairs.push({ a: c[i], b: c[i + 1], type: 'lt' });
      if (l.type === 'whisper') for (let i = 0; i + 1 < c.length; i++) allPairs.push({ a: c[i], b: c[i + 1], type: 'whisper' });
      if (l.type === 'palindrome') for (let i = 0; i < c.length - 1 - i; i++) allPairs.push({ a: c[i], b: c[c.length - 1 - i], type: 'eq' });
    }
    for (const p of allPairs) {
      if (p.type === 'ne') continue;
      const t = relTables(p.type);
      pairs.push({ a: p.a, b: p.b, fwdM: t.fwdM, bwdM: t.bwdM });
    }

    const lins = [];
    const cages = [];
    for (const c of P.cages || []) {
      const k = c.cells.length;
      const lo = c.liar ? c.sum - 1 : c.sum, hi = c.liar ? c.sum + 1 : c.sum;
      lins.push({ cells: Int32Array.from(c.cells), coef: new Int8Array(k).fill(1), lo, hi });
      const combos = c.liar ? Uint16Array.from([...comboList(k, c.sum - 1), ...comboList(k, c.sum + 1)]) : comboList(k, c.sum);
      cages.push({ cells: Int32Array.from(c.cells), combos });
    }
    for (const l of P.lines || []) {
      if (l.type === 'renban') cages.push({ cells: Int32Array.from(l.cells), combos: runList(l.cells.length) });
    }
    for (const s of P.sums || []) {
      const cells = Int32Array.from([...s.cells, s.target]);
      const coef = new Int8Array(cells.length).fill(1);
      coef[coef.length - 1] = -1;
      lins.push({ cells, coef, lo: 0, hi: 0 });
    }
    // Hebel: Ziffer × Abstand links = rechts  ->  Summe(k_i · v_i) = 0
    for (const lv of P.levers || []) {
      const cells = [], coef = [];
      lv.cells.forEach((id, i) => { if (i !== lv.fulcrum) { cells.push(id); coef.push(i - lv.fulcrum); } });
      lins.push({ cells: Int32Array.from(cells), coef: Int8Array.from(coef), lo: 0, hi: 0 });
    }
    const arrows = (P.arrows || []).map((a) => ({ cell: a.cell, targets: Int32Array.from(a.targets), tbit: BIT(a.digit) }));

    const init = new Uint16Array(n).fill(ALL);
    const EVEN = BIT(2) | BIT(4) | BIT(6) | BIT(8);
    for (const [id, kind] of P.parity || []) init[id] &= kind === 'e' ? EVEN : ALL & ~EVEN;

    return { n, peers, houses, pairs, lins, cages, arrows, init };
  }

  /* Constraint-Propagation bis zum Fixpunkt. Gibt false bei Widerspruch zurück. */
  function propagate(C, cand, done) {
    const { n, peers, houses, pairs, lins, cages, arrows } = C;
    let changed = true;
    while (changed) {
      changed = false;

      // 1) Feste Ziffern aus allen "Peers" streichen
      for (let i = 0; i < n; i++) {
        const m = cand[i];
        if (!m) return false;
        if (!done[i] && POP[m] === 1) {
          done[i] = 1;
          const pi = peers[i];
          for (let k = 0; k < pi.length; k++) {
            const p = pi[k];
            if (cand[p] & m) {
              cand[p] &= ~m;
              if (!cand[p]) return false;
              changed = true;
            }
          }
        }
      }
      if (changed) continue;

      // 2) Versteckte Einer in Häusern
      for (let h = 0; h < houses.length; h++) {
        const hs = houses[h];
        let once = 0, twice = 0;
        for (let k = 0; k < hs.length; k++) {
          const m = cand[hs[k]];
          twice |= once & m;
          once |= m;
        }
        if (once !== ALL) return false;
        const single = once & ~twice;
        if (single) {
          for (let k = 0; k < hs.length; k++) {
            const c = hs[k];
            const m = cand[c] & single;
            if (m && cand[c] !== m) {
              if (POP[m] > 1) return false;
              cand[c] = m;
              changed = true;
            }
          }
        }
      }
      if (changed) continue;

      // 3) Paar-Beziehungen (<, >, aufeinanderfolgend, ...)
      for (let k = 0; k < pairs.length; k++) {
        const pr = pairs[k];
        const ma = cand[pr.a], mb = cand[pr.b];
        const nb = mb & pr.fwdM[ma];
        if (!nb) return false;
        const na = ma & pr.bwdM[nb];
        if (!na) return false;
        if (na !== ma || nb !== mb) { cand[pr.a] = na; cand[pr.b] = nb; changed = true; }
      }

      // 4a) Käfig-Kombinationen: nur Ziffern aus noch möglichen Summen-Kombinationen
      for (let k = 0; k < cages.length; k++) {
        const cg = cages[k];
        const cells = cg.cells;
        let union = 0;
        for (let j = 0; j < cells.length; j++) union |= cand[cells[j]];
        let validU = 0, validI = ALL;
        const combos = cg.combos;
        for (let q = 0; q < combos.length; q++) {
          const cm = combos[q];
          if (cm & ~union) continue;
          let ok = true;
          for (let j = 0; j < cells.length; j++) if (!(cand[cells[j]] & cm)) { ok = false; break; }
          if (!ok) continue;
          validU |= cm; validI &= cm;
        }
        if (!validU) return false;
        for (let j = 0; j < cells.length; j++) {
          const c = cells[j];
          const nm = cand[c] & validU;
          if (!nm) return false;
          if (nm !== cand[c]) { cand[c] = nm; changed = true; }
        }
        // Ziffern, die in jeder Kombination vorkommen und nur in ein Feld passen
        if (validI) {
          for (let d = 1; d <= 9; d++) {
            const b = BIT(d);
            if (!(validI & b)) continue;
            let where = -1, cnt = 0;
            for (let j = 0; j < cells.length; j++) if (cand[cells[j]] & b) { cnt++; where = cells[j]; }
            if (cnt === 0) return false;
            if (cnt === 1 && cand[where] !== b) { cand[where] = b; changed = true; }
          }
        }
      }

      // 4b) Kompass-Pfeile: Ziffer d nur, wenn d Schritte weiter die Zielziffer stehen kann
      for (let k = 0; k < arrows.length; k++) {
        const ar = arrows[k];
        const m = cand[ar.cell];
        let nm = 0;
        for (let d = 1; d <= 9; d++) {
          if (!(m & BIT(d))) continue;
          const t = ar.targets[d];
          if (t >= 0 && (cand[t] & ar.tbit)) nm |= BIT(d);
        }
        if (!nm) return false;
        if (nm !== m) { cand[ar.cell] = nm; changed = true; }
        if (POP[nm] === 1) {
          const t = ar.targets[MIN[nm]];
          if (cand[t] !== ar.tbit) { cand[t] &= ar.tbit; if (!cand[t]) return false; changed = true; }
        }
      }

      // 4) Lineare (gewichtete) Summen über Schranken: lo <= Σ k_i·v_i <= hi
      for (let k = 0; k < lins.length; k++) {
        const L = lins[k];
        const cells = L.cells, coef = L.coef;
        let tmin = 0, tmax = 0;
        for (let j = 0; j < cells.length; j++) {
          const m = cand[cells[j]], q = coef[j];
          if (q > 0) { tmin += q * MIN[m]; tmax += q * MAX[m]; } else { tmin += q * MAX[m]; tmax += q * MIN[m]; }
        }
        if (tmin > L.hi || tmax < L.lo) return false;
        for (let j = 0; j < cells.length; j++) {
          const c = cells[j];
          const m = cand[c], q = coef[j];
          const termMin = q > 0 ? q * MIN[m] : q * MAX[m];
          const termMax = q > 0 ? q * MAX[m] : q * MIN[m];
          const A = L.lo - (tmax - termMax), B = L.hi - (tmin - termMin); // q·v liegt in [A, B]
          let lo, hi;
          if (q > 0) { lo = Math.ceil(A / q); hi = Math.floor(B / q); } else { lo = Math.ceil(B / q); hi = Math.floor(A / q); }
          const nm = m & rangeMask(lo, hi);
          if (!nm) return false;
          if (nm !== m) { cand[c] = nm; changed = true; }
        }
      }
    }
    return true;
  }

  /*
   * Backtracking-Suche mit MRV-Heuristik.
   * opts.limit     – nach so vielen Lösungen abbrechen
   * opts.maxNodes  – Suchknoten-Budget (deterministisch, keine Zeitgrenzen)
   * opts.rand      – Zufallsquelle für zufällige Ziffernreihenfolge
   * opts.exclude   – { cell, val }: diese Ziffer im Feld verbieten
   */
  function solve(C, givens, opts) {
    opts = opts || {};
    const limit = opts.limit || 2;
    const maxNodes = opts.maxNodes || 200000;
    const rand = opts.rand || null;
    const n = C.n;
    const cand = C.init.slice();
    for (let i = 0; i < n; i++) {
      if (givens && givens[i]) {
        cand[i] &= BIT(givens[i]);
        if (!cand[i]) return { count: 0, nodes: 0, aborted: false, solution: null };
      }
    }
    if (opts.exclude) {
      cand[opts.exclude.cell] &= ~BIT(opts.exclude.val);
      if (!cand[opts.exclude.cell]) return { count: 0, nodes: 0, aborted: false, solution: null };
    }
    const done = new Uint8Array(n);
    let count = 0, nodes = 0, aborted = false, solution = null;

    function rec(cand, done) {
      if (++nodes > maxNodes) { aborted = true; return; }
      if (!propagate(C, cand, done)) return;
      let best = -1, bp = 10;
      for (let i = 0; i < n; i++) {
        const p = POP[cand[i]];
        if (p > 1 && p < bp) { bp = p; best = i; if (p === 2) break; }
      }
      if (best < 0) {
        count++;
        if (!solution) solution = Array.from(cand, (m) => MIN[m]);
        return;
      }
      const m = cand[best];
      const digits = [];
      for (let d = 1; d <= 9; d++) if (m & BIT(d)) digits.push(d);
      if (rand) rand.shuffle(digits);
      for (let k = 0; k < digits.length; k++) {
        const c2 = cand.slice();
        const d2 = done.slice();
        c2[best] = BIT(digits[k]);
        rec(c2, d2);
        if (count >= limit || aborted) return;
      }
    }
    rec(cand, done);
    return { count, nodes, aborted, solution };
  }

  /* Linienregel für eine vollständig gefüllte Linie */
  function lineOk(l, vs) {
    if (l.type === 'thermo') return vs.every((v, i) => i === 0 || vs[i - 1] < v);
    if (l.type === 'whisper') return vs.every((v, i) => i === 0 || Math.abs(vs[i - 1] - v) >= 5);
    if (l.type === 'palindrome') return vs.every((v, i) => v === vs[vs.length - 1 - i]);
    if (l.type === 'renban') return new Set(vs).size === vs.length && Math.max(...vs) - Math.min(...vs) === vs.length - 1;
    return true;
  }
  function leverTorque(lv, values) {
    let t = 0;
    lv.cells.forEach((id, i) => { t += (i - lv.fulcrum) * values[id]; });
    return t;
  }

  /* Löst das Rätsel nur durch Logik (ohne Raten)? */
  function solvesByLogic(C, givens) {
    const cand = C.init.slice();
    for (let i = 0; i < C.n; i++) if (givens[i]) cand[i] &= BIT(givens[i]);
    const done = new Uint8Array(C.n);
    if (!propagate(C, cand, done)) return false;
    for (let i = 0; i < C.n; i++) if (POP[cand[i]] !== 1) return false;
    return true;
  }

  /* Prüft eine vollständige Belegung gegen alle Regeln (für Tests und Gewinnprüfung). */
  function verify(P, values) {
    const errors = [];
    for (const h of P.houses || []) {
      const seen = new Set();
      for (const id of h) {
        const v = values[id];
        if (v < 1 || v > 9 || seen.has(v)) { errors.push(['house', h]); break; }
        seen.add(v);
      }
    }
    for (const [a, b] of P.distinct || []) if (values[a] === values[b]) errors.push(['distinct', a, b]);
    for (const c of P.cages || []) {
      const vs = c.cells.map((id) => values[id]);
      const sum = vs.reduce((s, v) => s + v, 0);
      const okSum = c.liar ? Math.abs(sum - c.sum) === 1 : sum === c.sum;
      if (new Set(vs).size !== vs.length || !okSum) errors.push(['cage', c]);
    }
    for (const l of P.lines || []) if (!lineOk(l, l.cells.map((id) => values[id]))) errors.push(['line', l]);
    for (const lv of P.levers || []) if (leverTorque(lv, values) !== 0) errors.push(['lever', lv]);
    for (const a of P.arrows || []) {
      const t = a.targets[values[a.cell]];
      if (t < 0 || values[t] !== a.digit) errors.push(['arrow', a]);
    }
    for (const p of P.pairs || []) if (!RELATIONS[p.type](values[p.a], values[p.b])) errors.push(['pair', p]);
    for (const s of P.sums || []) {
      const sum = s.cells.reduce((acc, id) => acc + values[id], 0);
      if (sum !== values[s.target]) errors.push(['sum', s]);
    }
    for (const [id, k] of P.parity || []) if ((values[id] % 2 === 0) !== (k === 'e')) errors.push(['parity', id]);
    return errors;
  }

  const api = { ALL, POP, MIN, MAX, BIT, DIRS8, rng, compile, propagate, solve, solvesByLogic, verify, lineOk, leverTorque, RELATIONS };
  api.factory = engineFactory; // Quelltext für den Hintergrund-Worker
  root.SudokuEngine = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);

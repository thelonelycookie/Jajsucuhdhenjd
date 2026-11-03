/*
 * Sudoku Mosaik – Löser-Kern
 * Generischer Constraint-Löser für beliebige (auch verschachtelte) Sudoku-Varianten.
 * Kandidaten werden als Bitmasken gespeichert: Ziffer d -> Bit (1 << (d-1)).
 */
(function (root) {
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

  /*
   * Ein Rätsel P beschreibt nur Regeln, keine Darstellung:
   *   n          Anzahl Felder
   *   houses     Gruppen von 9 Feldern, die 1–9 genau einmal enthalten
   *   distinct   zusätzliche Paare mit verschiedenen Ziffern
   *   cages      { cells, sum } – Killer-Käfige (Ziffern verschieden)
   *   pairs      { a, b, type } – Beziehungen (lt, cons, noncons)
   *   sums       { cells, target } – Summe der cells = Ziffer im target
   *   parity     [[id, 'e'|'o'], ...]
   */
  function compile(P) {
    const n = P.n;
    const peerSets = Array.from({ length: n }, () => new Set());
    const addGroup = (ids) => {
      for (const a of ids) for (const b of ids) if (a !== b) peerSets[a].add(b);
    };
    (P.houses || []).forEach(addGroup);
    (P.cages || []).forEach((c) => addGroup(c.cells));
    (P.distinct || []).forEach(([a, b]) => { peerSets[a].add(b); peerSets[b].add(a); });
    const peers = peerSets.map((s) => Int32Array.from(s));
    const houses = (P.houses || []).map((h) => Int32Array.from(h));

    const pairs = [];
    for (const p of P.pairs || []) {
      if (p.type === 'ne') continue;
      const t = relTables(p.type);
      pairs.push({ a: p.a, b: p.b, fwdM: t.fwdM, bwdM: t.bwdM });
    }

    const lins = [];
    const cages = [];
    for (const c of P.cages || []) {
      lins.push({ cells: Int32Array.from(c.cells), coef: new Int8Array(c.cells.length).fill(1), sum: c.sum });
      cages.push({ cells: Int32Array.from(c.cells), combos: comboList(c.cells.length, c.sum) });
    }
    for (const s of P.sums || []) {
      const cells = Int32Array.from([...s.cells, s.target]);
      const coef = new Int8Array(cells.length).fill(1);
      coef[coef.length - 1] = -1;
      lins.push({ cells, coef, sum: 0 });
    }

    const init = new Uint16Array(n).fill(ALL);
    const EVEN = BIT(2) | BIT(4) | BIT(6) | BIT(8);
    for (const [id, kind] of P.parity || []) init[id] &= kind === 'e' ? EVEN : ALL & ~EVEN;

    return { n, peers, houses, pairs, lins, cages, init };
  }

  /* Constraint-Propagation bis zum Fixpunkt. Gibt false bei Widerspruch zurück. */
  function propagate(C, cand, done) {
    const { n, peers, houses, pairs, lins, cages } = C;
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

      // 4) Lineare Summen (Killer-Käfige, Additionsgruppen) über Schranken
      for (let k = 0; k < lins.length; k++) {
        const L = lins[k];
        const cells = L.cells, coef = L.coef, S = L.sum;
        let tmin = 0, tmax = 0;
        for (let j = 0; j < cells.length; j++) {
          const m = cand[cells[j]];
          if (coef[j] > 0) { tmin += MIN[m]; tmax += MAX[m]; } else { tmin -= MAX[m]; tmax -= MIN[m]; }
        }
        if (tmin > S || tmax < S) return false;
        for (let j = 0; j < cells.length; j++) {
          const c = cells[j];
          const m = cand[c];
          let lo, hi;
          if (coef[j] > 0) {
            const restMin = tmin - MIN[m], restMax = tmax - MAX[m];
            lo = S - restMax; hi = S - restMin;
          } else {
            const restMin = tmin + MAX[m], restMax = tmax + MIN[m];
            lo = restMin - S; hi = restMax - S;
          }
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
      if (new Set(vs).size !== vs.length || vs.reduce((s, v) => s + v, 0) !== c.sum) errors.push(['cage', c]);
    }
    for (const p of P.pairs || []) if (!RELATIONS[p.type](values[p.a], values[p.b])) errors.push(['pair', p]);
    for (const s of P.sums || []) {
      const sum = s.cells.reduce((acc, id) => acc + values[id], 0);
      if (sum !== values[s.target]) errors.push(['sum', s]);
    }
    for (const [id, k] of P.parity || []) if ((values[id] % 2 === 0) !== (k === 'e')) errors.push(['parity', id]);
    return errors;
  }

  const api = { ALL, POP, MIN, MAX, BIT, rng, compile, propagate, solve, solvesByLogic, verify, RELATIONS };
  root.SudokuEngine = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);

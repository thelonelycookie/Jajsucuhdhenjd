// Prüft alle Varianten: Generierung, Regeltreue der Lösung, Eindeutigkeit.
const E = require('../js/engine.js');
const G = require('../js/generator.js');
const ids = process.argv[2] ? process.argv[2].split(',') : G.CATALOG.map((c) => c.id);
const diffs = process.argv[3] ? process.argv[3].split(',') : ['hard'];
const seeds = +process.argv[4] || 2;
let fail = 0;
for (const id of ids) for (const d of diffs) for (let s = 1; s <= seeds; s++) {
  const t0 = Date.now();
  const P = G.generate(id, d, s * 7919);
  const ms = Date.now() - t0;
  const errs = E.verify(P, P.solution);
  const C = E.compile(P);
  const t1 = Date.now();
  const res = E.solve(C, P.givens, { limit: 2, maxNodes: 2e6 });
  const ok = errs.length === 0 && res.count === 1 && !res.aborted && res.solution.every((v, i) => v === P.solution[i]);
  const givens = P.givens.filter(Boolean).length;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${id.padEnd(12)} ${d.padEnd(6)} seed=${s * 7919} cells=${P.n} givens=${givens} gen=${ms}ms check=${Date.now() - t1}ms nodes=${res.nodes} types=${P.grids.map((g) => g.type).join('/')}`);
  if (!ok) { fail++; console.log(errs.slice(0, 3), res.count, res.aborted); }
}
process.exit(fail ? 1 : 0);

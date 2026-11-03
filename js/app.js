/*
 * Sudoku Mosaik – Oberfläche
 */
(function () {
  'use strict';
  const G = window.SudokuGenerator;
  const S = 48; // Feldgröße in SVG-Einheiten
  const PAD = 3;
  const $ = (id) => document.getElementById(id);
  const NS = 'http://www.w3.org/2000/svg';

  /* ---------- Speicher (lokal, optional) ---------- */
  const store = {
    get(k, def) {
      try { const v = localStorage.getItem('mosaik:' + k); return v == null ? def : JSON.parse(v); } catch (e) { return def; }
    },
    set(k, v) { try { localStorage.setItem('mosaik:' + k, JSON.stringify(v)); } catch (e) { /* ignorieren */ } },
    del(k) { try { localStorage.removeItem('mosaik:' + k); } catch (e) { /* ignorieren */ } },
  };
  const prefs = Object.assign({ difficulty: 'medium', liveErrors: false, autoNotes: true }, store.get('prefs', {}));
  const stats = store.get('stats', {});
  const savePrefs = () => store.set('prefs', prefs);

  /* ---------- Hilfen ---------- */
  const fmtTime = (sec) => {
    sec = Math.floor(sec);
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(s).padStart(2, '0');
  };
  let toastTimer = 0;
  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 2400);
  }
  function confirmBox(title, text) {
    return new Promise((resolve) => {
      $('confirmTitle').textContent = title;
      $('confirmText').textContent = text;
      $('confirmOverlay').hidden = false;
      const done = (v) => { $('confirmOverlay').hidden = true; $('confirmYes').onclick = $('confirmNo').onclick = null; resolve(v); };
      $('confirmYes').onclick = () => done(true);
      $('confirmNo').onclick = () => done(false);
      $('confirmYes').focus();
    });
  }

  /* ---------- Vorschaubilder ---------- */
  const MIX_SAMPLE = ['killer', 'consecutive', 'offset', 'x', 'greater', 'jigsaw', 'addition', 'windoku'];
  function layoutPreview(layoutName, types) {
    const pos = G.LAYOUTS[layoutName];
    let rows = 0, cols = 0;
    pos.forEach(([r, c]) => { rows = Math.max(rows, r + 3); cols = Math.max(cols, c + 3); });
    const boxes = new Map();
    pos.forEach(([br, bc], gi) => {
      const t = types === 'mix' ? MIX_SAMPLE[gi % MIX_SAMPLE.length] : types[gi];
      for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
        const k = (br + r) + ',' + (bc + c);
        if (!boxes.has(k)) boxes.set(k, []);
        boxes.get(k).push(t);
      }
    });
    let out = '';
    const g = 0.09;
    for (const [k, ts] of boxes) {
      const [r, c] = k.split(',').map(Number);
      const x = c + g, y = r + g, w = 1 - 2 * g;
      if (ts.length === 1) {
        out += `<rect x="${x}" y="${y}" width="${w}" height="${w}" rx="0.16" class="f-${ts[0]}" />`;
      } else {
        out += `<clipPath id="cp${layoutName}${r}_${c}"><rect x="${x}" y="${y}" width="${w}" height="${w}" rx="0.16"/></clipPath>`;
        out += `<g clip-path="url(#cp${layoutName}${r}_${c})"><polygon points="${x},${y} ${x + w},${y} ${x},${y + w}" class="f-${ts[0]}"/><polygon points="${x + w},${y} ${x + w},${y + w} ${x},${y + w}" class="f-${ts[1]}"/></g>`;
        out += `<rect x="${x}" y="${y}" width="${w}" height="${w}" rx="0.16" fill="none" stroke="var(--muted)" stroke-width="0.04" />`;
      }
    }
    return { viewBox: `0 0 ${cols} ${rows}`, body: out };
  }

  /* Kleine Symbole für die Einzelvarianten (3×3 Felder à 30) */
  function glyph(type) {
    const cell = (r, c, cls) => `<rect x="${c * 30}" y="${r * 30}" width="30" height="30" class="${cls}" stroke="var(--cell-line)" stroke-width="1"/>`;
    const dig = (r, c, d, cls) => `<text x="${c * 30 + 15}" y="${r * 30 + 16}" class="d ${cls || 'given'}" style="font-size:19px">${d}</text>`;
    let bg = '', fg = '';
    const base = (fn) => { for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) bg += cell(r, c, fn ? fn(r, c) : 'f-' + type); };
    switch (type) {
      case 'classic': base(); fg = dig(0, 0, 5) + dig(1, 2, 3) + dig(2, 1, 8); break;
      case 'killer':
        base();
        fg = `<path d="M3 3H57V27H3Z" class="cage"/><path d="M3 33H27V87H3Z" class="cage"/><path d="M33 33H87V57H63V87H33Z" class="cage"/>`
          + `<text x="5" y="13" class="cage-sum">11</text><text x="5" y="43" class="cage-sum">9</text><text x="35" y="43" class="cage-sum">17</text>`;
        break;
      case 'greater': {
        base();
        const ch = (x, y, dx, dy) => { const s = 5; const px = -dy, py = dx; return `<path class="chev" d="M${x - dx * s + px * s} ${y - dy * s + py * s}L${x + dx * s} ${y + dy * s}L${x - dx * s - px * s} ${y - dy * s - py * s}"/>`; };
        fg = ch(30, 15, -1, 0) + ch(60, 45, 1, 0) + ch(15, 60, 0, 1) + ch(75, 30, 0, -1) + ch(30, 75, -1, 0);
        break;
      }
      case 'addition':
        base((r, c) => (r === 1 && c < 2) ? 'f-blue' : (r === 1 && c === 2) ? 'f-red' : 'f-addition');
        fg = dig(1, 0, 2, 'user') + dig(1, 1, 4, 'user') + dig(1, 2, 6);
        break;
      case 'consecutive':
        base();
        fg = `<rect x="22" y="11.5" width="16" height="7" rx="3.5" class="bridge"/><rect x="41.5" y="52" width="7" height="16" rx="3.5" class="bridge"/>`
          + dig(0, 0, 4) + dig(0, 1, 5) + dig(1, 1, 7, 'user') + dig(2, 1, 8, 'user');
        break;
      case 'x': base(); fg = `<line x1="0" y1="0" x2="90" y2="90" class="diag"/><line x1="90" y1="0" x2="0" y2="90" class="diag"/>` + dig(1, 1, 9); break;
      case 'jigsaw':
        base();
        fg = `<path class="thick" d="M30 0V30H60V60H90M0 60H30V90M60 60V90"/>`;
        break;
      case 'offset': base((r, c) => 'f-o' + ((r * 3 + c * 4) % 9)); fg = dig(1, 1, 1); break;
      case 'windoku': base((r, c) => (r > 0 && c > 0) ? 'f-win' : 'f-windoku'); fg = `<rect x="30" y="30" width="60" height="60" fill="none" stroke="var(--ink-soft)" stroke-width="2"/>`; break;
      case 'evenodd':
        base();
        fg = `<rect x="7" y="7" width="16" height="16" rx="3" class="parity"/><circle cx="75" cy="45" r="9" class="parity"/><rect x="37" y="67" width="16" height="16" rx="3" class="parity"/>`
          + dig(0, 0, 4) + dig(1, 2, 7, 'user');
        break;
      case 'antiknight':
        base();
        fg = `<path d="M15 15V75H45" fill="none" stroke="var(--diag)" stroke-width="2" stroke-dasharray="3 3"/>` + dig(0, 0, 3) + `<text x="45" y="76" class="d bad" style="font-size:19px">3</text>`;
        break;
      case 'liar':
        base();
        fg = `<path d="M3 3H57V27H3Z" class="cage"/><path d="M3 33H27V87H3Z" class="cage"/><path d="M33 33H87V57H63V87H33Z" class="cage"/>`
          + `<text x="5" y="13" class="cage-sum">10</text><text x="5" y="43" class="cage-sum">8</text><text x="35" y="43" class="cage-sum">18</text>`
          + `<text x="76" y="80" class="d bad" style="font-size:16px">±1</text>`;
        break;
      case 'lever':
        base();
        fg = `<line x1="15" y1="45" x2="75" y2="45" class="lever"/><circle cx="15" cy="45" r="3" class="lever-dot"/><circle cx="75" cy="45" r="3" class="lever-dot"/><polygon points="45,55 36,66 54,66" class="fulcrum"/>`
          + dig(0, 0, 2, 'user') + dig(2, 2, 7, 'user');
        break;
      case 'compass':
        base();
        fg = dig(0, 0, 2) + `<polygon points="27,27 17,24 24,17" class="arr arr9"/>` + dig(2, 2, 9, 'user')
          + dig(0, 2, 1, 'user') + dig(2, 0, 1) + `<polygon points="15,63 9,72 21,72" class="arr arr1" transform="rotate(0)"/>`;
        break;
      case 'lines':
        base();
        fg = `<circle cx="15" cy="15" r="10" class="ln-bulb"/><polyline points="15,15 45,15 75,45" class="ln ln-thermo"/>`
          + `<polyline points="15,75 45,45" class="ln ln-whisper"/><polyline points="45,75 75,75" class="ln ln-renban"/>`;
        break;
      default: base();
    }
    return `<svg viewBox="-2 -2 94 94" aria-hidden="true">${bg}${fg}<rect x="0" y="0" width="90" height="90" class="thick" stroke-width="3"/></svg>`;
  }

  /* ---------- Startseite ---------- */
  function savedGame(id) { return store.get('save:' + id, null); }

  function renderHome() {
    // Logo
    const lp = layoutPreview('ring', G.CATALOG[0].types);
    $('logo').setAttribute('viewBox', lp.viewBox);
    $('logo').innerHTML = lp.body;
    $('winMark').setAttribute('viewBox', lp.viewBox);
    $('winMark').innerHTML = lp.body;

    // Schwierigkeit
    for (const b of $('diffSeg').querySelectorAll('button')) b.setAttribute('aria-checked', String(b.dataset.diff === prefs.difficulty));

    // Hauptkarte
    const sup = G.CATALOG[0];
    const sv = savedGame(sup.id);
    const prev = layoutPreview('ring', sup.types);
    const legend = sup.types.map((t) => `<li><i class="sw" style="background:var(--t-${t})"></i>${G.TYPES[t].short}</li>`).join('');
    $('feature').innerHTML = `
      <div>
        <p class="eyebrow label">33 × 33 Felder · 8 Regeln</p>
        <h2>Super-Sudoku</h2>
        <p>${sup.blurb} Deshalb lassen sich die Teile nicht einzeln lösen, nur alle zusammen.</p>
        <ul class="legend">${legend}</ul>
        <div class="actions">
          <button type="button" class="btn primary" id="featNew">Neues Super-Sudoku</button>
          ${sv && !sv.solved ? `<button type="button" class="btn" id="featCont">Fortsetzen · ${G.DIFFICULTY[sv.P.difficulty].name} · ${fmtTime(sv.elapsed)}</button>` : ''}
        </div>
      </div>
      <svg class="preview" viewBox="${prev.viewBox}" aria-label="Form des Super-Sudokus: acht Gitter im Ring">${prev.body}</svg>`;
    $('featNew').onclick = () => startNew(sup.id);
    if ($('featCont')) $('featCont').onclick = () => resume(sup.id);

    const card = (spec) => {
      const sv = savedGame(spec.id);
      const st = stats[spec.id];
      let icon;
      if (spec.layout === 'single') icon = glyph(spec.types[0]);
      else { const p = layoutPreview(spec.layout, spec.types); icon = `<svg viewBox="${p.viewBox}" aria-hidden="true">${p.body}</svg>`; }
      const meta = [];
      if (sv && !sv.solved) meta.push(`<span class="pill go">Fortsetzen · ${fmtTime(sv.elapsed)}</span>`);
      if (st && st.solved) meta.push(`<span class="pill">${st.solved}× gelöst</span>`);
      const dKey = spec.fixed || prefs.difficulty;
      if (spec.fixed) meta.unshift(`<span class="pill hot">Immer ${G.DIFFICULTY[spec.fixed].name}</span>`);
      if (st && st.best && st.best[dKey]) meta.push(`<span class="pill">Bestzeit ${fmtTime(st.best[dKey])}</span>`);
      const blurb = spec.group === 'single' ? spec.blurb : spec.blurb;
      return `<button type="button" class="card" data-id="${spec.id}">${icon}<div><h3>${spec.name}</h3><p>${blurb}</p>${meta.length ? `<div class="meta">${meta.join('')}</div>` : ''}</div></button>`;
    };
    const masters = G.CATALOG.filter((s) => s.group === 'master');
    $('masterCards').innerHTML = masters.map(card).join('');
    const giants = G.CATALOG.filter((s) => s.group === 'giant' && s.id !== 'super');
    const singles = G.CATALOG.filter((s) => s.group === 'single');
    $('giantCards').innerHTML = giants.map(card).join('');
    $('singleCards').innerHTML = singles.map(card).join('');
    $('giantCount').textContent = giants.length + 1;
    $('singleCount').textContent = singles.length;
    for (const el of document.querySelectorAll('.card')) {
      el.onclick = () => {
        const sv = savedGame(el.dataset.id);
        if (sv && !sv.solved) resume(el.dataset.id); else startNew(el.dataset.id);
      };
    }
    const total = Object.values(stats).reduce((s, v) => s + (v.solved || 0), 0);
    $('statsLine').textContent = total ? `Bisher gelöst: ${total} Rätsel.` : 'Noch kein Rätsel gelöst. Fang mit einer Variante an, die du kennst.';
  }

  /* ---------- Spiel ---------- */
  let game = null;
  let V = null; // Darstellungs-Cache
  let notesMode = false;
  let timerId = 0;

  function showScreen(name) {
    $('home').hidden = name !== 'home';
    $('game').hidden = name !== 'game';
    window.scrollTo(0, 0);
  }

  function runGeneration(specId, diff) {
    const seed = (Math.random() * 4294967296) >>> 0;
    return new Promise((resolve, reject) => {
      const it = G.generateSteps(specId, diff, seed);
      const ov = $('genOverlay');
      const showTimer = setTimeout(() => { ov.hidden = false; }, 120);
      const labels = { solution: 'Lösung wird gebaut …', reduce: 'Vorgaben werden entfernt, Eindeutigkeit wird geprüft …', done: 'Fertig.' };
      const pump = () => {
        const t0 = performance.now();
        try {
          while (performance.now() - t0 < 28) {
            const r = it.next();
            if (r.done) {
              clearTimeout(showTimer);
              ov.hidden = true;
              resolve(r.value);
              return;
            }
            $('genFill').style.width = Math.round(r.value.progress * 100) + '%';
            $('genText').textContent = labels[r.value.phase] || '';
          }
        } catch (e) {
          clearTimeout(showTimer); ov.hidden = true; reject(e); return;
        }
        setTimeout(pump, 0);
      };
      $('genFill').style.width = '0%';
      setTimeout(pump, 20);
    });
  }

  async function startNew(specId) {
    try {
      const P = await runGeneration(specId, prefs.difficulty);
      game = {
        P,
        values: P.givens.slice(),
        notes: new Array(P.n).fill(0),
        elapsed: 0,
        hints: 0,
        solved: false,
        undo: [],
        sel: -1,
        zoom: null,
      };
      openGame();
      saveGame();
    } catch (e) {
      console.error(e);
      toast('Das Rätsel konnte nicht erzeugt werden. Bitte noch einmal versuchen.');
    }
  }

  function resume(specId) {
    const sv = savedGame(specId);
    if (!sv) return startNew(specId);
    game = Object.assign({ undo: [], sel: -1, zoom: null }, sv);
    openGame();
  }

  function saveGame() {
    if (!game) return;
    store.set('save:' + game.P.variant, {
      P: game.P, values: game.values, notes: game.notes, elapsed: game.elapsed, hints: game.hints, solved: game.solved,
    });
  }

  function openGame() {
    const P = game.P;
    $('gameTitle').textContent = P.name;
    $('gameSub').textContent = G.DIFFICULTY[P.difficulty].name + (P.grids.length > 1 ? ` · ${P.grids.length} Gitter · ${P.n} Felder` : '');
    buildView();
    buildBoard();
    buildPad();
    buildRules();
    $('zoomTools').hidden = P.grids.length === 1;
    showScreen('game');
    applyZoom(true);
    renderDynamic();
    startTimer();
    $('board').focus({ preventScroll: true });
  }

  /* Vorberechnungen für Darstellung und Fehlerprüfung */
  function buildView() {
    const P = game.P;
    const pos = new Int32Array(P.rows * P.cols).fill(-1);
    P.cells.forEach(([r, c], i) => { pos[r * P.cols + c] = i; });
    const cellHouses = Array.from({ length: P.n }, () => []);
    P.houses.forEach((h, hi) => h.forEach((id) => cellHouses[id].push(hi)));
    const peers = Array.from({ length: P.n }, () => new Set());
    P.houses.forEach((h) => h.forEach((a) => h.forEach((b) => { if (a !== b) peers[a].add(b); })));
    (P.cages || []).forEach((cg) => cg.cells.forEach((a) => cg.cells.forEach((b) => { if (a !== b) peers[a].add(b); })));
    (P.distinct || []).forEach(([a, b]) => { peers[a].add(b); peers[b].add(a); });
    (P.lines || []).forEach((l) => { if (l.type === 'renban') l.cells.forEach((a) => l.cells.forEach((b) => { if (a !== b) peers[a].add(b); })); });
    // Sichtbare Nachbarn für die Hervorhebung: nur Zeile, Spalte, Gebiet
    const gridsOf = Array.from({ length: P.n }, () => []);
    P.grids.forEach((g, gi) => g.ids.forEach((id, li) => gridsOf[id].push([gi, li])));
    V = { pos, cellHouses, peers, gridsOf, flash: new Set() };
  }

  function cellFillClass(id) {
    const P = game.P;
    let cls = null;
    for (const [gi, li] of V.gridsOf[id]) {
      const g = P.grids[gi];
      if (g.colors) return 'f-o' + g.colors[li];
      if (g.type === 'windoku') {
        const r = Math.floor(li / 9), c = li % 9;
        if ((r >= 1 && r <= 3 || r >= 5 && r <= 7) && (c >= 1 && c <= 3 || c >= 5 && c <= 7)) cls = cls || 'f-win';
      }
    }
    return cls || 'f-' + P.grids[V.gridsOf[id][0][0]].type;
  }

  function buildBoard() {
    const P = game.P;
    const svg = $('board');
    const W = P.cols * S, H = P.rows * S;
    svg.setAttribute('viewBox', `${-PAD} ${-PAD} ${W + 2 * PAD} ${H + 2 * PAD}`);
    svg.classList.toggle('single', P.grids.length === 1);
    const fills = new Array(P.n);
    for (let i = 0; i < P.n; i++) fills[i] = cellFillClass(i);
    for (const s of P.sums || []) {
      for (const id of s.cells) fills[id] = 'f-blue';
      fills[s.target] = 'f-red';
    }
    V.fills = fills;

    let bg = '', marks = '', thick = '', clues = '';
    P.cells.forEach(([r, c], i) => {
      bg += `<rect x="${c * S}" y="${r * S}" width="${S}" height="${S}" class="cell ${fills[i]}"/>`;
    });
    // Gerade/Ungerade
    for (const [id, k] of P.parity || []) {
      const [r, c] = P.cells[id];
      if (k === 'e') marks += `<rect x="${c * S + 7}" y="${r * S + 7}" width="${S - 14}" height="${S - 14}" rx="4" class="parity"/>`;
      else marks += `<circle cx="${c * S + S / 2}" cy="${r * S + S / 2}" r="${S / 2 - 6}" class="parity"/>`;
    }
    // Diagonalen
    for (const g of P.grids) {
      if (g.type !== 'x') continue;
      const x0 = g.bc * 3 * S, y0 = g.br * 3 * S, L = 9 * S;
      marks += `<line x1="${x0}" y1="${y0}" x2="${x0 + L}" y2="${y0 + L}" class="diag"/><line x1="${x0 + L}" y1="${y0}" x2="${x0}" y2="${y0 + L}" class="diag"/>`;
    }
    // Dicke Linien: Gebietsgrenzen und Gitterränder
    const segs = new Set();
    for (const g of P.grids) {
      const r0 = g.br * 3, c0 = g.bc * 3;
      for (let lr = 0; lr < 9; lr++) {
        for (let lc = 0; lc < 9; lc++) {
          const reg = g.region[lr * 9 + lc];
          const R = r0 + lr, C = c0 + lc;
          if (lc === 8 || g.region[lr * 9 + lc + 1] !== reg) segs.add(`M${(C + 1) * S} ${R * S}V${(R + 1) * S}`);
          if (lc === 0) segs.add(`M${C * S} ${R * S}V${(R + 1) * S}`);
          if (lr === 8 || g.region[(lr + 1) * 9 + lc] !== reg) segs.add(`M${C * S} ${(R + 1) * S}H${(C + 1) * S}`);
          if (lr === 0) segs.add(`M${C * S} ${R * S}H${(C + 1) * S}`);
        }
      }
    }
    thick = `<path class="thick" d="${[...segs].join('')}"/>`;
    // Killer-Käfige
    for (const cg of P.cages || []) {
      clues += cagePath(cg);
    }
    // Paare
    for (const p of P.pairs || []) {
      if (p.type === 'noncons') continue;
      const [ra, ca] = P.cells[p.a], [rb, cb] = P.cells[p.b];
      const mx = ((ca + cb) / 2 + 0.5) * S, my = ((ra + rb) / 2 + 0.5) * S;
      if (p.type === 'cons') {
        clues += ra === rb
          ? `<rect x="${mx - 8}" y="${my - 3.5}" width="16" height="7" rx="3.5" class="bridge"/>`
          : `<rect x="${mx - 3.5}" y="${my - 8}" width="7" height="16" rx="3.5" class="bridge"/>`;
      } else if (p.type === 'lt') {
        const dx = ca - cb, dy = ra - rb, s = 5.5, px = -dy, py = dx;
        clues += `<path class="chev" d="M${mx - dx * s + px * s} ${my - dy * s + py * s}L${mx + dx * s} ${my + dy * s}L${mx - dx * s - px * s} ${my - dy * s - py * s}"/>`;
      }
    }
    // Linien, Hebel, Kompass-Pfeile
    const ctr = (id) => { const [r, c] = P.cells[id]; return [c * S + S / 2, r * S + S / 2]; };
    let lines = '';
    for (const l of P.lines || []) {
      const pts = l.cells.map((id) => ctr(id).join(',')).join(' ');
      if (l.type === 'thermo') { const [x, y] = ctr(l.cells[0]); lines += `<circle cx="${x}" cy="${y}" r="${S * 0.36}" class="ln-bulb"/>`; }
      lines += `<polyline points="${pts}" class="ln ln-${l.type}"/>`;
    }
    for (const lv of P.levers || []) {
      const a = ctr(lv.cells[0]), b = ctr(lv.cells[lv.cells.length - 1]), f = ctr(lv.cells[lv.fulcrum]);
      const horiz = a[1] === b[1];
      lines += `<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" class="lever"/>`;
      for (const id of lv.cells) { const [x, y] = ctr(id); lines += `<circle cx="${x}" cy="${y}" r="3" class="lever-dot"/>`; }
      const tri = horiz
        ? `${f[0]},${f[1] + 12} ${f[0] - 9},${f[1] + 23} ${f[0] + 9},${f[1] + 23}`
        : `${f[0] + 12},${f[1]} ${f[0] + 23},${f[1] - 9} ${f[0] + 23},${f[1] + 9}`;
      lines += `<polygon points="${tri}" class="fulcrum"/>`;
    }
    for (const ar of P.arrows || []) {
      const [x, y] = ctr(ar.cell);
      const [dr, dc] = ar.dir;
      const len = Math.hypot(dr, dc), ux = dc / len, uy = dr / len;
      const cx = x + ux * 16, cy = y + uy * 16, s2 = 6.5, px = -uy, py = ux;
      lines += `<polygon points="${cx + ux * s2},${cy + uy * s2} ${cx - ux * s2 + px * s2},${cy - uy * s2 + py * s2} ${cx - ux * s2 - px * s2},${cy - uy * s2 - py * s2}" class="arr arr${ar.digit}"/>`;
    }
    svg.innerHTML = `<g>${bg}</g><g id="hlLayer"></g><g>${marks}${lines}</g><g>${thick}</g><g>${clues}</g><g id="digLayer"></g>`;
    V.hl = svg.querySelector('#hlLayer');
    V.dig = svg.querySelector('#digLayer');
  }

  function cagePath(cg) {
    const P = game.P;
    const set = new Set(cg.cells.map((id) => P.cells[id][0] * 10000 + P.cells[id][1]));
    const has = (r, c) => set.has(r * 10000 + c);
    const m = 4.5;
    let d = '';
    let first = null;
    for (const id of cg.cells) {
      const [r, c] = P.cells[id];
      if (!first || r < first[0] || (r === first[0] && c < first[1])) first = [r, c, id];
      const x0 = c * S, y0 = r * S, x1 = x0 + S, y1 = y0 + S;
      if (!has(r - 1, c)) {
        const xs = !has(r, c - 1) ? x0 + m : has(r - 1, c - 1) ? x0 - m : x0;
        const xe = !has(r, c + 1) ? x1 - m : has(r - 1, c + 1) ? x1 + m : x1;
        d += `M${xs} ${y0 + m}H${xe}`;
      }
      if (!has(r + 1, c)) {
        const xs = !has(r, c - 1) ? x0 + m : has(r + 1, c - 1) ? x0 - m : x0;
        const xe = !has(r, c + 1) ? x1 - m : has(r + 1, c + 1) ? x1 + m : x1;
        d += `M${xs} ${y1 - m}H${xe}`;
      }
      if (!has(r, c - 1)) {
        const ys = !has(r - 1, c) ? y0 + m : has(r - 1, c - 1) ? y0 - m : y0;
        const ye = !has(r + 1, c) ? y1 - m : has(r + 1, c - 1) ? y1 + m : y1;
        d += `M${x0 + m} ${ys}V${ye}`;
      }
      if (!has(r, c + 1)) {
        const ys = !has(r - 1, c) ? y0 + m : has(r - 1, c + 1) ? y0 - m : y0;
        const ye = !has(r + 1, c) ? y1 - m : has(r + 1, c + 1) ? y1 + m : y1;
        d += `M${x1 - m} ${ys}V${ye}`;
      }
    }
    const [fr, fc, fid] = first;
    const label = String(cg.sum);
    const w = label.length * 6.6 + 4;
    return `<path d="${d}" class="cage"/><rect x="${fc * S + 2}" y="${fr * S + 2}" width="${w}" height="12" class="${V.fills[fid]}"/>`
      + `<text x="${fc * S + 4}" y="${fr * S + 12}" class="cage-sum">${label}</text>`;
  }

  /* Regelverstöße finden (für rote Ziffern) */
  function findConflicts() {
    const P = game.P, vals = game.values;
    const bad = new Set();
    for (const h of P.houses) {
      const seen = new Map();
      for (const id of h) {
        const v = vals[id];
        if (!v) continue;
        if (seen.has(v)) { bad.add(id); bad.add(seen.get(v)); } else seen.set(v, id);
      }
    }
    for (const [a, b] of P.distinct || []) if (vals[a] && vals[a] === vals[b]) { bad.add(a); bad.add(b); }
    for (const cg of P.cages || []) {
      let sum = 0, full = true;
      const seen = new Map();
      for (const id of cg.cells) {
        const v = vals[id];
        if (!v) { full = false; continue; }
        sum += v;
        if (seen.has(v)) { bad.add(id); bad.add(seen.get(v)); } else seen.set(v, id);
      }
      const wrong = cg.liar ? (full && Math.abs(sum - cg.sum) !== 1) || sum > cg.sum + 1 : (full && sum !== cg.sum) || sum > cg.sum;
      if (wrong) cg.cells.forEach((id) => { if (vals[id]) bad.add(id); });
    }
    const E = window.SudokuEngine;
    for (const l of P.lines || []) {
      const c = l.cells;
      const flag = (...ids) => ids.forEach((id) => bad.add(id));
      if (l.type === 'thermo' || l.type === 'whisper') {
        for (let i = 0; i + 1 < c.length; i++) {
          const a = vals[c[i]], b = vals[c[i + 1]];
          if (a && b && (l.type === 'thermo' ? a >= b : Math.abs(a - b) < 5)) flag(c[i], c[i + 1]);
        }
        if (l.type === 'thermo') {
          // auch nicht benachbarte Felder: Abstand muss passen
          for (let i = 0; i < c.length; i++) for (let j = i + 1; j < c.length; j++) {
            if (vals[c[i]] && vals[c[j]] && vals[c[j]] - vals[c[i]] < j - i) flag(c[i], c[j]);
          }
        }
      } else if (l.type === 'palindrome') {
        for (let i = 0; i < c.length - 1 - i; i++) {
          const a = vals[c[i]], b = vals[c[c.length - 1 - i]];
          if (a && b && a !== b) flag(c[i], c[c.length - 1 - i]);
        }
      } else if (l.type === 'renban') {
        const f = c.filter((id) => vals[id]);
        const vs = f.map((id) => vals[id]);
        if (vs.length && (new Set(vs).size !== vs.length || Math.max(...vs) - Math.min(...vs) > c.length - 1)) flag(...f);
      }
    }
    for (const lv of P.levers || []) {
      if (lv.cells.every((id, i) => i === lv.fulcrum || vals[id]) && E.leverTorque(lv, vals) !== 0) {
        lv.cells.forEach((id, i) => { if (i !== lv.fulcrum) bad.add(id); });
      }
    }
    for (const ar of P.arrows || []) {
      const d = vals[ar.cell];
      if (!d) continue;
      const t = ar.targets[d];
      if (t < 0) bad.add(ar.cell);
      else if (vals[t] && vals[t] !== ar.digit) { bad.add(ar.cell); bad.add(t); }
    }
    const rel = window.SudokuEngine.RELATIONS;
    for (const p of P.pairs || []) {
      if (vals[p.a] && vals[p.b] && !rel[p.type](vals[p.a], vals[p.b])) { bad.add(p.a); bad.add(p.b); }
    }
    for (const s of P.sums || []) {
      const all = [...s.cells, s.target];
      if (all.every((id) => vals[id])) {
        const sum = s.cells.reduce((acc, id) => acc + vals[id], 0);
        if (sum !== vals[s.target]) all.forEach((id) => bad.add(id));
      }
    }
    for (const [id, k] of P.parity || []) if (vals[id] && (vals[id] % 2 === 0) !== (k === 'e')) bad.add(id);
    if (prefs.liveErrors) {
      for (let i = 0; i < P.n; i++) if (vals[i] && vals[i] !== P.solution[i]) bad.add(i);
    }
    return bad;
  }

  function renderDynamic() {
    const P = game.P;
    const sel = game.sel;
    let hl = '', dig = '';
    const selVal = sel >= 0 ? game.values[sel] : 0;
    if (sel >= 0) {
      const visible = new Set();
      for (const hi of V.cellHouses[sel]) for (const id of P.houses[hi]) visible.add(id);
      for (const id of visible) {
        if (id === sel) continue;
        const [r, c] = P.cells[id];
        hl += `<rect x="${c * S}" y="${r * S}" width="${S}" height="${S}" class="hl-peer"/>`;
      }
    }
    if (selVal) {
      for (let i = 0; i < P.n; i++) {
        if (i !== sel && game.values[i] === selVal) {
          const [r, c] = P.cells[i];
          hl += `<rect x="${c * S}" y="${r * S}" width="${S}" height="${S}" class="hl-same"/>`;
        }
      }
    }
    for (const id of V.flash) {
      const [r, c] = P.cells[id];
      hl += `<rect x="${c * S}" y="${r * S}" width="${S}" height="${S}" class="hl-wrong"/>`;
    }
    if (sel >= 0) {
      const [r, c] = P.cells[sel];
      hl += `<rect x="${c * S}" y="${r * S}" width="${S}" height="${S}" class="hl-sel"/>`;
    }
    const bad = findConflicts();
    for (let i = 0; i < P.n; i++) {
      const [r, c] = P.cells[i];
      const v = game.values[i];
      if (v) {
        const cls = P.givens[i] ? 'given' : 'user';
        dig += `<text x="${c * S + S / 2}" y="${r * S + S / 2 + 1}" class="d ${cls}${bad.has(i) ? ' bad' : ''}">${v}</text>`;
      } else if (game.notes[i]) {
        const nm = game.notes[i];
        for (let d = 1; d <= 9; d++) {
          if (!(nm & (1 << (d - 1)))) continue;
          const x = c * S + 10 + ((d - 1) % 3) * 14, y = r * S + 11 + Math.floor((d - 1) / 3) * 13.5;
          dig += `<text x="${x}" y="${y}" class="note${d === selVal ? ' hit' : ''}">${d}</text>`;
        }
      }
    }
    V.hl.innerHTML = hl;
    V.dig.innerHTML = dig;
    updatePad();
  }

  /* ---------- Zahlenfeld ---------- */
  function buildPad() {
    let html = '';
    for (let d = 1; d <= 9; d++) html += `<button type="button" data-d="${d}" aria-label="Ziffer ${d}">${d}<span class="left"></span></button>`;
    $('pad').innerHTML = html;
    for (const b of $('pad').querySelectorAll('button')) {
      b.addEventListener('click', () => input(Number(b.dataset.d)));
    }
  }
  function updatePad() {
    const P = game.P;
    const per = P.n / 9;
    const counts = new Array(10).fill(0);
    for (const v of game.values) if (v) counts[v]++;
    for (const b of $('pad').querySelectorAll('button')) {
      const d = Number(b.dataset.d);
      const left = per - counts[d];
      b.querySelector('.left').textContent = left > 0 ? left : '';
      b.classList.toggle('done', left <= 0);
    }
    $('pad').classList.toggle('notes', notesMode);
    $('notesBtn').setAttribute('aria-pressed', String(notesMode));
  }

  function buildRules() {
    const P = game.P;
    const seen = [];
    for (const g of P.grids) if (!seen.includes(g.type)) seen.push(g.type);
    let html = '';
    if (P.grids.length > 1) {
      html += `<li><i style="background:var(--sheet)"></i><span><b>Verschachtelt</b>Jedes der ${P.grids.length} Gitter ist ein eigenes Sudoku. Blöcke, die zwei Gittern gehören, müssen für beide stimmen.</span></li>`;
    }
    for (const t of seen) {
      const T = G.TYPES[t];
      html += `<li><i style="background:var(--t-${t})"></i><span><b>${T.name}</b>${t === 'classic' && P.grids.length > 1 ? 'Nichts Besonderes: Zeilen, Spalten und Blöcke enthalten 1–9.' : T.rule}</span></li>`;
    }
    $('rulesList').innerHTML = html;
    if (window.matchMedia('(max-width: 860px)').matches) $('rules').open = false;
  }

  /* ---------- Eingabe ---------- */
  function pushUndo(changes) {
    game.undo.push(changes);
    if (game.undo.length > 500) game.undo.shift();
  }

  function input(d) {
    if (!game || game.solved) return;
    const i = game.sel;
    if (i < 0) { toast('Wähle zuerst ein Feld.'); return; }
    if (game.P.givens[i]) return;
    const changes = [{ i, v: game.values[i], n: game.notes[i] }];
    if (notesMode) {
      if (game.values[i]) return;
      game.notes[i] ^= 1 << (d - 1);
    } else {
      if (game.values[i] === d) {
        game.values[i] = 0;
      } else {
        game.values[i] = d;
        game.notes[i] = 0;
        if (prefs.autoNotes) {
          const bit = 1 << (d - 1);
          for (const p of V.peers[i]) {
            if (game.notes[p] & bit) { changes.push({ i: p, v: game.values[p], n: game.notes[p] }); game.notes[p] &= ~bit; }
          }
        }
      }
    }
    pushUndo(changes);
    V.flash.clear();
    afterChange();
  }

  function erase() {
    if (!game || game.solved) return;
    const i = game.sel;
    if (i < 0 || game.P.givens[i]) return;
    if (!game.values[i] && !game.notes[i]) return;
    pushUndo([{ i, v: game.values[i], n: game.notes[i] }]);
    game.values[i] = 0; game.notes[i] = 0;
    afterChange();
  }

  function undo() {
    if (!game || game.solved) return;
    const ch = game.undo.pop();
    if (!ch) { toast('Nichts zum Rückgängigmachen.'); return; }
    for (let k = ch.length - 1; k >= 0; k--) { game.values[ch[k].i] = ch[k].v; game.notes[ch[k].i] = ch[k].n; }
    game.sel = ch[0].i;
    afterChange();
  }

  function hint() {
    if (!game || game.solved) return;
    const P = game.P;
    let i = game.sel;
    if (i < 0 || P.givens[i] || game.values[i] === P.solution[i]) {
      // Ein leeres oder falsches Feld nahe der Auswahl suchen
      const cands = [];
      for (let k = 0; k < P.n; k++) if (game.values[k] !== P.solution[k]) cands.push(k);
      if (!cands.length) return;
      if (i >= 0) {
        const [r0, c0] = P.cells[i];
        cands.sort((a, b) => {
          const [ra, ca] = P.cells[a], [rb, cb] = P.cells[b];
          return (Math.abs(ra - r0) + Math.abs(ca - c0)) - (Math.abs(rb - r0) + Math.abs(cb - c0));
        });
        i = cands[0];
      } else i = cands[Math.floor(Math.random() * cands.length)];
    }
    pushUndo([{ i, v: game.values[i], n: game.notes[i] }]);
    game.values[i] = P.solution[i];
    game.notes[i] = 0;
    game.hints++;
    game.sel = i;
    scrollToCell(i);
    afterChange();
  }

  function checkErrors() {
    const P = game.P;
    V.flash.clear();
    for (let i = 0; i < P.n; i++) if (game.values[i] && game.values[i] !== P.solution[i]) V.flash.add(i);
    renderDynamic();
    toast(V.flash.size ? `${V.flash.size} ${V.flash.size === 1 ? 'Ziffer ist' : 'Ziffern sind'} falsch (rot markiert).` : 'Bisher ist alles richtig.');
  }

  function afterChange() {
    renderDynamic();
    const P = game.P;
    let done = true;
    for (let i = 0; i < P.n; i++) if (game.values[i] !== P.solution[i]) { done = false; break; }
    if (done) win();
    saveGame();
  }

  function win() {
    game.solved = true;
    game.sel = -1;
    stopTimer();
    const id = game.P.variant;
    const st = stats[id] || (stats[id] = { solved: 0, best: {} });
    st.solved++;
    const diff = game.P.difficulty;
    const isBest = !game.hints && (!st.best[diff] || game.elapsed < st.best[diff]);
    if (isBest) st.best[diff] = Math.floor(game.elapsed);
    store.set('stats', stats);
    saveGame();
    renderDynamic();
    const hintText = game.hints ? ` mit ${game.hints} ${game.hints === 1 ? 'Tipp' : 'Tipps'}` : '';
    $('winText').textContent = `${game.P.name} (${G.DIFFICULTY[diff].name}) in ${fmtTime(game.elapsed)}${hintText}.${isBest ? ' Neue Bestzeit!' : ''}`;
    setTimeout(() => { $('winOverlay').hidden = false; $('winNext').focus(); }, 350);
  }

  /* ---------- Auswahl, Tastatur, Zeiger ---------- */
  function select(i) {
    game.sel = i;
    renderDynamic();
  }

  function moveSel(dr, dc) {
    const P = game.P;
    if (game.sel < 0) { select(0); return; }
    let [r, c] = P.cells[game.sel];
    for (let k = 0; k < Math.max(P.rows, P.cols); k++) {
      r += dr; c += dc;
      if (r < 0 || c < 0 || r >= P.rows || c >= P.cols) return;
      const id = V.pos[r * P.cols + c];
      if (id >= 0) { select(id); scrollToCell(id); return; }
    }
  }

  function scrollToCell(i) {
    const P = game.P;
    const wrap = $('boardWrap'), svg = $('board');
    const scale = svg.clientWidth / (P.cols * S + 2 * PAD);
    const [r, c] = P.cells[i];
    const x = (c * S + PAD) * scale + svg.offsetLeft, y = (r * S + PAD) * scale + svg.offsetTop;
    const cs = S * scale;
    if (x < wrap.scrollLeft || x + cs > wrap.scrollLeft + wrap.clientWidth) wrap.scrollLeft = x - wrap.clientWidth / 2;
    if (y < wrap.scrollTop || y + cs > wrap.scrollTop + wrap.clientHeight) wrap.scrollTop = y - wrap.clientHeight / 2;
  }

  function cellFromEvent(e) {
    const P = game.P;
    const svg = $('board');
    const rect = svg.getBoundingClientRect();
    const vbW = P.cols * S + 2 * PAD, vbH = P.rows * S + 2 * PAD;
    const x = (e.clientX - rect.left) / rect.width * vbW - PAD;
    const y = (e.clientY - rect.top) / rect.height * vbH - PAD;
    const c = Math.floor(x / S), r = Math.floor(y / S);
    if (r < 0 || c < 0 || r >= P.rows || c >= P.cols) return -1;
    return V.pos[r * P.cols + c];
  }

  function bindBoard() {
    const svg = $('board');
    let down = null;
    svg.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY }; });
    svg.addEventListener('pointerup', (e) => {
      if (!game || !down) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y) > 10;
      down = null;
      if (moved) return; // war ein Wischen zum Scrollen
      const id = cellFromEvent(e);
      if (id >= 0) select(id);
    });
    document.addEventListener('keydown', (e) => {
      if ($('game').hidden || !game) return;
      if (!$('confirmOverlay').hidden || !$('winOverlay').hidden) return;
      if (e.target && (e.target.tagName === 'INPUT')) return;
      const k = e.key;
      if (/^[1-9]$/.test(k)) { input(Number(k)); e.preventDefault(); return; }
      if (k === 'Backspace' || k === 'Delete' || k === '0') { erase(); e.preventDefault(); return; }
      if (k === 'ArrowUp') { moveSel(-1, 0); e.preventDefault(); return; }
      if (k === 'ArrowDown') { moveSel(1, 0); e.preventDefault(); return; }
      if (k === 'ArrowLeft') { moveSel(0, -1); e.preventDefault(); return; }
      if (k === 'ArrowRight') { moveSel(0, 1); e.preventDefault(); return; }
      if (k === 'n' || k === 'N' || k === ' ') { toggleNotes(); e.preventDefault(); return; }
      if ((e.ctrlKey || e.metaKey) && (k === 'z' || k === 'Z')) { undo(); e.preventDefault(); return; }
      if (k === 'h' || k === 'H') { hint(); e.preventDefault(); }
      if (k === 'Escape') { closeMenu(); }
    });
  }

  function toggleNotes() { notesMode = !notesMode; updatePad(); }

  /* ---------- Zoom ---------- */
  function applyZoom(reset) {
    if (!game) return;
    const P = game.P;
    const wrap = $('boardWrap');
    const style = getComputedStyle(wrap);
    const inner = wrap.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    let fit = inner;
    if (P.grids.length === 1) {
      // Einzelgitter: ganz sichtbar, auch in der Höhe
      const narrow = window.matchMedia('(max-width: 860px)').matches;
      const maxH = parseFloat(style.maxHeight);
      const availH = narrow || !maxH ? Infinity : maxH - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom) - 4;
      fit = Math.max(240, Math.min(inner, 620, availH));
    }
    if (reset || game.zoom == null) {
      // Riesen-Rätsel: mindestens ~30 px pro Feld, damit man treffen kann
      game.zoom = P.grids.length === 1 ? 1 : Math.max(1, Math.min(3, (30 * P.cols) / fit));
    }
    const w = Math.round(fit * game.zoom);
    const svg = $('board');
    svg.style.width = w + 'px';
    svg.style.height = Math.round(w * (P.rows * S + 2 * PAD) / (P.cols * S + 2 * PAD)) + 'px';
  }
  function zoomBy(f) {
    if (!game) return;
    const wrap = $('boardWrap');
    const cx = (wrap.scrollLeft + wrap.clientWidth / 2) / Math.max(1, $('board').clientWidth);
    const cy = (wrap.scrollTop + wrap.clientHeight / 2) / Math.max(1, $('board').clientHeight);
    game.zoom = Math.max(1, Math.min(4, game.zoom * f));
    applyZoom(false);
    wrap.scrollLeft = cx * $('board').clientWidth - wrap.clientWidth / 2;
    wrap.scrollTop = cy * $('board').clientHeight - wrap.clientHeight / 2;
  }

  /* ---------- Zeit ---------- */
  function startTimer() {
    stopTimer();
    $('timer').textContent = fmtTime(game.elapsed);
    let last = performance.now();
    let sinceSave = 0;
    timerId = setInterval(() => {
      const now = performance.now();
      const dt = (now - last) / 1000;
      last = now;
      if (!game || game.solved || document.hidden || $('game').hidden) return;
      game.elapsed += dt;
      sinceSave += dt;
      $('timer').textContent = fmtTime(game.elapsed);
      if (sinceSave > 10) { sinceSave = 0; saveGame(); }
    }, 500);
  }
  function stopTimer() { clearInterval(timerId); timerId = 0; }

  /* ---------- Menü ---------- */
  function closeMenu() { $('menu').hidden = true; $('menuBtn').setAttribute('aria-expanded', 'false'); }

  function bindUI() {
    for (const b of $('diffSeg').querySelectorAll('button')) {
      b.onclick = () => { prefs.difficulty = b.dataset.diff; savePrefs(); renderHome(); };
    }
    $('backBtn').onclick = () => { saveGame(); stopTimer(); closeMenu(); renderHome(); showScreen('home'); };
    $('menuBtn').onclick = (e) => {
      e.stopPropagation();
      const open = $('menu').hidden;
      $('menu').hidden = !open;
      $('menuBtn').setAttribute('aria-expanded', String(open));
    };
    document.addEventListener('click', (e) => { if (!$('menu').contains(e.target)) closeMenu(); });
    $('newBtn').onclick = async () => {
      closeMenu();
      if (!game.solved && game.values.some((v, i) => v && !game.P.givens[i])) {
        if (!(await confirmBox('Neues Rätsel?', 'Der aktuelle Fortschritt geht verloren.'))) return;
      }
      stopTimer();
      startNew(game.P.variant);
    };
    $('restartBtn').onclick = async () => {
      closeMenu();
      if (!(await confirmBox('Von vorn beginnen?', 'Alle eigenen Ziffern und Notizen werden gelöscht. Die Zeit läuft weiter.'))) return;
      game.values = game.P.givens.slice();
      game.notes = new Array(game.P.n).fill(0);
      game.undo = [];
      game.solved = false;
      V.flash.clear();
      renderDynamic();
      saveGame();
      startTimer();
    };
    $('checkBtn').onclick = () => { closeMenu(); checkErrors(); };
    $('liveErrors').checked = prefs.liveErrors;
    $('liveErrors').onchange = (e) => { prefs.liveErrors = e.target.checked; savePrefs(); if (game) renderDynamic(); };
    $('autoNotes').checked = prefs.autoNotes;
    $('autoNotes').onchange = (e) => { prefs.autoNotes = e.target.checked; savePrefs(); };
    $('notesBtn').onclick = toggleNotes;
    $('eraseBtn').onclick = erase;
    $('undoBtn').onclick = undo;
    $('hintBtn').onclick = hint;
    $('zoomIn').onclick = () => zoomBy(1.3);
    $('zoomOut').onclick = () => zoomBy(1 / 1.3);
    $('zoomFit').onclick = () => { game.zoom = 1; applyZoom(false); };
    $('winNext').onclick = () => { $('winOverlay').hidden = true; startNew(game.P.variant); };
    $('winHome').onclick = () => { $('winOverlay').hidden = true; renderHome(); showScreen('home'); };
    window.addEventListener('resize', () => { if (game && !$('game').hidden) applyZoom(false); });
    window.addEventListener('pagehide', saveGame);
    document.addEventListener('visibilitychange', () => { if (document.hidden) saveGame(); });
  }

  bindUI();
  bindBoard();
  renderHome();
  showScreen('home');
})();

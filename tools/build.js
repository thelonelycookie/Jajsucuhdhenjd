// Baut eine einzelne, eigenständige HTML-Datei (dist/sudoku-mosaik.html) – zum Teilen oder für App-Hüllen.
// Mit --fragment entsteht zusätzlich eine Variante ohne <html>/<head>-Gerüst (dist/fragment.html).
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
let html = read('index.html');
html = html.replace('<link rel="stylesheet" href="css/style.css">', () => `<style>\n${read('css/style.css')}</style>`);
for (const f of ['js/engine.js', 'js/generator.js', 'js/app.js']) {
  html = html.replace(`<script src="${f}"></script>`, () => `<script>\n${read(f)}</script>`);
}
html = html.replace(/<link rel="(manifest|icon|apple-touch-icon)"[^>]*>\n?/g, '');
html = html.replace(/<script>\s*if \('serviceWorker'[\s\S]*?<\/script>\n?/, '');
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist/sudoku-mosaik.html'), html);
console.log('dist/sudoku-mosaik.html', (html.length / 1024).toFixed(0) + ' KB');
if (process.argv.includes('--fragment')) {
  const head = html.match(/<head>([\s\S]*)<\/head>/)[1]
    .replace(/<meta charset[^>]*>\n?/, '').replace(/<meta name="viewport"[^>]*>\n?/, '');
  const body = html.match(/<body>([\s\S]*)<\/body>/)[1];
  fs.writeFileSync(path.join(root, 'dist/fragment.html'), head + body);
  console.log('dist/fragment.html');
}

// Builds dist/XAIlinx.html: the whole Project Navigator in one self-contained HTML file
// (no server). Projects live in the browser's localStorage; the examples are embedded.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'dist', 'XAIlinx.html');
const rd = p => fs.readFileSync(path.join(ROOT, p), 'utf8');

// ---- embedded examples
function readTree(dir, base = '') {
  const out = {};
  for (const e of fs.readdirSync(path.join(dir, base), { withFileTypes: true })) {
    const rel = base ? `${base}/${e.name}` : e.name;
    if (e.isDirectory()) Object.assign(out, readTree(dir, rel));
    else if (rel !== 'xailinx.json') out[rel] = fs.readFileSync(path.join(dir, rel), 'utf8');
  }
  return out;
}
const examples = {};
for (const e of fs.readdirSync(path.join(ROOT, 'examples'), { withFileTypes: true })) {
  const dir = path.join(ROOT, 'examples', e.name);
  if (!e.isDirectory() || !fs.existsSync(path.join(dir, 'xailinx.json'))) continue;
  examples[e.name] = { json: JSON.parse(fs.readFileSync(path.join(dir, 'xailinx.json'), 'utf8')), files: readTree(dir) };
}

// ---- bundle the app with the local (server-less) API
const plugin = {
  name: 'xailinx-standalone',
  setup(b) {
    b.onResolve({ filter: /^\/core\// }, a => ({ path: path.join(ROOT, a.path) }));
    b.onResolve({ filter: /^\.\/api\.js$/ }, a => (a.importer.includes(`${path.sep}web${path.sep}js${path.sep}`) ? { path: path.join(ROOT, 'web/js/api-local.js') } : undefined));
    b.onResolve({ filter: /^xailinx-examples$/ }, () => ({ path: 'xailinx-examples', namespace: 'virtual' }));
    b.onLoad({ filter: /.*/, namespace: 'virtual' }, () => ({ contents: `export default ${JSON.stringify(examples)};`, loader: 'js' }));
  },
};
const res = await esbuild.build({
  entryPoints: [path.join(ROOT, 'web/js/app.js')],
  bundle: true, format: 'esm', minify: true, write: false, target: 'es2022', plugins: [plugin], logLevel: 'warning',
});
const appJs = res.outputFiles[0].text;

// ---- inline everything into index.html
let html = rd('web/index.html');
const safeJs = js => js.replace(/<\/script/gi, '<\\/script');
const safeCss = css => css.replace(/<\/style/gi, '<\\/style');
html = html.replace(/<link rel="stylesheet" href="([^"]+)">/g, (m, href) => {
  const file = href.startsWith('/vendor/codemirror/') ? `node_modules/codemirror/${href.slice(19)}` : `web${href}`;
  return fs.existsSync(path.join(ROOT, file)) ? `<style>${safeCss(rd(file))}</style>` : '';
});
html = html.replace(/<script src="([^"]+)"><\/script>/g, (m, src) => {
  const file = src.startsWith('/vendor/codemirror/') ? `node_modules/codemirror/${src.slice(19)}`
    : src.startsWith('/vendor/elk/') ? `node_modules/elkjs/lib/${src.slice(12)}` : `web${src}`;
  return `<script>${safeJs(rd(file))}</script>`;
});
html = html.replace('<script type="module" src="/js/app.js"></script>',
  `<script>window.XAILINX_STANDALONE = true;</script>\n<script type="module">${safeJs(appJs)}</script>`);
html = html.replace('<title>XAIlinx Project Navigator</title>', '<title>XAIlinx Project Navigator (standalone)</title>');
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, html);
console.log(`wrote ${path.relative(ROOT, OUT)} (${(html.length / 1024 / 1024).toFixed(2)} MB)`);

// Builds dist/Silinx-ISE.html: the whole Project Navigator in one self-contained HTML file
// (no server). Projects live in the browser's localStorage; the examples are embedded.
//   node scripts/build-standalone.mjs [--site <dir>] [--assets-url <site URL>]
//   node scripts/build-standalone.mjs --assets-only <assets dir>
// --site also writes the GitHub Pages site (.github/workflows/pages.yml): the page as index.html and
// Silinx-ISE.html, index.html's web app manifest and service worker (scripts/pwa.mjs, #1051), and assets/ with what the Silinx toolchain fetches in the browser
// (web/js/open-flow-browser.js): the device descriptions (packages/silinx-fpga/devices), the bit database
// (packages/silinx-fpga/bitdb) and Yosys in WebAssembly (node_modules/@yowasp/yosys/gen).
// The assets are versioned (#487): assets/<version>/ (a development build: assets/dev-<commit>/) holds
// the device descriptions and the bit database, assets/vendor/yowasp-yosys/<its version>/ Yosys (the
// versions with the same Yosys share it); the page knows its folder, and the single file the site it
// fetches them from (--assets-url, default the published site; dev/ for a development build), so a
// downloaded Silinx-ISE.html keeps the assets it was built with. --assets-only writes this version's
// assets alone into an assets folder (the Pages build keeps the last releases' assets with it).
// The page carries a Content-Security-Policy (server/csp.js) with the hashes of its inline scripts.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildInfo, devChanges } from './build-info.mjs';
import { VERSION, versionLabel } from '../core/version.js';
import { THIRD_PARTY } from '../core/third-party.js';
import { contentSecurityPolicy, inlineScriptHashes, withMetaCsp } from '../server/csp.js';
import { withManifestLink, writePwa } from './pwa.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'dist', 'Silinx-ISE.html');
const rd = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
const arg = name => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : undefined; };

// the version label: the release's commit, or the development commit built (core/version.js BUILD)
const BUILD = buildInfo(ROOT, VERSION);
// ---- the assets' layout (web/js/open-flow-browser.js LAYOUT)
const YOSYS_VERSION = JSON.parse(rd('node_modules/@yowasp/yosys/package.json')).version;
// nextpnr in WebAssembly (the nextpnr engine, #2136): its bundle and, beside it in ../chipdb, each device's chip database
const NEXTPNR_VERSION = JSON.parse(rd('node_modules/@silinx/nextpnr-himbaechel-spartan3e/package.json')).version;
const PUBLISHED = 'https://pmnmalo.github.io/Silinx-ISE/';
const LAYOUT = {
  dir: BUILD ? `dev-${BUILD.commit}/` : `${VERSION}/`,
  yosys: `../vendor/yowasp-yosys/${YOSYS_VERSION}/gen/bundle.js`,
  nextpnr: `../vendor/nextpnr-spartan/${NEXTPNR_VERSION}/gen/bundle.js`,
  // (the iCE40's: not published, from npm's registry on its first run, at package-lock.json's version and SHA-512, #2444)
  nextpnrIce40Package: (({ resolved: url, integrity }) => ({ url, integrity }))(JSON.parse(rd('package-lock.json')).packages['node_modules/@yowasp/nextpnr-ice40']),
  site: new URL(arg('--assets-url') || (BUILD ? `${PUBLISHED}dev/` : PUBLISHED)).href,
};
// the assets this version publishes (writeAssets): their folder under assets/, where they come from, which files
const ASSET_DIRS = [
  [`${LAYOUT.dir}devices`, 'packages/silinx-fpga/devices', f => f.endsWith('.json.gz')],
  [`${LAYOUT.dir}bitdb`, 'packages/silinx-fpga/bitdb', f => f.endsWith('.json')],
  [`vendor/yowasp-yosys/${YOSYS_VERSION}/gen`, 'node_modules/@yowasp/yosys/gen', () => true],
  [`vendor/nextpnr-spartan/${NEXTPNR_VERSION}/gen`, 'node_modules/@silinx/nextpnr-himbaechel-spartan3e/gen', () => true],
  [`vendor/nextpnr-spartan/${NEXTPNR_VERSION}/chipdb`, 'node_modules/@silinx/nextpnr-himbaechel-spartan3e/chipdb', f => f.endsWith('.bin.gz')],
];
// each one's SHA-256 by its path under assets/, checked by the browser's cache before it keeps or uses a copy (#1237)
LAYOUT.integrity = {};
for (const [dir, from, filter] of ASSET_DIRS) {
  for (const f of fs.readdirSync(path.join(ROOT, from)).sort()) {
    const src = path.join(ROOT, from, f);
    if (fs.statSync(src).isFile() && filter(f)) LAYOUT.integrity[`${dir}/${f}`] = `sha256-${crypto.createHash('sha256').update(fs.readFileSync(src)).digest('base64')}`;
  }
}
const copyDir = (from, to, filter = () => true) => {
  fs.mkdirSync(to, { recursive: true });
  let n = 0, bytes = 0;
  for (const f of fs.readdirSync(from)) {
    const src = path.join(from, f);
    if (!fs.statSync(src).isFile() || !filter(f)) continue;
    fs.copyFileSync(src, path.join(to, f));
    n++; bytes += fs.statSync(src).size;
  }
  return { n, bytes };
};
/** This version's assets in the folder `assets` (a site's assets/), as LAYOUT names them. */
function writeAssets(assets) {
  const yosys = path.join(assets, 'vendor/yowasp-yosys', YOSYS_VERSION);
  const parts = ASSET_DIRS.map(([dir, from, filter]) => [dir, copyDir(path.join(ROOT, from), path.join(assets, dir), filter)]);
  // the licence of the WebAssembly Yosys published with the site (ISC; THIRD-PARTY-NOTICES.md)
  for (const f of ['LICENSE.txt', 'LICENSE', 'package.json']) {
    const src = path.join(ROOT, 'node_modules/@yowasp/yosys', f);
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(yosys, f));
  }
  // (nextpnr's: its package.json, with its licence's terms)
  fs.copyFileSync(path.join(ROOT, 'node_modules/@silinx/nextpnr-himbaechel-spartan3e/package.json'), path.join(assets, 'vendor/nextpnr-spartan', NEXTPNR_VERSION, 'package.json'));
  for (const [k, { n, bytes }] of parts) console.log(`  assets/${k}: ${n} file(s), ${(bytes / 1024 / 1024).toFixed(1)} MB`);
}
if (arg('--assets-only')) {
  writeAssets(path.resolve(arg('--assets-only')));
  process.exit(0);
}
const esbuild = await import('esbuild');

// ---- embedded examples
function readTree(dir, base = '') {
  const out = {};
  for (const e of fs.readdirSync(path.join(dir, base), { withFileTypes: true })) {
    // hidden files (a Mac's .DS_Store) are not part of a project: the server skips them too
  if (e.name.startsWith('.')) continue;
  const rel = base ? `${base}/${e.name}` : e.name;
    if (e.isDirectory()) Object.assign(out, readTree(dir, rel));
    else if (rel !== 'silinx.json') out[rel] = fs.readFileSync(path.join(dir, rel), 'utf8');
  }
  return out;
}
// the projects of a folder of templates: the examples, the test designs (#1746)
function templates(folder) {
  const out = {};
  for (const e of fs.readdirSync(path.join(ROOT, folder), { withFileTypes: true })) {
    const dir = path.join(ROOT, folder, e.name);
    if (!e.isDirectory() || !fs.existsSync(path.join(dir, 'silinx.json'))) continue;
    out[e.name] = { json: JSON.parse(fs.readFileSync(path.join(dir, 'silinx.json'), 'utf8')), files: readTree(dir) };
  }
  return out;
}
const examples = templates('examples');
const testDesigns = templates('test-designs');

// ---- bundle the app with the local (server-less) API
const plugin = {
  name: 'silinx-standalone',
  setup(b) {
    b.onResolve({ filter: /^\/(core|packages)\// }, a => ({ path: path.join(ROOT, a.path) }));
    b.onResolve({ filter: /^\.\/api\.js$/ }, a => (a.importer.includes(`${path.sep}web${path.sep}js${path.sep}`) ? { path: path.join(ROOT, 'web/js/api-local.js') } : undefined));
    b.onResolve({ filter: /^silinx-(examples|test-designs)$/ }, a => ({ path: a.path, namespace: 'virtual' }));
    b.onLoad({ filter: /.*/, namespace: 'virtual' }, a => ({ contents: `export default ${JSON.stringify(a.path === 'silinx-test-designs' ? testDesigns : examples)};`, loader: 'js' }));
  },
};
// a development build's changes since the last release, its Development menu (#707): a release has none
if (BUILD) Object.assign(BUILD, await devChanges(ROOT));
console.log(`Version: ${VERSION}${BUILD ? ` (development build dev:${BUILD.commit}, ${BUILD.changes.length} change(s) since ${BUILD.since})` : ''}`);
const define = { __SILINX_BUILD__: JSON.stringify(BUILD) };
const res = await esbuild.build({
  entryPoints: [path.join(ROOT, 'web/js/app.js')],
  bundle: true, format: 'esm', minify: true, write: false, target: 'es2022', plugins: [plugin], logLevel: 'warning', define,
});
const appJs = res.outputFiles[0].text;
// the Silinx toolchain's Web Worker (web/js/open-flow-worker.js), embedded as text: the page starts
// it from a Blob (a single file has no other file to load it from) as a classic worker, which a page
// opened from file:// can start and a module worker is not (#512): the bundle has no imports
const workerRes = await esbuild.build({
  entryPoints: [path.join(ROOT, 'web/js/open-flow-worker.js')],
  bundle: true, format: 'esm', minify: true, write: false, target: 'es2022', plugins: [plugin], logLevel: 'warning', platform: 'browser', define,
});
const workerJs = workerRes.outputFiles[0].text;
// the Board Emulator's compiled engine's Web Worker (web/js/emulator-worker.js, #427), embedded the same way
const emuWorkerRes = await esbuild.build({
  entryPoints: [path.join(ROOT, 'web/js/emulator-worker.js')],
  bundle: true, format: 'esm', minify: true, write: false, target: 'es2022', plugins: [plugin], logLevel: 'warning', platform: 'browser', define,
});
const emuWorkerJs = emuWorkerRes.outputFiles[0].text;

// ---- inline everything into index.html
let html = rd('web/index.html');
const safeJs = js => js.replace(/<\/script/gi, '<\\/script');
const safeCss = css => css.replace(/<\/style/gi, '<\\/style');
html = html.replace(/<link rel="stylesheet" href="([^"]+)">/g, (m, href) => {
  const file = `web${href}`;
  return fs.existsSync(path.join(ROOT, file)) ? `<style>${safeCss(rd(file))}</style>` : '';
});
html = html.replace(/<script src="([^"]+)"><\/script>/g, (m, src) => {
  const file = src.startsWith('/vendor/elk/') ? `node_modules/elkjs/lib/${src.slice(12)}` : `web${src}`;
  return `<script>${safeJs(rd(file))}</script>`;
});
// the editor's modules are in the bundle (esbuild resolves them in node_modules): no import map
html = html.replace(/<!-- the editor \(CodeMirror 6[\s\S]*?<script type="importmap">[\s\S]*?<\/script>\n/, '');
if (html.includes('importmap')) throw new Error('web/index.html: the import map was not removed');
// replacer functions: the inserted code may contain `$'`, `$&`… which a replacement string would expand
html = html.replace('<script type="module" src="/js/app.js"></script>',
  () => `<script>window.SILINX_STANDALONE = true;\nwindow.SILINX_ASSET_LAYOUT = ${safeJs(JSON.stringify(LAYOUT))};\nwindow.SILINX_FLOW_WORKER_SRC = ${safeJs(JSON.stringify(workerJs))};\nwindow.SILINX_EMU_WORKER_SRC = ${safeJs(JSON.stringify(emuWorkerJs))};</script>\n<script type="module">${safeJs(appJs)}</script>`);
html = html.replace('<title>Silinx ISE Project Navigator</title>', () => '<title>Silinx ISE Project Navigator (standalone)</title>');
if (!html.includes(safeJs(appJs))) throw new Error('the app bundle was not inserted verbatim into the page');
// copyright and the licences of the components embedded in this single file (NOTICE + their texts
// from THIRD-PARTY-NOTICES.md), kept in the page as plain text
{
  const notices = fs.readFileSync(path.join(ROOT, 'THIRD-PARTY-NOTICES.md'), 'utf8');
  // (the npm components marked standalone: the editor's modules and elkjs)
  const embedded = THIRD_PARTY.filter(c => c.standalone && !c.ported);
  const sections = new Map([...notices.matchAll(/^## (\S+) (\S+) [^\n]*\n[\s\S]*?\n```\n/gm)].map(m => [`${m[1]} ${m[2]}`, m[0]]));
  const parts = embedded.map(c => sections.get(`${c.name} ${c.version}`));
  if (!embedded.length || parts.some(p => !p)) throw new Error('THIRD-PARTY-NOTICES.md: the sections of the embedded components were not found (run node scripts/third-party.mjs)');
  const text = `${fs.readFileSync(path.join(ROOT, 'NOTICE'), 'utf8')}\n${fs.readFileSync(path.join(ROOT, 'LICENSE'), 'utf8')}\n# Embedded components\n\n${parts.join('\n')}`;
  html = html.replace('</head>', () => `<script type="text/plain" id="silinx-notices">\n${safeJs(text)}\n</script>\n</head>`);
}
// the Content-Security-Policy (#487), last: the hashes of the page's inline scripts as they are; the
// single file also loads Yosys from the assets' site and fetches the assets from it
{
  const origin = new URL(LAYOUT.site).origin;
  html = withMetaCsp(html, contentSecurityPolicy({ hashes: inlineScriptHashes(html), scripts: [origin], connect: [origin], meta: true }));
}
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, html);
console.log(`wrote ${path.relative(ROOT, OUT)} (${(html.length / 1024 / 1024).toFixed(2)} MB)`);

// ---- the site (GitHub Pages): the page and its assets
const siteArg = process.argv.indexOf('--site');
if (siteArg > 0) {
  const site = path.resolve(process.argv[siteArg + 1] || 'site');
  fs.rmSync(site, { recursive: true, force: true });
  fs.mkdirSync(site, { recursive: true });
  // the page opened on the site, installable as an app (#1051); Silinx-ISE.html, the file people download, is not
  fs.writeFileSync(path.join(site, 'index.html'), withManifestLink(html));
  fs.writeFileSync(path.join(site, 'Silinx-ISE.html'), html);
  await writePwa(site, { esbuild, label: versionLabel(BUILD, VERSION), dev: !!BUILD });
  // what this site serves (its page's version and build): on the site, Check for Updates compares the
  // page open with it, not with GitHub's latest release (published minutes before the site is rebuilt)
  fs.writeFileSync(path.join(site, 'version.json'), `${JSON.stringify({ version: VERSION, build: BUILD && { commit: BUILD.commit, date: BUILD.date } })}\n`);
  writeAssets(path.join(site, 'assets'));
  console.log(`wrote the site in ${path.relative(ROOT, site) || site}`);
}

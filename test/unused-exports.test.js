// Exports nothing imports (#3543): a module of server/, core/, web/, bin/, scripts/ or a package's src/ exports a name
// only when another module (or a test, a script, a workflow, a page) uses it. A name used only in its own file is not
// exported; one used nowhere is removed. The packages' public API (silinx-fpga's entries, src/index.js, parts.js,
// node.js) is used by definition. LEFT lists the exceptions, each with its reason; it only shrinks (as
// test/code-size.test.js's list).
//
// What counts as a use: a named import (`import { a } from`), a named re-export (`export { a } from`), and, for a
// module named in a file otherwise (a namespace import, a dynamic import, `export *`, a path in a test, a page or a
// workflow), the module's exported names that the file holds as words. web/js/api-local.js stands in for api.js in
// the standalone build: a use of api.js's name is one of its too.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

// the exceptions, `file: 'names'`
const LEFT = {
  // kept for compatibility, as its comment says (the Spartan-3E-only view of the database)
  'core/devices.js': 'DEVICES',
  // what wizards.js exported before #405's split it exports still (test/new-source-module.test.js checks it)
  'web/js/wizards.js': 'createTopSource GOATCOUNTER_URL WHO_URL',
  // declared with MIN_ZOOM (`export const MAX_ZOOM = …, MIN_ZOOM = …`), which test/tasks.test.js reads: the check
  // takes a declaration's first name only
  'web/js/tasks-emu.js': 'MAX_ZOOM',
  // pinplanner.js imports emulator.js and hands the module to pinplanner-board.js, which calls it
  'web/js/emulator.js': 'injectStyle',
  // other sessions' files at #3543 (the drawings' parsers #3559 / #3554, Silinx HLS #3558, live sharing #3529, the
  // MCP server #3535, the 7-series in the browser #3143): a follow-up, #3599
  'core/asm.js': 'LANGS ASM_VERSION treeSubs',
  'core/c-axi.js': 'modeOf',
  'core/c-check.js': 'MAX_AP_WIDTH',
  'core/c-cosim.js': 'MAX_CYCLES callCycles wordCalls',
  'core/c-dataflow.js': 'NOT_COMB',
  'core/c-fixed.js': 'apCompare fixedDecimal',
  'core/c-float-units.js': 'unitName asked',
  'core/c-hdl.js': 'nodesOf',
  'core/c-interp.js': 'MAX_STEPS',
  'core/c-lex.js': 'KNOWN_HEADERS',
  'core/c-parse.js': 'STDINT',
  'core/c-pipe-sched.js': 'counterIndexed',
  'core/c-pointer.js': 'DEFAULT_DEPTH',
  'core/c-pragma.js': 'MADE IGNORED ARG_MODES',
  'core/c-print.js': 'typeText',
  'core/c-processes.js': 'region',
  'core/c-reshape.js': 'localReshape',
  'core/c-submodule.js': 'instantiated allocationLimits',
  'core/c-types.js': 'typeName',
  'core/c-union.js': 'scalarOf',
  'core/collab-client.js': 'applyAwarenessFrom',
  'core/collab-doc.js': 'LAYOUT_VERSION EDITABLE_RE',
  'core/collab-kinds.js': 'LIVE_KINDS',
  'core/collab-link.js': 'VIAS',
  'core/collab-model.js': 'DRAWING_KINDS',
  'core/fsm.js': 'FSM_VERSION MAX_WIDTH outputProblems formatEnv inputBits MAX_TABLE_INPUT_BITS TT_MAX_INPUTS',
  'core/hdl-c-expr.js': 'CMP REDUCE',
  'core/hdl-c.js': 'CModelError',
  'core/hls-fft-hdl.js': 'fftHdl',
  'core/logic.js': 'TT_VERSION MAX_INPUTS evalExpr normColumn',
  'server/mcp-collab.js': 'DEFAULT_SERVER',
  'server/mcp-grade.js': 'topPorts',
  'server/mcp-hdl.js': 'SIM_MODELS',
  'server/mcp-labs.js': 'projectIo lastRun',
  'server/mcp-processes.js': 'PROCESS_LIMITS',
  'server/mcp-timing.js': 'PATHS_FILE',
  'web/js/collab-bind.js': 'PIECE bindEditor',
  'web/js/collab-drawing.js': 'bindDrawing',
  'web/js/collab-follow.js': 'stopFollowing',
  'web/js/collab-meet.js': 'meetingPoint',
  'web/js/collab-share.js': 'RELAY_KEY',
  'web/js/open-flow-browser.js': 'nextpnrS6BundleUrl',
};

const PUBLIC = ['packages/silinx-fpga/src/index.js', 'packages/silinx-fpga/src/parts.js', 'packages/silinx-fpga/src/node.js'];
const CHECKED = f => /^(server|core|web|bin|scripts)\//.test(f) || /^packages\/[^/]+\/(src|bin)\//.test(f);
const SKIP = new Set(['node_modules', '.git', '.claude', 'devices', 'dist']);

/** The exports of the files (path -> text) that nothing uses: `file name` each. */
function unusedExports(text) {
  const resolve = (from, spec) => {
    let p;
    if (spec.startsWith('.')) p = path.posix.normalize(path.posix.join(path.posix.dirname(from), spec));
    else if (/^\/(core|packages|server)\//.test(spec)) p = spec.slice(1);
    else if (spec.startsWith('/')) p = 'web' + spec;   // (a page's /js/…)
    else if (spec === 'silinx-fpga') p = 'packages/silinx-fpga/src/index.js';
    else if (/^silinx-fpga\/(parts|node)$/.test(spec)) p = `packages/silinx-fpga/src/${spec.split('/')[1]}.js`;
    else return null;
    p = p.replace(/^(\.\.\/)+/, '');
    return text.has(p) ? p : null;
  };
  // each file's own exports (name -> local name), its named re-exports [name, from, its name there], its `export *`
  const defs = new Map(), reexp = new Map(), stars = new Map();
  for (const [f, t] of text) {
    const d = new Map(), r = [], s = [];
    // (the names it imports: an export list of one of them is a re-export, a moved module's old place's)
    const imported = new Map();
    for (const m of t.matchAll(/\bimport\s+(?:[\w$]+\s*,\s*)?\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/g)) {
      for (const part of m[1].split(',').map(x => x.trim()).filter(Boolean)) {
        const [a, b = a] = part.split(/\s+as\s+/).map(x => x.trim());
        imported.set(b, [resolve(f, m[2]), a]);
      }
    }
    for (const m of t.matchAll(/^export\s+(?:async\s+)?(?:function\s*\*?|const|let|var|class)\s+([A-Za-z_$][\w$]*)/gm)) d.set(m[1], m[1]);
    for (const m of t.matchAll(/^export\s*\{([^}]*)\}\s*(from\s*['"]([^'"]+)['"])?/gm)) {
      for (const part of m[1].split(',').map(x => x.trim()).filter(Boolean)) {
        const [a, b = a] = part.split(/\s+as\s+/).map(x => x.trim());
        if (m[2]) r.push([b, resolve(f, m[3]), a]);
        else if (imported.has(a)) r.push([b, ...imported.get(a)]);
        else d.set(b, a);
      }
    }
    for (const m of t.matchAll(/\bexport\s*\*\s*(as\s+\w+\s*)?from\s*['"]([^'"]+)['"]/g)) { const to = resolve(f, m[2]); if (to) s.push([to, !!m[1]]); }
    defs.set(f, d); reexp.set(f, r); stars.set(f, s);
  }
  const used = new Map([...text.keys()].map(f => [f, new Set()]));
  const mark = (f, n, seen = new Set()) => {
    if (!f || seen.has(`${f}:${n}`)) return;
    seen.add(`${f}:${n}`);
    used.get(f).add(n);
    if (f === 'web/js/api.js') mark('web/js/api-local.js', n, seen);
    for (const [b, to, a] of reexp.get(f)) if (b === n) mark(to, a, seen);
    for (const [to, ns] of stars.get(f)) if (!ns) mark(to, n, seen);
  };
  const exported = (f, seen = new Set()) => {
    if (seen.has(f)) return [];
    seen.add(f);
    return [...defs.get(f).keys(), ...reexp.get(f).map(x => x[0]), ...stars.get(f).flatMap(([to]) => exported(to, seen))];
  };
  for (const r of reexp.values()) for (const [, to, a] of r) if (to) mark(to, a);
  for (const [f, t] of text) {
    const named = new Set();
    for (const m of t.matchAll(/\bimport\s+([\w$]+\s*,\s*)?\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/g)) {
      const to = resolve(f, m[3]);
      if (!to) continue;
      named.add(m[3]);
      for (const part of m[2].split(',').map(x => x.trim()).filter(Boolean)) mark(to, part.split(/\s+as\s+/)[0].trim());
    }
    for (const m of t.matchAll(/\bexport\s*\*\s*as\s+\w+\s*from\s*['"]([^'"]+)['"]/g)) { const to = resolve(f, m[1]); if (to) for (const n of exported(to)) mark(to, n); }
    let words = null;
    for (const m of t.matchAll(/['"`]([^'"`\n$]+?\.m?js)(?=[?'"`])/g)) {
      const quoted = m[1].replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
      if (named.has(m[1]) && !new RegExp(`import\\s+\\*|import\\s*\\(\\s*['"\`]${quoted}`).test(t)) continue;
      const to = resolve(f, m[1]);
      if (!to || to === f) continue;
      words ??= new Set(t.match(/[A-Za-z_$][\w$]*/g));
      for (const n of exported(to)) if (words.has(n)) mark(to, n);
    }
  }
  for (const e of PUBLIC) if (text.has(e)) for (const n of exported(e)) mark(e, n);
  const out = [];
  for (const [f, d] of defs) if (CHECKED(f)) for (const n of d.keys()) if (!used.get(f).has(n)) out.push(`${f} ${n}`);
  return out;
}

function repository() {
  const walk = dir => fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap(e => {
    const rel = path.posix.join(dir, e.name);
    if (e.isDirectory()) return SKIP.has(e.name) ? [] : walk(rel);
    return /\.(m?js|cjs|html|ya?ml|md)$/.test(e.name) || e.name === 'package.json' ? [rel] : [];
  });
  const files = ['server', 'core', 'web', 'packages', 'bin', 'scripts', 'test', 'research', 'relay', 'docs', '.github']
    .filter(d => fs.existsSync(path.join(ROOT, d))).flatMap(walk).concat(['package.json']);
  return new Map(files.map(f => [f, fs.readFileSync(path.join(ROOT, f), 'utf8')]));
}

test('no module exports a name nothing else uses, but the reviewed exceptions (#3543)', () => {
  const found = unusedExports(repository()).sort();
  const left = Object.entries(LEFT).flatMap(([f, ns]) => ns.split(' ').map(n => `${f} ${n}`)).sort();
  // (a name here and not in LEFT: un-export it, or remove it if its own file does not use it either; one in LEFT and
  // no longer found: take it out of LEFT)
  assert.deepEqual(found.filter(x => !left.includes(x)), [], 'exported, used by no other module');
  assert.deepEqual(left.filter(x => !found.includes(x)), [], 'in LEFT, no longer an unused export');
});

test('the check finds an export nothing uses, and sees each kind of use (#3543)', () => {
  const files = new Map(Object.entries({
    'core/a.js': 'export const A = 1;\nexport function unused() {}\nexport const viaNs = 2, viaDyn = 3;\nexport { A as B };\nexport const RE = 4;',
    'core/b.js': "import { A } from './a.js';\nimport * as M from './a.js';\nM.viaNs;\nexport { RE } from './a.js';",
    'core/c.js': "const { viaDyn } = await import('./a.js');\nexport const own = 1;\nown;",
    'core/old.js': "import { moved, gone } from './new.js';\nexport { moved };",
    'core/new.js': 'export const moved = 1, gone = 2;',
    'web/js/api.js': 'export const followJob = 1;',
    'web/js/api-local.js': 'export const followJob = 2;\nexport const extra = 3;',
    'web/js/x.js': "import { followJob } from './api.js';",
    'packages/silinx-fpga/src/index.js': "export * from './deep.js';",
    'packages/silinx-fpga/src/deep.js': 'export const api = 1;',
    'test/t.test.js': "import { B } from '../core/a.js';",
  }));
  assert.deepEqual(unusedExports(files).sort(), ['core/a.js unused', 'core/c.js own', 'web/js/api-local.js extra']);
});

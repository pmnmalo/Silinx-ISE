// The import gate (core/import-gate.js, #2830): a test per threat (a zip bomb, path traversal, XXE and billion laughs
// in every XML format, a script in every name, oversize and deeply nested sources, a file that is not what its name
// says), every refusal's message asserted, and the repository's own designs accepted with no refusal and no warning.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createZip, readZip } from '../core/zip.js';
import { GATE_LIMITS, GateError, gateEntries, gateFile, gateMessages, gateZip, kindOf, normalizePath } from '../core/import-gate.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
// (the server's codec: inflate stops past the size the entry declares)
const codec = { deflate: d => zlib.deflateRawSync(d), inflate: (d, limit) => zlib.inflateRawSync(d, { maxOutputLength: limit }) };
const refusal = (r, p) => r.refusals.find(x => x.path === p)?.reason;
const rejects = async (p, message) => { await assert.rejects(p, e => e instanceof GateError && e.message === message, message); };

// a zip whose central directory says what `patch` sets on each entry (dv, offset of the entry's central header)
async function patchedZip(files, patch) {
  const z = await createZip(files, codec);
  const dv = new DataView(z.buffer, z.byteOffset, z.byteLength);
  let eocd = z.length - 22;
  let p = dv.getUint32(eocd + 16, true);
  for (let n = 0; n < files.length; n++) {
    patch(dv, p, n);
    p += 46 + dv.getUint16(p + 28, true) + dv.getUint16(p + 30, true) + dv.getUint16(p + 32, true);
  }
  return z;
}

test('paths: canonical, and every escape refused with its reason', () => {
  assert.deepEqual(normalizePath('./src//top.vhd'), { path: 'src/top.vhd' });
  assert.deepEqual(normalizePath('src/é ü.v'), { path: 'src/é ü.v' });
  const cases = {
    '../x.vhd': "path leaves the project ('..')",
    'src/../../x.vhd': "path leaves the project ('..')",
    '/etc/passwd': 'absolute path',
    'C:/work/x.vhd': 'absolute path (a drive letter)',
    'c:x.vhd': 'absolute path (a drive letter)',
    'src\\..\\..\\x.vhd': 'backslash in the name',
    'src/a\0.vhd': 'control character in the name',
    'src/a\n.vhd': 'control character in the name',
    '.git/hooks/pre-commit': "hidden file or folder ('.git')",
    '.silinx/config.json': "hidden file or folder ('.silinx')",
    'src/.vscode/settings.json': "hidden file or folder ('.vscode')",
    'build/top.bit': "the project's build folder (build/) is Silinx's own",
    'BUILD/x.v': "the project's build folder (build/) is Silinx's own",
    'src/CON.vhd': "reserved name ('CON.vhd')",
    'nul': "reserved name ('nul')",
    'src/a.vhd.': "name ending with a space or a dot ('a.vhd.')",
    'src/a.vhd:stream': 'character not allowed in a name (< > : " | ? *): \'a.vhd:stream\'',
    '': 'no name',
    './': 'no name',
    ['x'.repeat(256) + '.v']: 'name longer than 255 characters',
    ['a/'.repeat(600) + 'b.v']: 'path longer than 1024 characters',
  };
  for (const [p, reason] of Object.entries(cases)) assert.deepEqual(normalizePath(p), { reason }, JSON.stringify(p));
  assert.deepEqual(normalizePath(42), { reason: 'no name' });
});

test('a script in a file name of every format is refused (< > " are not name characters)', () => {
  const payloads = ['<img src=x onerror=alert(1)>', '"><svg onload=alert(1)>', '<script>alert(1)</script>'];
  const exts = ['vhd', 'v', 'ucf', 'xise', 'sch', 'sym', 'pnml', 'wcfg', 'json', 'asm.json', 'sch.json', 'fsm.json', 'tt.json', 'pn.json', 'mem', 'coe', 'c', 'cpp', 'vcd'];
  for (const x of payloads) {
    for (const ext of exts) {
      const r = gateEntries([{ path: `src/${x}.${ext}`, data: 'x' }]);
      assert.equal(r.files.length, 0, `${x}.${ext}`);
      assert.match(r.refusals[0].reason, /^character not allowed in a name \(< > : " \| \? \*\)/);
    }
  }
});

test('names: duplicates by case, twice the same, a symbolic link in a zip', async () => {
  const r = gateEntries([{ path: 'src/Top.vhd', data: 'a' }, { path: 'src/top.vhd', data: 'b' }, { path: './src/Top.vhd', data: 'c' }]);
  assert.deepEqual(r.files.map(f => f.path), ['src/Top.vhd']);
  assert.deepEqual(gateMessages(r), ["src/top.vhd: not imported: same name as 'src/Top.vhd' but for its case", './src/Top.vhd: not imported: twice in the import']);
  // a Unix symbolic link (version made by 3: Unix; external attributes: S_IFLNK | 0777)
  const z = await patchedZip([{ path: 'src/a.vhd', data: 'entity a is end;\n' }, { path: 'src/passwd', data: '/etc/passwd' }],
    (dv, p, n) => { if (n === 1) { dv.setUint16(p + 4, (3 << 8) | 20, true); dv.setUint32(p + 38, (0o120777 << 16) >>> 0, true); } });
  const g = await gateZip(z, codec);
  assert.deepEqual(g.files.map(f => f.path), ['src/a.vhd']);
  assert.deepEqual(gateMessages(g), ['src/passwd: not imported: symbolic link']);
});

test('a traversal zip: its bad entries left out, never inflated, the rest imported', async () => {
  const files = [
    { path: 'p.xise', data: '<?xml version="1.0"?><project/>' },
    { path: '../../evil.vhd', data: 'x'.repeat(200) },
    { path: '/tmp/evil.v', data: 'x' },
    { path: 'C:/Windows/evil.v', data: 'x' },
    { path: 'src/ok.vhd', data: 'entity ok is end;\n' },
  ];
  const inflated = [];
  const spy = { inflate: (d, l) => { inflated.push(l); return codec.inflate(d, l); } };
  const g = await gateZip(await createZip(files, codec), spy);
  assert.deepEqual(g.files.map(f => f.path), ['p.xise', 'src/ok.vhd']);
  assert.deepEqual(gateMessages(g), ["../../evil.vhd: not imported: path leaves the project ('..')", '/tmp/evil.v: not imported: absolute path',
    'C:/Windows/evil.v: not imported: absolute path (a drive letter)']);
  assert.deepEqual(inflated, [], 'the refused deflated entry is not inflated');
});

test('zip bombs: the archive, the declared and the real decompressed sizes, the entry count', async () => {
  const big = new Uint8Array(4 << 20);   // 4 MB of zeros: a 4 KB deflated entry
  const one = await createZip([{ path: 'src/zeros.mem', data: big }], codec);
  assert.ok(one.length < 10000);
  // the archive itself
  await rejects(gateZip(new Uint8Array(GATE_LIMITS.maxArchive + 1), codec), 'the zip is larger than 64 MB, the most an import takes');
  // a file over the cap (declared)
  await rejects(gateZip(one, codec, { limits: { maxFile: 1 << 20 } }), 'cannot read zip: zip entry too large (src/zeros.mem: 4194304 bytes, at most 1048576)');
  // the total over the cap, file by file (none inflated past it)
  const many = await createZip(Array.from({ length: 8 }, (_, i) => ({ path: `m${i}.mem`, data: big })), codec);
  await rejects(gateZip(many, codec, { limits: { maxTotal: 20 << 20 } }), 'cannot read zip: zip too large once uncompressed (more than 20971520 bytes)');
  // a declared size that lies: 1 KB said, 4 MB inflated: stopped at the declared size
  const liar = await patchedZip([{ path: 'src/zeros.mem', data: big }], (dv, p) => dv.setUint32(p + 24, 1024, true));
  await assert.rejects(gateZip(liar, codec), e => e instanceof GateError && /^cannot read zip: zip entry larger than it declares or corrupt \(src\/zeros\.mem\)/.test(e.message));
  // a declared size of 4 GB: refused before anything is inflated
  const huge = await patchedZip([{ path: 'src/zeros.mem', data: big }], (dv, p) => dv.setUint32(p + 24, 0xffffffff, true));
  await rejects(gateZip(huge, codec), 'cannot read zip: zip entry too large (src/zeros.mem: 4294967295 bytes, at most 67108864)');
  // too many entries: refused before any is read
  const lots = await createZip(Array.from({ length: 30 }, (_, i) => ({ path: `f${i}.txt`, data: 'x' })), codec);
  await rejects(gateZip(lots, codec, { limits: { maxFiles: 20 } }), 'cannot read zip: zip has too many entries (30, at most 20)');
  // and entries already read: the count, the total
  await assert.throws(() => gateEntries(Array.from({ length: 30 }, (_, i) => ({ path: `f${i}`, data: 'x' })), { limits: { maxFiles: 20 } }),
    { message: 'the import has too many files (30, at most 20)' });
  await assert.throws(() => gateEntries([{ path: 'a.mem', data: big }, { path: 'b.mem', data: big }], { limits: { maxTotal: 6 << 20 } }),
    { message: 'the import is larger than 6 MB (8 MB)' });
});

test('readZip: onEntry refuses an entry before it is inflated, maxFiles is checked first', async () => {
  const z = await createZip([{ path: 'a.txt', data: 'a'.repeat(100) }, { path: 'b.txt', data: 'b'.repeat(100) }], codec);
  const seen = [];
  const r = await readZip(z, codec, { onEntry: e => { seen.push({ ...e }); return e.path === 'a.txt' ? 'no' : null; } });
  assert.deepEqual(r.map(e => e.path), ['b.txt']);
  assert.deepEqual(seen, [{ path: 'a.txt', size: 100, symlink: false }, { path: 'b.txt', size: 100, symlink: false }]);
  await assert.rejects(readZip(z, codec, { maxFiles: 1 }), { message: 'zip has too many entries (2, at most 1)' });
});

// XXE and billion laughs, in every XML format a project or a drawing comes in
const XXE = '<?xml version="1.0"?>\n<!DOCTYPE r [<!ENTITY x SYSTEM "file:///etc/passwd">]>\n';
const LAUGHS = '<?xml version="1.0"?>\n<!DOCTYPE lolz [<!ENTITY lol "lol"><!ENTITY lol2 "&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;">]>\n';
const ROOTS = { 'p.xise': '<project>&x;</project>', 'a.sch': '<drawing version="7">&x;</drawing>', 'a.sym': '<symbol version="7">&x;</symbol>',
  'n.pnml': '<pnml><net id="&x;"/></pnml>', 'w.wcfg': '<wave_config>&x;</wave_config>', 'i.svg': '<svg>&x;</svg>', 'd.xml': '<r>&x;</r>' };
test('XXE and billion laughs: refused in every XML format (.xise, .sch, .sym, PNML, .wcfg, .svg, .xml)', () => {
  const dtd = 'XML with a DTD (<!DOCTYPE>): external entities and entity expansion are not accepted';
  for (const [f, body] of Object.entries(ROOTS)) {
    assert.equal(kindOf(f), 'xml', f);
    for (const head of [XXE, LAUGHS, '<?xml version="1.0"?><!doctype r SYSTEM "http://evil/x.dtd">']) {
      const r = gateEntries([{ path: f, data: head + body }]);
      assert.deepEqual(r.refusals, [{ path: f, reason: dtd }], f);
      assert.throws(() => gateFile(f, head + body), { message: `${f}: ${dtd}` });
    }
    assert.deepEqual(gateEntries([{ path: f, data: `<?xml version="1.0"?><!ENTITY x "y">${body}` }]).refusals,
      [{ path: f, reason: 'XML with an entity declaration (<!ENTITY>): not accepted' }]);
  }
});

test('sources: oversize, long lines, deep nesting, long elsif chains (#2577) refused with their reasons', () => {
  const L = { maxText: 1000, maxLine: 100, maxDepth: 10, maxBranches: 5 };
  const one = (p, t, limits = L) => gateEntries([{ path: p, data: t }], { limits }).refusals[0]?.reason ?? null;
  assert.equal(one('a.vhd', 'x'.repeat(1001)), 'text file larger than 1000 bytes');
  assert.equal(one('a.vhd', 'x'.repeat(GATE_LIMITS.maxText + 1), GATE_LIMITS), 'text file larger than 16 MB');
  assert.equal(one('a.v', `${'x'.repeat(101)}\n`), 'line longer than 100 bytes');
  assert.equal(one('a.ucf', `NET a LOC=${'x'.repeat(200)};`), 'line longer than 100 bytes');
  assert.equal(one('a.json', `{"a":"${'x'.repeat(200)}"}`), null, 'a drawing\'s long line is not a source\'s');
  assert.equal(one('a.vhd', `x <= ${'('.repeat(11)}a${')'.repeat(11)};`), 'nesting deeper than 10 brackets');
  assert.equal(one('a.vhd', `-- ${'('.repeat(30)}\nx <= "${'('.repeat(30)}";`), null, 'brackets in comments and strings do not count');
  assert.equal(one('a.c', `int f(){ return ${'('.repeat(11)}1${')'.repeat(11)}; }`), 'nesting deeper than 10 brackets');
  assert.equal(one('a.vhd', `if a then x; ${'elsif a then x;\n'.repeat(6)} end if;`), 'more than 5 elsif / else if branches (#2577)');
  assert.equal(one('a.v', `if (a) x; ${'else if (a) x;\n'.repeat(6)}`), 'more than 5 elsif / else if branches (#2577)');
  assert.equal(one('a.sch.json', '['.repeat(11) + ']'.repeat(11)), 'JSON nested deeper than 10 levels');
  assert.equal(one('a.sch', `<a>${'<b>'.repeat(11)}${'</b>'.repeat(11)}</a>`), 'XML nested deeper than 10 elements');
  assert.equal(one('a.sch', `<a>${'<b/>'.repeat(30)}<!-- ${'<c>'.repeat(30)} --></a>`), null, 'self-closing tags and comments do not nest');
  // the defaults: an HDL source nested 300 deep, a 2000-branch chain
  assert.equal(one('a.vhd', `x <= ${'('.repeat(300)}a${')'.repeat(300)};`, GATE_LIMITS), 'nesting deeper than 256 brackets');
  assert.equal(one('a.vhd', `if a then x; ${'elsif a then x;\n'.repeat(2000)} end if;`, GATE_LIMITS), 'more than 1000 elsif / else if branches (#2577)');
});

test('types by content: a text file that is binary or a web page, active files; invalid UTF-8 replaced with a warning', () => {
  const r = gateEntries([
    { path: 'src/a.vhd', data: new Uint8Array([0x65, 0, 0x66]) },
    { path: 'src/b.vhd', data: '<!DOCTYPE html><html><script>alert(1)</script></html>' },
    { path: 'src/c.v', data: '\uFEFF  <script>alert(1)</script>' },
    { path: 'n.pnml', data: '<?xml version="1.0"?><html><body>x</body></html>' },
    { path: 'doc/index.html', data: '<p>x</p>' },
    { path: 'tools/run.js', data: 'x' },
    { path: 'tools/setup.exe', data: new Uint8Array([0x4d, 0x5a]) },
    { path: 'src/latin.vhd', data: new Uint8Array([0x2d, 0x2d, 0x20, 0xe9, 0x0a]) },   // '-- é' in Latin-1
    { path: 'build.bit', data: new Uint8Array([0, 9, 15, 240]) },                      // opaque: kept as it is
  ]);
  assert.deepEqual(gateMessages(r), [
    'src/a.vhd: not imported: binary content (a NUL byte) in a text file',
    'src/b.vhd: not imported: a web page (HTML), not the file its name says',
    'src/c.v: not imported: a web page (HTML), not the file its name says',
    'n.pnml: not imported: a web page (HTML), not the file its name says',
    'doc/index.html: not imported: a web page, script or program: not a project file',
    'tools/run.js: not imported: a web page, script or program: not a project file',
    'tools/setup.exe: not imported: a web page, script or program: not a project file',
    'src/latin.vhd: not valid UTF-8 (the invalid bytes replaced)',
  ]);
  assert.deepEqual(r.files.map(f => [f.path, f.kind, f.text]), [['src/latin.vhd', 'hdl', '-- \uFFFD\n'], ['build.bit', 'opaque', undefined]]);
  assert.equal(gateFile('src/x.vhd', '\uFEFFentity x is end;\n').text, 'entity x is end;\n', 'a BOM is dropped');
  assert.equal(gateFile('src/latin.vhd', new Uint8Array([0xe9])).warning, 'src/latin.vhd: not valid UTF-8 (the invalid bytes replaced)');
  assert.throws(() => gateFile('../x.vhd', 'x'), { message: "../x.vhd: path leaves the project ('..')" });
  assert.throws(() => gateFile('x.vhd', 'x'.repeat(65), { limits: { maxFile: 64 } }), { message: 'x.vhd: file larger than 64 bytes' });
});

// every file of the repository's designs: the examples, the ISE projects and schematics of the tests
function corpus() {
  const out = [];
  const walk = (dir, rel) => {
    for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
      if (d.name.startsWith('.')) continue;
      const r = rel ? `${rel}/${d.name}` : d.name;
      if (d.isDirectory()) walk(path.join(dir, d.name), r);
      else out.push({ path: r, data: fs.readFileSync(path.join(dir, d.name)) });
    }
  };
  walk(path.join(ROOT, 'examples'), 'examples');
  for (const f of ['ise-xise', 'ise-sch']) walk(path.join(ROOT, 'test/fixtures', f), f);
  return out;
}
test('the repository\'s designs pass the gate with no refusal and no warning', async () => {
  const all = corpus();
  assert.ok(all.length > 60, `${all.length} files`);
  const r = gateEntries(all);
  assert.deepEqual(gateMessages(r), []);
  assert.equal(r.files.length, all.length);
  for (const f of r.files) if (f.kind !== 'opaque') assert.equal(typeof f.text, 'string', f.path);
  // and as one zip
  const z = await gateZip(await createZip(all, codec), codec);
  assert.deepEqual(gateMessages(z), []);
  assert.deepEqual(z.files.map(f => f.path), all.map(f => f.path));
});

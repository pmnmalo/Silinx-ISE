// The identifier rules and the XML escapes, one copy of each (#3545: core/ident.js, core/escape.js). Each shared
// helper does what every copy it replaced did, on the same texts (the copies, as they were, are the reference here),
// and no module writes a copy again (the ones left are listed, each with its reason).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NAME_RE, isName, IDENT_RE, isIdent, FILE_RE } from '../core/ident.js';
import { escXml, escXmlApos, escXmlText } from '../core/escape.js';
import { IDENT } from '../server/ident.js';
import { iseIdent } from '../core/isesch-export.js';
import { signalOf } from '../core/path-drawing.js';
import { graphicsToIse } from '../core/isesch-graphics.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const NAMES = ['a', 'A', 'a1', 'a_b', 'clk_50MHz', 'x__y', 'y_', '_a', '__', '1a', '', ' a', 'a ', 'a-b', 'a.b', 'a$', 'é', 'a\n',
  'aé', 'ab_9_Z', 'A'.repeat(300), '9', '_', 'a[0]', 'tb_uut'];

test('NAME_RE / isName: the rule of the 13 copies replaced, /^[A-Za-z][A-Za-z0-9_]*$/ (#3545)', () => {
  const copy = /^[A-Za-z][A-Za-z0-9_]*$/;
  for (const s of NAMES) { assert.equal(isName(s), copy.test(s), s); assert.equal(NAME_RE.test(s), copy.test(s), s); }
  // (as the copies, a value that is not a string is tested as its text)
  for (const v of [undefined, null, 12, true]) assert.equal(isName(v), copy.test(v), String(v));
  assert.deepEqual(NAMES.filter(isName), ['a', 'A', 'a1', 'a_b', 'clk_50MHz', 'x__y', 'y_', 'ab_9_Z', 'A'.repeat(300), 'tb_uut']);
});

test('IDENT_RE / isIdent: a leading _ too, the copies /^[A-Za-z_][A-Za-z0-9_]*$/ and /^[A-Za-z_]\\w*$/ (#3545)', () => {
  const copies = [/^[A-Za-z_][A-Za-z0-9_]*$/, /^[A-Za-z_]\w*$/];
  for (const s of NAMES) for (const c of copies) assert.equal(isIdent(s), c.test(s), s);
  assert.equal(IDENT, IDENT_RE);   // (server/ident.js's, the project's tops)
  assert.deepEqual(NAMES.filter(s => isIdent(s) && !isName(s)), ['_a', '__', '_']);
  // the modules that use it, as before
  assert.equal(iseIdent('_a1'), '_a1');
  assert.equal(iseIdent('op code'), 'op_code');
  assert.equal(signalOf('u1.cnt[3]'), 'cnt');
  assert.equal(signalOf('u1.$auto'), null);
});

test('FILE_RE: the copies /^[A-Za-z][A-Za-z0-9_-]*$/ (#3545)', () => {
  const copy = /^[A-Za-z][A-Za-z0-9_-]*$/;
  for (const s of [...NAMES, 'my-file', '-a', 'a--b']) assert.equal(FILE_RE.test(s), copy.test(s), s);
  assert.ok(FILE_RE.test('my-file') && !FILE_RE.test('-a'));
});

const TEXTS = ['', 'plain', 'a & b', '<tag attr="v">', "it's", '"q" \'s\' <&>', '&amp;', '&&<<>>""\'\'', 'é ✓ \n\t', 0, 12.5, false];

test('escXml: the copies of the .xise, the schematic\'s SVG, the ISE schematic and the PNML (& < > ") (#3545)', () => {
  const copy = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  for (const s of TEXTS) assert.equal(escXml(s), copy(s), String(s));
  assert.equal(escXml('"q" \'s\' <&>'), '&quot;q&quot; \'s\' &lt;&amp;&gt;');
  // (the .xise's and the ISE schematic's copies took null / undefined as '': their modules keep that, escXml(s ?? ''))
  assert.equal(escXml(null), 'null');
});

test('escXmlApos: the wave configuration\'s copy (& < > " \') (#3545)', () => {
  const copy = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
  for (const s of TEXTS) assert.equal(escXmlApos(s), copy(s), String(s));
  assert.equal(escXmlApos("it's"), 'it&apos;s');
});

test('escXmlText: the ISE schematic graphics\' copy (& < >, no quote) (#3545)', () => {
  const copy = t => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  for (const s of TEXTS) assert.equal(escXmlText(s), copy(s), String(s));
  const X = v => v;
  assert.deepEqual(graphicsToIse([{ kind: 'text', x: 0, y: 0, text: 'a < "b" & \'c\'' }], X).map(l => l.replace(/^.*>(.*)<\/text>$/, '$1')),
    ['a &lt; "b" &amp; \'c\'']);
});

// the copies left, each with its reason; a module that writes the rule or an escape again fails here
const LEFT = {
  'core/ident.js': 'the rules',
  'core/escape.js': 'the escapes',
  // other sessions' files at #3545 (the drawings' parsers #3559 / #3554, Silinx HLS #3558, the MCP server #3535): a follow-up, #3599
  'core/asm.js': 'a follow-up', 'core/asm-gen.js': 'a follow-up', 'core/logic.js': 'a follow-up', 'core/c-pragma.js': 'a follow-up',
  'server/mcp-new-source.js': 'a follow-up', 'server/mcp-test-bench.js': 'a follow-up', 'server/mcp-wizards.js': 'a follow-up',
};
test('no module writes the identifier rules or an XML escape of its own (#3545)', () => {
  const COPY = /\^\[A-Za-z_?\]\[A-Za-z0-9_-?\]\*\$\/|\^\[A-Za-z_\]\\w\*\$\/|replace\(\/&\/g, '&amp;'\)\.replace\(\/<\/g/;
  const files = dir => fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap(e => {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) return e.name === 'node_modules' || e.name === 'devices' || e.name === 'research' || e.name === 'test' ? [] : files(rel);
    return /\.m?js$/.test(e.name) ? [rel] : [];
  });
  const found = ['server', 'core', 'web', 'packages', 'scripts', 'bin'].flatMap(files).filter(f => COPY.test(fs.readFileSync(path.join(ROOT, f), 'utf8')));
  assert.deepEqual(found.sort(), Object.keys(LEFT).sort());
});

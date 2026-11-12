// A design opened from a link (#2826, core/design-link.js): the design inside the link (encodeDesign / decodeDesign)
// round trip on every example, byte for byte, the HDL a drawing makes again left out; the link's hash (parseLink /
// makeLink); and the refusals of an untrusted link (#2829): too long, not base64url, a decompression bomb, a path
// that leaves the project, a zip address that is not https or is of this computer or a local network, names that
// are not names (markup).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { EXAMPLE_ORDER } from '../core/examples.js';
import { UI_LIMITS, benchNames, decodeUi, encodeUi, freeName, LINK_LIMITS, LINK_TESTING, TRY_DRAWING, tryDrawing, viewProblem, decodeDesign, designZip, encodeDesign, makeLink, parseLink, privateHost, sameFiles } from '../core/design-link.js';
import { readZip, textOf } from '../core/zip.js';

const ROOT = path.join(import.meta.dirname, '..', 'examples');
function exampleEntries(name) {
  const out = [];
  const walk = d => {
    for (const f of fs.readdirSync(path.join(ROOT, name, d), { withFileTypes: true })) {
      const rel = d ? `${d}/${f.name}` : f.name;
      if (f.isDirectory()) walk(rel); else out.push({ path: rel, data: new Uint8Array(fs.readFileSync(path.join(ROOT, name, rel))) });
    }
  };
  walk('');
  return out;
}
const textMap = entries => Object.fromEntries(entries.map(e => [e.path, typeof e.data === 'string' ? e.data : Buffer.from(e.data).toString('utf8')]));
// a design= made by hand from a payload (as a hostile link would be)
const b64url = buf => Buffer.from(buf).toString('base64url');
const raw = payload => b64url(zlib.deflateRawSync(Buffer.from(typeof payload === 'string' ? payload : JSON.stringify(payload))));
const rejects = (p, message) => assert.rejects(p, e => { assert.equal(e.linkError, true); assert.equal(e.message, message); return true; });
const throws = (f, message) => assert.throws(f, e => { assert.equal(e.linkError, true); assert.equal(e.message, message); return true; });

// the HDL each example's drawings make again (left out of the link), and the link's length
const LEFT = { gates: ['src/gates.vhd'], traffic: ['src/lamps.vhd', 'src/traffic.vhd'], blinky: ['src/speed_ctrl.vhd'] };

for (const name of EXAMPLE_ORDER) {
  test(`encodeDesign / decodeDesign: ${name}, every file back byte for byte`, async () => {
    const entries = exampleEntries(name);
    const e = await encodeDesign(entries);
    assert.equal(e.name, name);
    assert.deepEqual(e.left.sort(), LEFT[name] || []);
    assert.equal(e.length, e.design.length);
    assert.ok(e.length < LINK_LIMITS.maxEncoded);
    assert.match(e.design, /^[A-Za-z0-9_-]+$/);
    const d = await decodeDesign(e.design);
    assert.equal(d.name, name);
    assert.deepEqual(d.warnings, []);
    assert.equal(d.entries[0].path, 'silinx.json');
    const before = textMap(entries), after = textMap(d.entries);
    assert.deepEqual(Object.keys(after).sort(), Object.keys(before).sort());
    for (const p of Object.keys(before)) {
      if (p === 'silinx.json') assert.deepEqual(JSON.parse(after[p]), JSON.parse(before[p]));
      else assert.equal(after[p], before[p], p);
    }
    assert.ok(sameFiles(before, after));
    // as a Silinx export's zip, for the import
    const zip = await designZip(d.entries);
    assert.deepEqual((await readZip(zip, { inflate: x => zlib.inflateRawSync(x) })).map(z => z.path).sort(), Object.keys(before).sort());
  });
}

test('encodeDesign: the size of the examples\' links (gates, the smallest with a drawing, fits a slide tool\'s 2 000 characters? no: about 5 000)', async () => {
  const len = {};
  for (const n of ['gates', 'traffic', 'micro80']) len[n] = (await encodeDesign(exampleEntries(n))).length;
  assert.ok(len.gates > LINK_LIMITS.slides && len.gates < 8000, `gates ${len.gates}`);
  assert.ok(len.traffic < 12000, `traffic ${len.traffic}`);
  assert.ok(len.micro80 < 30000, `micro80 ${len.micro80}`);
});

test('encodeDesign: a file that is not text goes as base64 and comes back; a drawing\'s HDL edited by hand stays in the link', async () => {
  const entries = exampleEntries('gates');
  const vhd = entries.find(e => e.path === 'src/gates.vhd');
  vhd.data = new TextEncoder().encode(Buffer.from(vhd.data).toString() + '\n-- edited\n');
  entries.push({ path: 'doc/logo.png', data: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0xff, 0xfe, 0, 1]) });
  const e = await encodeDesign(entries);
  assert.deepEqual(e.left, []);
  const d = await decodeDesign(e.design);
  assert.match(textMap(d.entries)['src/gates.vhd'], /-- edited\n$/);
  assert.deepEqual([...d.entries.find(x => x.path === 'doc/logo.png').data], [0x89, 0x50, 0x4e, 0x47, 0xff, 0xfe, 0, 1]);
});

test('encodeDesign: too large for a link, not a project', async () => {
  const big = [{ path: 'silinx.json', data: JSON.stringify({ name: 'big', files: [] }) },
    { path: 'src/noise.vhd', data: Array.from({ length: 60000 }, (_, i) => ((i * 2654435761) >>> 0).toString(36)).join(' ') }];
  await assert.rejects(encodeDesign(big), e => e.linkError && /^the design is too large for a link \(\d+ characters, at most 64000\): export it as a \.zip \(Export Project \(\.zip\)…, Silinx\) and link to that$/.test(e.message));
  await rejects(encodeDesign([{ path: 'src/a.vhd', data: 'x' }]), 'not a Silinx project: no silinx.json');
});

test('decodeDesign: a broken link is refused with its reason', async () => {
  await rejects(decodeDesign(''), 'the link has no design');
  await rejects(decodeDesign('a'.repeat(LINK_LIMITS.maxEncoded + 1)), 'the design in the link is too long (64001 characters, at most 64000)');
  await rejects(decodeDesign('abc$def'), 'the design in the link is not base64url');
  await assert.rejects(decodeDesign('AAAAAAAA'), e => e.linkError && /^the design in the link does not decode \(/.test(e.message));
  await assert.rejects(decodeDesign(raw('{not json')), e => e.linkError && /^the design in the link does not decode \(/.test(e.message));
  await rejects(decodeDesign(raw({ v: 2, project: { name: 'a' }, files: {} })), 'the link\'s design is not a Silinx project');
  await rejects(decodeDesign(raw({ v: 1, project: [], files: {} })), 'the link\'s design is not a Silinx project');
  await rejects(decodeDesign(raw({ v: 1, project: { name: 'a' }, files: [] })), 'the link\'s design is not a Silinx project');
  await rejects(decodeDesign(raw({ v: 1, project: { name: 'a' }, files: { 'src/a.vhd': 3 } })), 'the link\'s design: src/a.vhd is not a text');
  const many = Object.fromEntries(Array.from({ length: LINK_LIMITS.maxFiles + 1 }, (_, i) => [`src/f${i}.vhd`, '']));
  await rejects(decodeDesign(raw({ v: 1, project: { name: 'a' }, files: many })), 'the link\'s design has more than 400 files');
});

test('decodeDesign: a decompression bomb stops at the limit, inflating no further (#2829)', async () => {
  const bomb = b64url(zlib.deflateRawSync(Buffer.alloc(32 << 20, 0x20), { level: 9 }));
  assert.ok(bomb.length < LINK_LIMITS.maxEncoded, `${bomb.length}`);
  await rejects(decodeDesign(bomb), 'the design in the link does not decode (output above the declared size)');
});

test('decodeDesign: names that are not a project\'s, paths that leave the project (#2829)', async () => {
  for (const name of ['', '<img src=x onerror=alert(1)>', '../x', 'a b', 'x'.repeat(65)]) {
    await rejects(decodeDesign(raw({ v: 1, project: { name }, files: {} })), `the link's design has no valid project name ('${name.slice(0, 64)}')`);
  }
  for (const p of ['../evil.vhd', 'src/../../evil', '/etc/passwd', 'C:/x.vhd', 'src\\..\\x', '.git/config', 'src/.silinx', 'silinx.json', 'SILINX.JSON', 'a//b', 'src/<script>\n.vhd']) {
    await rejects(decodeDesign(raw({ v: 1, project: { name: 'a' }, files: { [p]: '' } })), `the link's design has a file outside the project ('${p}')`);
    await rejects(decodeDesign(raw({ v: 1, project: { name: 'a' }, files: {}, bin: { [p]: '' } })), `the link's design has a file outside the project ('${p}')`);
  }
});

test('#3034 decodeDesign: every spelling of silinx.json a case-insensitive file system takes for it refused; src/silinx.json and an ordinary file kept', async () => {
  for (const p of ['\u017filinx.json', 'Silinx.Json', '\uff53ilinx.json', 'src/SILINX.JSON', 'src/\u017filinx.json']) {
    await rejects(decodeDesign(raw({ v: 1, project: { name: 'a' }, files: { [p]: '{"trusted":true}' } })), `the link's design has a file outside the project ('${p}')`);
    await rejects(decodeDesign(raw({ v: 1, project: { name: 'a' }, files: {}, bin: { [p]: '' } })), `the link's design has a file outside the project ('${p}')`);
  }
  const d = await decodeDesign(raw({ v: 1, project: { name: 'a' }, files: { 'src/silinx.json': '{}', 'src/a.vhd': 'entity a is end;\n' } }));
  assert.deepEqual(d.entries.map(e => e.path), ['silinx.json', 'src/silinx.json', 'src/a.vhd']);
  assert.deepEqual(d.warnings, []);
  // (a view's tab on one is dropped as well)
  assert.deepEqual(decodeUi(encodeUi({ open: ['file:\u017filinx.json', 'file:src/a.vhd'] })).view.open, ['file:src/a.vhd']);
});

test('decodeDesign: through the import gate (#2830): a file it refuses left out, said in the warnings', async () => {
  const d = await decodeDesign(raw({ v: 1, project: { name: 'a' }, files: { 'src/a.vhd': 'entity a is end;\n', 'src/page.vhd': '<script>alert(1)</script>', 'src/A.VHD': '' } }));
  assert.deepEqual(d.entries.map(e => e.path), ['silinx.json', 'src/a.vhd']);
  assert.deepEqual(d.warnings, ['src/page.vhd: not imported: a web page (HTML), not the file its name says', 'src/A.VHD: not imported: same name as \'src/a.vhd\' but for its case']);
  // (the gate's result, what an importer takes)
  assert.deepEqual(d.gated.files.map(f => f.path), ['silinx.json', 'src/a.vhd']);
});

test('decodeDesign: a drawing\'s HDL that cannot be made again is a warning, the drawing kept', async () => {
  const d = await decodeDesign(raw({ v: 1, project: { name: 'a' }, files: { 'src/x.fsm.json': '{broken' }, made: ['src/x.vhd'] }));
  assert.deepEqual(d.warnings, ['src/x.vhd: not made again from its drawing']);
  assert.deepEqual(d.entries.map(e => e.path), ['silinx.json', 'src/x.fsm.json']);
});

test('parseLink: the options of a link', () => {
  assert.equal(parseLink(''), null);
  assert.equal(parseLink('#'), null);
  assert.equal(parseLink('#token=abc'), null);
  assert.deepEqual(parseLink('#open=example:traffic&view=try'), { source: { kind: 'example', name: 'traffic' }, view: 'try', top: null, board: null });
  assert.deepEqual(parseLink('#design=AbC-_9&top=counter&view=emulate'), { source: { kind: 'design', design: 'AbC-_9' }, view: 'emulate', top: 'counter', board: null });
  assert.deepEqual(parseLink('open=https://example.org/c/lecture3.zip&board=basys2&view=simulate'), { source: { kind: 'zip', url: 'https://example.org/c/lecture3.zip' }, view: 'simulate', top: null, board: 'basys2' });
  assert.deepEqual(parseLink('#open=https%3A%2F%2Fraw.githubusercontent.com%2Fu%2Fr%2Fmain%2Fa%20b.zip'), { source: { kind: 'zip', url: 'https://raw.githubusercontent.com/u/r/main/a%20b.zip' }, view: null, top: null, board: null });
  // the token is not one of the link's options (api.js reads it), and no link sets it (#2829)
  assert.deepEqual(parseLink('#token=abc&open=example:gates'), { source: { kind: 'example', name: 'gates' }, view: null, top: null, board: null });
});

test('parseLink: a broken or hostile link is refused (#2829)', () => {
  throws(() => parseLink('#view=try'), 'the link names no design (design=, open= or gist=)');
  throws(() => parseLink('#design=&view=try'), 'the link\'s design= is empty');
  throws(() => parseLink('#design=a&open=example:gates'), 'the link has both design= and open=');
  throws(() => parseLink('#open=example:gates&open=example:pong'), 'the link has two open=');
  throws(() => parseLink('#open=example:../x'), 'the link names no example (\'../x\')');
  throws(() => parseLink('#open=%E0%A4%A'), 'the link\'s open is not well encoded');
  throws(() => parseLink('#open=not a url'), 'the link\'s open= is not an address (\'not a url\')');
  for (const u of ['javascript:alert(1)', 'data:application/zip;base64,AAAA', 'file:///etc/passwd', 'blob:https://x.org/1', 'http://example.org/a.zip', 'ftp://example.org/a.zip']) {
    throws(() => parseLink(`#open=${encodeURIComponent(u)}`), `the link's open= is not an https address ('${u}')`);
  }
  throws(() => parseLink('#open=https://u:p@example.org/a.zip'), 'the link\'s open= carries a user name or password');
  for (const [u, host] of [['https://localhost:3000/a.zip', 'localhost'], ['https://127.0.0.1/a.zip', '127.0.0.1'], ['https://2130706433/a.zip', '127.0.0.1'],
    ['https://0x7f.1/a.zip', '127.0.0.1'], ['https://10.0.0.5/a.zip', '10.0.0.5'], ['https://192.168.1.1/a.zip', '192.168.1.1'], ['https://172.20.0.1/a.zip', '172.20.0.1'],
    ['https://169.254.169.254/a.zip', '169.254.169.254'], ['https://[::1]/a.zip', '[::1]'], ['https://[fd00::1]/a.zip', '[fd00::1]'], ['https://mac-mini.local/a.zip', 'mac-mini.local'],
    ['https://router/a.zip', 'router'], ['https://100.101.102.103/a.zip', '100.101.102.103']]) {
    throws(() => parseLink(`#open=${u}`), `the link's open= is an address of this computer or of a local network ('${host}')`);
  }
  throws(() => parseLink('#open=example:gates&view=run'), 'the link\'s view \'run\' is not one of try, simulate, emulate');
  throws(() => parseLink('#open=example:gates&top=%3Cscript%3E'), 'the link\'s top \'<script>\' is not a module name');
  throws(() => parseLink('#open=example:gates&board=%22%3E%3Cimg%3E'), 'the link\'s board \'"><img>\' is not a board name');
  throws(() => parseLink(`#design=${'a'.repeat(LINK_LIMITS.maxEncoded + 1100)}`), 'the link is too long');
});

test('privateHost: the public names and addresses are not', () => {
  for (const h of ['example.org', 'raw.githubusercontent.com', '8.8.8.8', '172.32.0.1', '192.169.0.1', '[2606:4700::1111]', '2606:4700::1111',
    '[2002:808:808::1]', '[64:ff9a::1]', '[fbff::1]', '198.20.0.1', '192.0.3.1', '203.0.114.1']) assert.equal(privateHost(h), false, h);
});

test('privateHost: the IPv6 forms that carry an IPv4 address, the reserved IPv6 and IPv4 ranges, what is not an address (#2962)', () => {
  for (const h of [
    '[::]', '[::1]', '[0:0:0:0:0:0:0:1]', '[::7f00:1]', '[::127.0.0.1]', '[::a00:5]', '[::8.8.8.8]',   // ::/16: IPv4-compatible among them
    '[::ffff:7f00:1]', '[::ffff:127.0.0.1]', '[::ffff:0:a00:1]',                                        // mapped, translated
    '[64:ff9b::7f00:1]', '[64:ff9b::127.0.0.1]', '[64:ff9b::808:808]', '[64:ff9b:1::1]',                 // NAT64
    '[2002:7f00:1::1]', '[2002:c0a8:101::1]', '[2002:a00:1::]',                                         // 6to4 of a private IPv4 address
    '[fc00::1]', '[fd12:3456::1]', '[fe80::1]', '[fe80::1%25en0]', '[febf::1]', '[fec0::1]', '[ff02::1]', '[100::1]', '[2001:db8::1]',
    '[1::2::3]', '[gggg::1]', '[1:2:3]', '[::1.2.3.256]',                                              // not an address
    '198.18.0.1', '198.19.255.255', '192.0.0.8', '192.0.2.1', '198.51.100.7', '203.0.113.9',          // reserved IPv4
  ]) assert.equal(privateHost(h), true, h);
  // the link's own check, on the address as the browser reads it (new URL writes ::127.0.0.1 as ::7f00:1)
  for (const [u, host] of [['https://[::127.0.0.1]/a.zip', '[::7f00:1]'], ['https://[::7f00:1]/a.zip', '[::7f00:1]'], ['https://[64:ff9b::127.0.0.1]/a.zip', '[64:ff9b::7f00:1]'],
    ['https://[::ffff:10.0.0.1]/a.zip', '[::ffff:a00:1]'], ['https://[fe80::1]/a.zip', '[fe80::1]'], ['https://[0:0::0:1]/a.zip', '[::1]']]) {
    assert.throws(() => parseLink(`#open=${u}`), { message: `the link's open= is an address of this computer or of a local network ('${host}')` }, u);
  }
});

test('#3415 privateHost: every trailing dot taken off, an empty label, Teredo and a private network\'s names refused', () => {
  for (const h of ['localhost.', 'localhost..', 'localhost...', '192.168.1.1..', '10.0.0.1...', 'router..', 'a..example.org', '.example.org',
    '[2001:0:4136:e378:8000:63bf:3fff:fdd2]', '[2001::1]', '[2001:0:0:0:0:0:a00:1]',
    'foo.corp', 'kubernetes.default.svc', 'wiki.intranet', 'nas.private', 'host.localdomain', 'site.test', 'x.invalid', 'www.example']) assert.equal(privateHost(h), true, h);
  for (const h of ['example.org.', 'example.org..', '[2001:4860::8888]', '[2001:1::1]', 'corp.example.org', 'svc.github.io', 'test.org']) assert.equal(privateHost(h), false, h);
  for (const [u, host] of [['https://localhost../a.zip', 'localhost..'], ['https://192.168.1.1../a.zip', '192.168.1.1..'],
    ['https://[2001:0:4136:e378:8000:63bf:3fff:fdd2]/a.zip', '[2001:0:4136:e378:8000:63bf:3fff:fdd2]'], ['https://foo.corp/a.zip', 'foo.corp'],
    ['https://kubernetes.default.svc/a.zip', 'kubernetes.default.svc']]) {
    assert.throws(() => parseLink(`#open=${u}`), { message: `the link's open= is an address of this computer or of a local network ('${host}')` }, u);
  }
});

test('makeLink: the link of a design, an example, a zip; parseLink reads it back', async () => {
  const base = 'https://pmnmalo.github.io/Silinx/#token=x';
  assert.equal(makeLink(base, { example: 'traffic', view: 'try' }), 'https://pmnmalo.github.io/Silinx/#open=example:traffic&view=try');
  const { design } = await encodeDesign(exampleEntries('gates'));
  const l = makeLink('http://localhost:3000/', { design, top: 'gates', board: 'nexys2', view: 'emulate' });
  assert.deepEqual(parseLink(new URL(l).hash), { source: { kind: 'design', design }, view: 'emulate', top: 'gates', board: 'nexys2' });
  const z = makeLink(base, { zip: 'https://example.org/a b.zip?x=1&y=2#z' });
  assert.equal(z, 'https://pmnmalo.github.io/Silinx/#open=https://example.org/a%20b.zip?x=1%26y=2%23z');
  assert.equal(parseLink(new URL(z).hash).source.url, 'https://example.org/a%20b.zip?x=1&y=2#z');
  throws(() => makeLink(base, {}), 'a link has one design: design, example, zip or gist');
  throws(() => makeLink(base, { example: 'a', design: 'b' }), 'a link has one design: design, example, zip or gist');
  throws(() => makeLink(base, { example: 'a', view: 'x' }), 'view: one of try, simulate, emulate');
  throws(() => makeLink(base, { example: 'a', top: '1x' }), 'top: \'1x\' is not a module name');
  throws(() => makeLink(base, { example: 'a', board: 'a b' }), 'board: \'a b\' is not a board name');
  throws(() => makeLink(base, { example: 'a/b' }), 'example: \'a/b\' is not an example\'s name');
});

test('#3179 a link that opens a guided lab: lab=<its id>, made and read back; one that is not a lab\'s id refused', () => {
  const l = makeLink('https://pmnmalo.github.io/Silinx/', { example: 'stopwatch', view: 'emulate', lab: 'stopwatch-emulator' });
  assert.equal(l, 'https://pmnmalo.github.io/Silinx/#open=example:stopwatch&view=emulate&lab=stopwatch-emulator');
  assert.deepEqual(parseLink(new URL(l).hash), { source: { kind: 'example', name: 'stopwatch' }, view: 'emulate', top: null, board: null, lab: 'stopwatch-emulator' });
  assert.equal(parseLink('#open=example:gates&lab=').lab, undefined, 'an empty lab= is none');
  throws(() => parseLink('#open=example:gates&lab=%3Cscript%3E'), 'the link\'s lab \'<script>\' is not a lab\'s id');
  throws(() => parseLink('#open=example:gates&lab=a&lab=b'), 'the link has two lab=');
  throws(() => makeLink('https://x/', { example: 'gates', lab: '../x' }), 'lab: \'../x\' is not a lab\'s id');
});

test('sameFiles: silinx.json left out, any other difference counts', () => {
  assert.ok(sameFiles({ 'silinx.json': '1', a: 'x' }, { 'silinx.json': '2', a: 'x' }));
  assert.ok(!sameFiles({ a: 'x' }, { a: 'y' }));
  assert.ok(!sameFiles({ a: 'x' }, { a: 'x', b: '' }));
  assert.equal(textOf({ data: new TextEncoder().encode('ok') }), 'ok');
});

test('viewProblem / tryDrawing: Try it is a schematic\'s, a state diagram\'s or a Petri net\'s Simulate (#2869); the other views', () => {
  const files = {
    'src/g.sch.json': JSON.stringify({ name: 'g' }), 'src/m.fsm.json': JSON.stringify({ name: 'm' }), 'src/n.pn.json': JSON.stringify({ name: 'n' }),
    'src/a.asm.json': JSON.stringify({ name: 'a' }), 'src/t.bool.json': JSON.stringify({ name: 't' }), 'src/h.vhd': 'entity h is end;\n', 'src/bad.fsm.json': '{',
  };
  const pj = { top: 'g', simTop: 'tb', board: 'basys2' };
  assert.equal(tryDrawing(files, 'g'), 'src/g.sch.json');
  assert.equal(tryDrawing(files, 'm'), 'src/m.fsm.json');
  assert.equal(tryDrawing(files, 'n'), 'src/n.pn.json');
  assert.equal(tryDrawing(files, 'a'), 'src/a.asm.json');   // (an ASM chart's simulation, #2881)
  for (const m of ['t', 'h', 'bad', 'nothere']) assert.equal(tryDrawing(files, m), null, m);
  assert.ok(TRY_DRAWING.test('x.PN.JSON') && TRY_DRAWING.test('x.asm.json') && !TRY_DRAWING.test('x.bool.json'));
  for (const top of [undefined, 'm', 'n', 'a']) assert.equal(viewProblem(pj, files, { view: 'try', top }), null, top);
  for (const top of ['t', 'h']) assert.equal(viewProblem(pj, files, { view: 'try', top }), `Try it: '${top}' is not a schematic, a state diagram, a Petri net or an ASM chart`);
  assert.equal(viewProblem({ ...pj, top: '' }, files, { view: 'try' }), 'Try it: the design has no top module (give top)');
  assert.equal(viewProblem(pj, files, { view: 'try', top: 'zz' }), 'the design has no module \'zz\'');
  assert.equal(viewProblem(pj, files, { view: 'simulate' }), null);
  assert.equal(viewProblem({ top: 'g' }, files, { view: 'simulate' }), 'the design has no test bench to simulate');
  assert.equal(viewProblem(pj, files, { view: 'emulate', top: 'n' }), 'the board emulator emulates the top module, \'g\', not \'n\'');
  assert.equal(viewProblem(pj, files, { view: 'emulate', top: 'G' }), null);
  assert.equal(viewProblem({ top: 'g' }, files, { view: 'emulate' }), 'the design has no board to emulate it on');
  assert.equal(viewProblem({ board: 'basys2' }, files, { view: 'emulate' }), 'the design has no top module to emulate');
});

test('freeName: the first free <name>_N (#2875), the case ignored, within 64 characters', () => {
  assert.equal(freeName('ALU', ['ALU']), 'ALU_2');
  assert.equal(freeName('ALU', ['ALU', 'ALU_2', 'alu_3']), 'ALU_4');
  assert.equal(freeName('ALU', ['ALU', 'ALU_3']), 'ALU_2');
  const long = 'a'.repeat(64);
  assert.equal(freeName(long, [long]), `${'a'.repeat(62)}_2`);
  assert.equal(freeName(long, [long, `${'a'.repeat(62)}_2`]).length, 64);
});

test('#2876 regression: Try it finds a drawing whose name differs in case from its module\'s (VHDL\'s lower case), or by its generated HDL\'s module', () => {
  const files = {
    'src/ALU_4bit.sch.json': JSON.stringify({ name: 'ALU_4bit', generatedFile: 'src/ALU_4bit.vhd' }), 'src/ALU_4bit.vhd': 'entity ALU_4bit is end;\n',
    'src/Ctl.fsm.json': JSON.stringify({ name: 'Ctl' }), 'src/Net.pn.json': JSON.stringify({ name: 'Net' }),
    // a drawing named otherwise than its HDL's module: found by its generated file
    'src/old.sch.json': JSON.stringify({ name: 'old_name', generatedFile: 'src/mux4.vhd' }), 'src/mux4.vhd': 'entity Mux4 is end;\n',
  };
  assert.equal(tryDrawing(files, 'alu_4bit'), 'src/ALU_4bit.sch.json');
  assert.equal(tryDrawing(files, 'ctl'), 'src/Ctl.fsm.json');
  assert.equal(tryDrawing(files, 'NET'), 'src/Net.pn.json');
  assert.equal(tryDrawing(files, 'mux4'), 'src/old.sch.json');
  assert.equal(tryDrawing(files, 'nothere'), null);
  assert.equal(viewProblem({ top: 'alu_4bit' }, files, { view: 'try' }), null);
  assert.equal(viewProblem({}, files, { view: 'try', top: 'alu_4bit' }), null);
  assert.equal(viewProblem({}, files, { view: 'try', top: 'MUX4' }), null);
  assert.equal(viewProblem({}, files, { top: 'Alu_4Bit' }), null);
  assert.equal(viewProblem({}, files, { top: 'nothere' }), 'the design has no module \'nothere\'');
});

test('#2878 viewProblem: the simulation\'s top= a test bench, the other views\' a design module; benchNames', () => {
  const project = { top: 'top', simTop: 'tb_top', board: 'basys2', files: [
    { path: 'src/top.vhd', role: 'design' }, { path: 'src/G.sch.json', role: 'design' }, { path: 'sim/tb_top.vhd', role: 'sim' }, { path: 'sim/tb_other.v', role: 'sim' }] };
  const files = {
    'src/top.vhd': 'entity top is end;\n', 'src/G.sch.json': JSON.stringify({ name: 'G' }),
    'sim/tb_top.vhd': 'entity TB_top is end;\n', 'sim/tb_other.v': 'module tb_other; endmodule\n',
  };
  assert.deepEqual([...benchNames(project, files)].sort(), ['tb_other', 'tb_top']);
  assert.deepEqual([...benchNames({}, files)], []);
  assert.equal(viewProblem(project, files, { view: 'simulate' }), null);
  assert.equal(viewProblem(project, files, { view: 'simulate', top: 'tb_other' }), null);
  assert.equal(viewProblem(project, files, { view: 'simulate', top: 'TB_TOP' }), null);
  assert.equal(viewProblem(project, files, { view: 'simulate', top: 'top' }), '\'top\' is not a test bench of the design');
  assert.equal(viewProblem({ ...project, simTop: '' }, files, { view: 'simulate', top: 'tb_other' }), null);
  assert.equal(viewProblem({ ...project, simTop: '' }, files, { view: 'simulate' }), 'the design has no test bench to simulate');
  for (const view of [null, 'try', 'emulate']) assert.equal(viewProblem(project, files, { view, top: 'tb_other' }), '\'tb_other\' is a test bench: a link opens it in the simulation', view);
  assert.equal(viewProblem(project, files, { view: 'try', top: 'g' }), null);
  assert.equal(viewProblem(project, files, { top: 'top' }), null);
});

test('#2882 regression: a C source\'s module (its top function\'s) is one of the design\'s, for top= and every view but Try it', async () => {
  const fs = await import('node:fs');
  const c = fs.readFileSync(new URL('../test-designs/fir/src/fir.c', import.meta.url), 'utf8');
  const project = { top: 'fir', board: 'basys2', files: [{ path: 'src/fir.c', role: 'design' }] };
  const files = { 'src/fir.c': c, 'src/broken.c': 'int x( {' };
  assert.equal(viewProblem(project, files, { top: 'fir' }), null);
  assert.equal(viewProblem(project, files, { top: 'FIR' }), null);
  assert.equal(viewProblem(project, files, { view: 'emulate', top: 'fir' }), null);
  assert.equal(viewProblem(project, files, { view: 'try', top: 'fir' }), 'Try it: \'fir\' is not a schematic, a state diagram, a Petri net or an ASM chart');
  assert.equal(viewProblem(project, files, { top: 'broken' }), 'the design has no module \'broken\'');
});

test('#2884 regression: the board emulator emulates the top module, a link\'s other top= refused', () => {
  const project = { top: 'top', board: 'basys2', files: [] };
  const files = { 'src/top.vhd': 'entity top is end;\n', 'src/timer.vhd': 'entity timer is end;\n' };
  assert.equal(viewProblem(project, files, { view: 'emulate' }), null);
  assert.equal(viewProblem(project, files, { view: 'emulate', top: 'top' }), null);
  assert.equal(viewProblem(project, files, { view: 'emulate', top: 'timer' }), 'the board emulator emulates the top module, \'top\', not \'timer\'');
  assert.equal(viewProblem({ board: 'basys2' }, files, { view: 'emulate', top: 'timer' }), 'the design has no top module to emulate');
  // (the project only and the simulation are not the emulator's)
  assert.equal(viewProblem(project, files, { top: 'timer' }), null);
});

test('#2886 encodeUi / decodeUi: the view in a link (tabs, the one in front, the split, page, view, layout), back as it was', () => {
  const view = { open: ['file:src/a.vhd', 'sch:src/g.sch.json', 'isim:tb_a', 'emulator:top@synth', 'rtl:top', 'summary', 'pins'], active: 'sch:src/g.sch.json',
    split: { b: ['isim:tb_a'] }, page: 'files', view: 'sim' };
  const layout = { task: 'sim', side: false, console: true, max: true };
  const u = encodeUi(view, layout);
  assert.match(u, /^[A-Za-z0-9_-]+$/);
  assert.deepEqual(decodeUi(u), { view, layout, dropped: [] });
  // the ISE style interface: no layout
  assert.deepEqual(decodeUi(encodeUi(view, null)).layout, null);
  // nothing open
  assert.deepEqual(decodeUi(encodeUi({ open: [] })), { view: { open: [], active: null, split: null, page: null, view: null }, layout: null, dropped: [] });
  // through a link
  const link = makeLink('http://localhost:3000/', { example: 'gates', view: 'try', ui: u });
  assert.equal(parseLink(new URL(link).hash).ui, u);
});

test('#2886 decodeUi: a hostile view is left out, said; a broken one refused (#2829)', () => {
  const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
  const r = decodeUi(b64({ o: ['file:../../etc/passwd', 'file:/abs.vhd', 'sch:.git/config', 'javascript:alert(1)', 'rtl:<img>', 'isim:tb_a@x y', 'rtl:top@synth', 42, 'file:src/ok.vhd'],
    a: 'file:../../etc/passwd', b: ['file:../../etc/passwd', 'file:src/ok.vhd'], p: '<script>', v: 'other', t: 'evil', s: 'yes', z: 1 }));
  assert.deepEqual(r.view, { open: ['file:src/ok.vhd'], active: null, split: { b: ['file:src/ok.vhd'] }, page: null, view: null });
  assert.equal(r.layout, null);
  assert.deepEqual(r.dropped, ["a document 'file:../../etc/passwd'", "a document 'file:/abs.vhd'", "a document 'sch:.git/config'", "a document 'javascript:alert(1)'",
    "a document 'rtl:<img>'", "a document 'isim:tb_a@x y'", "a document 'rtl:top@synth'", "a document '42'", "'z'"]);
  // a layout's fields: booleans only (else false)
  assert.deepEqual(decodeUi(b64({ o: [], t: 'emu', s: 1, c: 'true', m: true })).layout, { task: 'emu', side: false, console: false, max: true });
  // capped
  const many = Array.from({ length: UI_LIMITS.maxOpen + 5 }, (_, i) => `file:src/f${i}.vhd`);
  const capped = decodeUi(b64({ o: many }));
  assert.equal(capped.view.open.length, UI_LIMITS.maxOpen);
  assert.deepEqual(capped.dropped, ['5 document(s) over 40']);
  for (const [t, m] of [['', 'the link\'s view (ui=) is not one'], ['x'.repeat(UI_LIMITS.maxEncoded + 1), 'the link\'s view (ui=) is not one'],
    ['abc$', 'the link\'s view (ui=) does not decode'], [b64([1, 2]), 'the link\'s view (ui=) is not one'], [Buffer.from('{oops').toString('base64url'), 'the link\'s view (ui=) does not decode']]) {
    assert.throws(() => decodeUi(t), e => { assert.equal(e.linkError, true); assert.equal(e.message, m); return true; });
  }
  assert.throws(() => parseLink(`#open=example:gates&ui=${'a'.repeat(UI_LIMITS.maxEncoded + 1)}`), e => e.message === 'the link\'s view (ui=) is not one');
  assert.throws(() => parseLink('#open=example:gates&ui=a%24b'), e => e.message === 'the link\'s view (ui=) is not one');
});

// #3362: the import gate comes before any parser or compiler: a link's HDL that the gate refuses is never compiled (the
// drawings' HDL made again from the files it passed only), and the HDL made again is gated too
test('#3362 decodeDesign: the gate first, then the compiler: a file it refuses is never compiled', async () => {
  const compiled = [];
  LINK_TESTING.compiled = paths => compiled.push(...paths);
  try {
    const d = await decodeDesign(raw({ v: 1, project: { name: 'a' }, made: ['src/x.vhd'], files: {
      'src/a.vhd': 'entity a is end;\n', 'src/page.vhd': '<script>alert(1)</script>', 'src/deep.v': `module deep; ${'('.repeat(300)}${')'.repeat(300)} endmodule\n`,
      'src/x.fsm.json': '{broken' } }));
    assert.deepEqual(compiled, ['src/a.vhd']);
    assert.deepEqual(d.warnings, ['src/page.vhd: not imported: a web page (HTML), not the file its name says',
      'src/deep.v: not imported: nesting deeper than 256 brackets', 'src/x.vhd: not made again from its drawing']);
    assert.deepEqual(d.entries.map(e => e.path), ['silinx.json', 'src/a.vhd', 'src/x.fsm.json']);
    assert.deepEqual([d.gated.gated, d.gated.files.map(f => f.path), d.gated.refusals.map(r => r.path)], [true, ['silinx.json', 'src/a.vhd', 'src/x.fsm.json'], ['src/page.vhd', 'src/deep.v']]);
    // a design whose silinx.json the gate refuses compiles nothing
    compiled.length = 0;
    const deep = JSON.parse(`${'['.repeat(300)}${']'.repeat(300)}`);
    await rejects(decodeDesign(raw({ v: 1, project: { name: 'a', deep }, made: ['src/x.vhd'], files: { 'src/a.vhd': 'entity a is end;\n' } })), 'the link\'s design is not a Silinx project');
    assert.deepEqual(compiled, []);
  } finally { LINK_TESTING.compiled = null; }
});

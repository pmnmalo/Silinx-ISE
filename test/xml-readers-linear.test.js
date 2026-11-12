// The .sch / .sym, .wcfg and PNML readers in linear time (#3557): regular expressions that went back over the text
// (core/isesch.js: a start tag's attributes on a long name with no '=', a VERSION 5 symbol's SYMPIN lines on blank
// lines; core/wcfg.js: the comments, instructions and CDATA taken out, each unclosed one to the end of the text;
// core/petri.js fromPnml: <net>, <place>, <transition> and <arc> with no end) are one pass each (core/xml-attrs.js,
// core/pnml-scan.js, wcfg's scanner), with the same results; a character reference past Unicode (&#x110000;) threw
// RangeError: U+FFFD in a schematic or symbol (its reader takes any text), the file's error in a wave configuration.
// Each case at n and 2n in a child process with a time limit (a slow one cannot be stopped in this one): about twice
// the time, the result exact.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { parseXml, parseIseSch, parseIseSym } from '../core/isesch.js';
import { readWcfg } from '../core/wcfg.js';
import { fromPnml } from '../core/petri.js';
import { attrPairs } from '../core/xml-attrs.js';
import { pnmlTag, pnmlStartTag, pnmlAttr, pnmlElements, pnmlPosition } from '../core/pnml-scan.js';

const LIMIT = 30000;   // (ms: the child's time; each case takes a few ms)
const core = f => JSON.stringify(new URL(`../core/${f}`, import.meta.url).href);
// the cases: the reader's call on a text made of n; the child gives each one's time and result (or its error)
const CHILD = `import { parseIseSch, parseIseSym } from ${core('isesch.js')};
import { readWcfg } from ${core('wcfg.js')};
import { fromPnml } from ${core('petri.js')};
const CASES = {
  schAttr: n => parseIseSch('<drawing version="7"><netlist><signal ' + 'x'.repeat(n) + ' name="s"/></netlist></drawing>').signals,
  symAttr: n => parseIseSym('<symbol name="s" ' + 'y'.repeat(n) + '><pin name="a" polarity="Output" x="64" y="-32"/></symbol>'),
  symBlank: n => parseIseSym('VERSION 5\\nBEGIN SYMBOL s\\n' + ' \\n'.repeat(n) + 'SYMPIN 64 -32 OUTPUT O\\nEND SYMBOL\\n'),
  wcfgComment: n => readWcfg('<wave_config>' + '<!--'.repeat(n)),
  wcfgPi: n => readWcfg('<wave_config>' + '<?'.repeat(n)),
  wcfgCdata: n => readWcfg('<wave_config>' + '<![CDATA['.repeat(n)),
  pnmlArc: n => fromPnml('<pnml><net id="n"><place id="p"/>' + '<arc '.repeat(n) + '</net></pnml>'),
  pnmlPlace: n => fromPnml('<pnml><net id="n">' + '<place id="p">'.repeat(n) + '</net></pnml>'),
  pnmlTransition: n => fromPnml('<pnml><net id="n">' + '<transition '.repeat(n) + '</net></pnml>'),
  pnmlNet: n => fromPnml('<net '.repeat(n)),
};
let s = ''; for await (const c of process.stdin) s += c;
const out = [];
for (const [name, n] of JSON.parse(s)) {
  const t = performance.now();
  let r;
  try { r = { value: CASES[name](n) }; } catch (e) { r = { error: e.message }; }
  out.push({ ms: performance.now() - t, ...r });
}
console.log(JSON.stringify(out));`;

function inChild(cases) {
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', CHILD], { input: JSON.stringify(cases), encoding: 'utf8', timeout: LIMIT, maxBuffer: 1 << 24 });
  assert.equal(r.error?.code, undefined, `not done in ${LIMIT} ms`);
  assert.equal(r.status, 0, r.stderr);
  return JSON.parse(r.stdout);
}
// a case at n and 2n: the same result (`same` maps it to what does not grow with n), about twice the time
function linear(name, n, same = ({ ms, ...r }) => r) {
  const [a, b] = inChild([[name, n], [name, 2 * n]]);
  assert.ok(b.ms < 3.5 * a.ms + 300, `${name}: ${n} ${Math.round(a.ms)} ms, ${2 * n} ${Math.round(b.ms)} ms`);
  assert.deepEqual(same(b), same(a));
  return a;
}

test('#3557 a schematic\'s and a symbol\'s start tag with a long name and no \'=\', a VERSION 5 symbol of many blank lines', () => {
  assert.deepEqual(linear('schAttr', 200000).value, [{ name: 's', attrs: {} }]);
  assert.deepEqual(linear('symAttr', 200000).value, { name: 's', pins: [{ name: 'a', dir: 'out', x: 64, y: -32 }] });
  assert.deepEqual(linear('symBlank', 200000).value, { name: 's', pins: [{ name: 'O', dir: 'out', x: 64, y: -32 }] });
});


test('#3557 a wave configuration\'s unclosed comments, instructions and CDATA: the file\'s error, at once', () => {
  assert.equal(linear('wcfgComment', 400000).error, "malformed XML near '<!--<!--<!--<!--<!--'");
  assert.equal(linear('wcfgPi', 400000).error, "malformed XML near '<?<?<?<?<?<?<?<?<?<?'");
  assert.equal(linear('wcfgCdata', 200000).error, "malformed XML near '<![CDATA[<![CDATA[<!'");
});

test('#3557 PNML: <arc, <place, <transition and <net with no end', () => {
  const net = r => ({ places: r.value.places.length, transitions: r.value.transitions.length, arcs: r.value.arcs.length });
  assert.deepEqual(net(linear('pnmlArc', 100000, net)), { places: 1, transitions: 0, arcs: 0 });
  assert.deepEqual(net(linear('pnmlPlace', 100000, net)), { places: 0, transitions: 0, arcs: 0 });
  assert.deepEqual(net(linear('pnmlTransition', 100000, net)), { places: 0, transitions: 0, arcs: 0 });
  assert.deepEqual(net(linear('pnmlNet', 100000, net)), { places: 0, transitions: 0, arcs: 0 });
});

test('#3557 a character reference past Unicode: U+FFFD in a schematic or symbol, the error of a wave configuration', () => {
  for (const ref of ['&#x110000;', '&#1114112;', '&#x' + 'f'.repeat(40) + ';', '&#' + '9'.repeat(400) + ';'])
    assert.equal(parseXml(`<a b="x${ref}y"/>`).children[0].attrs.b, 'x�y');
  assert.equal(parseXml('<a b="&#x10FFFF;&#65;&#x42;&amp;"/>').children[0].attrs.b, '\u{10FFFF}AB&');
  assert.equal(parseIseSym('<symbol name="&#x110000;"></symbol>').name, '�');
  assert.throws(() => readWcfg('<wave_config><top_module name="&#x110000;"/></wave_config>'), { message: "malformed XML: invalid character reference '&#x110000;'" });
  assert.throws(() => readWcfg('<wave_config>&#99999999999999999999999;</wave_config>'), { message: "malformed XML: invalid character reference '&#999999999999999...'" });
  assert.deepEqual(readWcfg('<wave_config><top_module name="t&#x10FFFF;&#65;"/></wave_config>').tops, ['t\u{10FFFF}A']);
});

test('#3557 the attributes as the expression found them (the expression the reference)', () => {
  const re = s => [...s.matchAll(/([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g)].map(a => [a[1], a[2] ?? a[3] ?? a[4] ?? '']);
  for (const s of [' a="1" b=\'2\' c=3 d e = "4"', ' f="5 g=6 h= >i=j=k "x="y" =z', ' w="unclosed v=7', " u='x v=\"1\" ==w", ' a==b c= d', ' a=">" b="'])
    assert.deepEqual(attrPairs(s), re(s), s);
  assert.deepEqual(attrPairs(' a="1" b=\'2\' c=3 d e = "4"'), [['a', '1'], ['b', '2'], ['c', '3'], ['e', '4']]);
});

test('#3557 the PNML searches as the expressions found them', () => {
  const s = '<places x/><place/><place id="a">A</place><place id="b"/></place><arcs/><arc id="c"/><arc id="d">D</arc><arc>';
  // (<place/> before an end tag: its head '/', the text up to the end tag its body, as the expression read it)
  assert.deepEqual(pnmlElements(s, 'place'), [['/', '<place id="a">A'], [' id="b"/', '']]);
  assert.deepEqual(pnmlElements('<place id="a"/><place>', 'place'), [[' id="a"', undefined]]);
  assert.deepEqual(pnmlElements(s, 'arc', true), [[' id="c"', undefined], [' id="d"', 'D']]);
  assert.equal(pnmlTag('<netx>a</netx><net id="n">b</net>', 'net'), 'b');
  assert.equal(pnmlTag('<net>a', 'net'), null);
  assert.equal(pnmlStartTag('<network><net id="n" >', 'net'), '<net id="n" >');
  assert.equal(pnmlAttr('xid="a" id="b"', 'id'), 'b');
  assert.equal(pnmlAttr('id="unclosed', 'id'), null);
  assert.deepEqual(pnmlPosition('<positions x="1" y="2"/><position x="3" y="4" x="5" y="6" x="7"/>'), ['5', '6']);
  assert.deepEqual(pnmlPosition('<position x="1"/><position y="2" x="3" y="-4.5">'), ['3', '-4.5']);
  assert.equal(pnmlPosition('<position x="a" y="2"/>'), null);
});

test('#3557 a PNML net, read as before', () => {
  const n = fromPnml('<pnml><net id="n1"><name><text>my net</text></name><page id="pg"><place id="p1"><name><text>idle</text></name>'
    + '<initialMarking><text>2</text></initialMarking><graphics><position x="10.4" y="20.6"/></graphics></place><place id="p2"/>'
    + '<transition id="t1"><graphics><position x="30" y="40"/></graphics></transition>'
    + '<arc id="a1" source="p1" target="t1"><inscription><text>2</text></inscription></arc><arc source="t1" target="p2"/></page></net></pnml>');
  assert.deepEqual([n.name, n.places.map(p => [p.id, p.name, p.x, p.y, p.tokens]), n.transitions.map(t => [t.id, t.x, t.y]), n.arcs.map(a => [a.id, a.from, a.to, a.weight])],
    ['my_net', [['p1', 'idle', 10, 21, 2], ['p2', 'p2', 220, 100, 0]], [['t1', 30, 40]], [['a1', 'p1', 't1', 2], ['a2', 't1', 'p2', 1]]]);
});

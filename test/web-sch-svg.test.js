// The schematic's drawing in SVG (web/js/sch-svg.js, #405: out of sch-editor.js): a symbol placed and turned where
// the document's geometry (core/schdoc.js: symbolPins, symbolBox) has its pins and box, a pin's lead ending at the
// pin, an I/O marker on each side, the hops of a wire over its crossings, the runs of wires in line, the datasheet
// drawing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import './ui/core-hooks.js';
import { SYMBOLS, defaultParams, symbolDef, symbolPins, symbolBox, portBox, xform } from '../core/schdoc.js';

const { symbolSvg, symbolDrawingSvg, portSvg, bodySvg, hopPath, inLineRuns, wireRun, r1 } = await import('../web/js/sch-svg.js');

const MODULES = { sub: { name: 'sub', lang: 'vhdl', ports: [{ name: 'a', dir: 'in', width: 1 }, { name: 'd', dir: 'in', width: 8 }, { name: 'q', dir: 'out', width: 8 }] } };
const TYPES = [['and2'], ['nor4'], ['and3b2'], ['inv'], ['fdce'], ['mux4'], ['module', { module: 'sub' }]];
const attrs = (tag) => Object.fromEntries([...tag.matchAll(/([\w-]+)="([^"]*)"/g)].map((m) => [m[1], m[2]]));

test('#405 schematic drawing: a symbol, turned and mirrored, drawn where the document has its pins and box', () => {
  for (const [type, params] of TYPES) {
    for (const rot of [0, 90, 180, 270]) {
      for (const mirror of [false, true]) {
        const sym = { id: 'S1', type, x: 200, y: 100, rot, mirror, name: 'U1', params: params || {} };
        const def = symbolDef(sym, MODULES), what = `${type} rot ${rot}${mirror ? ' mirrored' : ''}`;
        const svg = symbolSvg(sym, def, ' sel');
        assert.match(svg, /^<g class="sym sel" data-kind="sym" data-id="S1">/, what);
        // the hitbox: the symbol's box
        const box = symbolBox(sym, MODULES, def), hit = attrs(svg.match(/<rect class="hitbox"[^>]*>/)[0]);
        assert.deepEqual([+hit.x, +hit.y, +hit.width, +hit.height], [box.x, box.y, box.w, box.h], what);
        // the body's transform takes each pin, in local coordinates, where the document has it
        const [a, b, c, d, e, f] = svg.match(/transform="matrix\(([^)]*)\)"/)[1].split(',').map(Number);
        for (const p of symbolPins(sym, MODULES, def)) {
          assert.deepEqual([a * p.lx + c * p.ly + e, b * p.lx + d * p.ly + f], [p.x, p.y], `${what}: pin ${p.name}`);
        }
      }
    }
    // in the body, a lead ends at each pin, a bus's drawn as a bus
    const sym = { id: 'S1', type, x: 0, y: 0, rot: 0, mirror: false, name: 'U1', params: params || {} };
    const def = symbolDef(sym, MODULES);
    const leads = [...bodySvg(sym, def).matchAll(/<line class="pin( bus)?"[^>]*>/g)].map((m) => ({ bus: !!m[1], ...attrs(m[0]) }));
    for (const p of def.pins) {
      const l = leads.find((x) => (+x.x1 === r1(p.x) && +x.y1 === r1(p.y)) || (+x.x2 === r1(p.x) && +x.y2 === r1(p.y)));
      assert.ok(l, `${type}: a lead to ${p.name}`);
      assert.equal(l.bus, (p.width || 1) > 1, `${type}: ${p.name}'s lead`);
    }
  }
});

test('#405 schematic drawing: the datasheet drawing (the pin names of a gate), an I/O marker on each side', () => {
  const sym = { id: 'S1', type: 'and2', x: 300, y: 300, rot: 90, mirror: true, name: 'U7', params: {} };
  const def = symbolDef(sym);
  const svg = symbolDrawingSvg(sym, def);
  // (placed at the origin, not turned: its size and the names of its pins)
  const vb = attrs(svg.match(/<svg [^>]*>/)[0]);
  assert.equal(vb.viewBox, `-34 -22 ${def.w + 68} ${def.h + 44}`);
  assert.equal(+vb.width, Math.round((def.w + 68) * 1.6));
  assert.deepEqual([...svg.matchAll(/<text class="pname"[^>]*>([^<]*)</g)].map((m) => m[1]), def.pins.map((p) => p.name));
  assert.doesNotMatch(svg, /U7/);
  // I/O markers: the pin from the connection point, the name with its bus range, the box of the document
  for (const [dir, side] of [['in', undefined], ['out', undefined], ['inout', undefined], ['in', 'N'], ['out', 'S']]) {
    const p = { id: 'P1', name: 'd', dir, width: 8, x: 100, y: 200, ...(side ? { side } : {}) };
    const svg2 = portSvg(p, ' sel');
    assert.match(svg2, /^<g class="port sel" data-kind="port" data-id="P1">/);
    const pin = attrs(svg2.match(/<line class="pin bus"[^>]*>/)[0]);
    assert.deepEqual([+pin.x1, +pin.y1], [100, 200], `${dir} ${side}`);
    assert.equal(Math.abs(+pin.x2 - 100) + Math.abs(+pin.y2 - 200), 3, `${dir} ${side}: 3 along its side`);
    assert.match(svg2, />d\(7:0\)<\/text>/);
    const b = portBox(p), hit = attrs(svg2.match(/<rect class="hitbox"[^>]*>/)[0]);
    assert.deepEqual([+hit.x, +hit.y, +hit.width, +hit.height], [b.x, b.y, b.w, b.h]);
    assert.equal(/rotate\(-90/.test(svg2), side === 'N' || side === 'S', `${dir} ${side}: the name turned on a vertical marker`);
  }
  const one = portSvg({ id: 'P2', name: 'clk', dir: 'in', width: 1, x: 0, y: 0 });
  assert.match(one, /<line class="pin" /);
  assert.match(one, />clk<\/text>/);
});

test('#405 schematic drawing: the hops of a wire over its crossings, the runs of wires in line, a wire\'s longest run', () => {
  // a horizontal segment from 0 to 200 crossed at 50 and 150, one at 197 too close to its end; then a vertical one
  const w = { points: [{ x: 0, y: 10 }, { x: 200, y: 10 }, { x: 200, y: 100 }] };
  assert.equal(hopPath(w, new Map([[0, [150, 50, 197]]])), 'M0,10 L45,10 A5,5 0 0 1 55,10 L145,10 A5,5 0 0 1 155,10 L200,10 L200,100');
  // right to left: the arcs the other way, in order
  const back = { points: [{ x: 200, y: 10 }, { x: 0, y: 10 }] };
  assert.equal(hopPath(back, new Map([[0, [50, 150]]])), 'M200,10 L155,10 A5,5 0 0 0 145,10 L55,10 A5,5 0 0 0 45,10 L0,10');
  assert.equal(hopPath(back, new Map()), 'M200,10 L0,10');
  // runs: W1 and W2 meet end to end in line on net n; W3 meets W2's end at a corner; W4 in line but of another net
  const wires = [
    { id: 'W1', points: [{ x: 0, y: 0 }, { x: 100, y: 0 }] },
    { id: 'W2', points: [{ x: 100, y: 0 }, { x: 200, y: 0 }] },
    { id: 'W3', points: [{ x: 200, y: 0 }, { x: 200, y: 50 }] },
    { id: 'W4', points: [{ x: 200, y: 0 }, { x: 300, y: 0 }] },
  ];
  const net = { W1: 'n', W2: 'n', W3: 'n', W4: 'm' };
  const runs = inLineRuns(wires, (x) => net[x.id]);
  assert.equal(runs.get('W1'), runs.get('W2'));
  assert.notEqual(runs.get('W3'), runs.get('W1'));
  assert.notEqual(runs.get('W4'), runs.get('W2'));
  assert.equal(new Set(runs.values()).size, 3);
  // the longest run, a vertical one counted half
  assert.equal(wireRun(w), 200);
  assert.equal(wireRun({ points: [{ x: 0, y: 0 }, { x: 0, y: 300 }, { x: 120, y: 300 }] }), 150);
});

test('#953 schematic drawing: a VCC / GND wider than a bit, its width by its output (none for one bit or one saved without)', () => {
  for (const type of ['vcc', 'gnd']) {
    const draw = (params) => { const sym = { id: 'S1', type, x: 200, y: 100, rot: 0, mirror: false, name: 'U1', params }; return symbolSvg(sym, symbolDef(sym)); };
    const w8 = [...draw({ width: 8 }).matchAll(/<text class="pwidth[^"]*"[^>]*>([^<]*)</g)];
    assert.deepEqual(w8.map((m) => m[1]), ['8'], type);
    const pin = symbolPins({ id: 'S1', type, x: 200, y: 100, rot: 0, mirror: false, params: { width: 8 } })[0];
    const at = attrs(w8[0][0]);
    // (on its stem, 10 px in from the pin's end, upright: inside its box, #1139)
    assert.deepEqual([+at.x, +at.y, at.class], [pin.x, pin.y + (type === 'vcc' ? -7 : 13), 'pwidth on'], type);
    assert.doesNotMatch(draw({ width: 1 }), /class="pwidth[ "]/);
    assert.doesNotMatch(draw({}), /class="pwidth[ "]/);
    assert.match(draw({ width: 8 }), new RegExp(`>${type.toUpperCase()}</text>`));
  }
});

test('#1122 schematic drawing: a VCC / GND wider than a bit has its stem a bus, as every symbol\'s pin; one bit, a thin one', () => {
  // (the stem, in the symbol's own frame: VCC's from its bar down to its pin, GND's from its pin down to its bars)
  const stem = { vcc: { x1: '10', y1: '10', x2: '10', y2: '30' }, gnd: { x1: '10', y1: '0', x2: '10', y2: '20' } };
  for (const type of ['vcc', 'gnd']) {
    const body = (params) => { const sym = { id: 'S1', type, x: 0, y: 0, rot: 0, mirror: false, name: 'U1', params }; return bodySvg(sym, symbolDef(sym)); };
    const leads = (svg) => [...svg.matchAll(/<line class="(pin(?: bus)?)"[^>]*>/g)].map((m) => ({ cls: m[1], ...Object.fromEntries(['x1', 'y1', 'x2', 'y2'].map((k) => [k, attrs(m[0])[k]])) }));
    assert.deepEqual(leads(body({ width: 8 })), [{ cls: 'pin bus', ...stem[type] }], type);
    assert.deepEqual(leads(body({ width: 1 })), [{ cls: 'pin', ...stem[type] }], type);
    assert.deepEqual(leads(body({})), [{ cls: 'pin', ...stem[type] }], type);
    // the bar(s) still the shape's
    assert.match(body({ width: 8 }), type === 'vcc' ? /<path class="gate nofill" d="M2,10 H18"\/>/ : /<path class="gate nofill" d="M1,20 H19 M4,24 H16 M7,28 H13"\/>/);
  }
});

// #1137: every symbol in its 8 orientations (turned 0 / 90 / 180 / 270, mirrored or not): its pin names inside its
// body, none on a pin's lead (#1134: ADD / SUB / COMP / MUX turned 90° / 270°), the names hidden on purpose (the
// multiplexer's output, COMP's and SUB's results) hidden turned too, a clock pin's triangle at it (#1135: the device
// primitives), a bus pin's width inside the symbol's box and off the leads too (#1139). A text's box from its 9 px font (a letter 5.5 px wide at most, 7 px above its baseline, 2 below).
const ORIENTS = [0, 90, 180, 270].flatMap((rot) => [false, true].map((mirror) => ({ rot, mirror })));
const ALL = [...Object.keys(SYMBOLS).filter((t) => !['module', 'hdlblock'].includes(t)).map((t) => [t]),
  ['mux2', { en: true }], ['mux8', { en: true }], ['mux4', { selBus: true }], ['demux', { sel: 3, en: true }],
  ['add', { width: 4, bits: true, cin: true, cout: true }], ['add', { cin: true, cout: true }], ['sub', { bin: true, bout: true }],
  ['decoder', { n: 3, bus: true }], ['module', { module: 'sub' }],
  // (buses: their widths)
  ['mux4', { width: 8 }], ['mux2', { width: 16, en: true }], ['demux', { sel: 2, width: 8 }], ['compare', { width: 16 }],
  ['register', { width: 16 }], ['counter', { width: 8, bits: false }], ['constant', { value: '5', width: 8 }], ['vcc', { width: 8 }],
  ['gnd', { width: 4 }], ['busjoin', { widths: '4,4' }], ['slice', { msb: 7, lsb: 4 }],
  // (the gates' widths on their pins, #1486)
  ['and2', { width: 8 }], ['nor4', { width: 16 }], ['and3b2', { width: 16 }], ['xnor2b1', { width: 16 }], ['or4b4', { width: 16 }],
  ['inv', { width: 8 }], ['buf', { width: 16 }], ['tbuf', { width: 8 }], ['tbuf', { width: 16, enable: 'T' }], ['tbuf', { width: 4, bits: true }]];
function textBox(t) {
  const a = attrs(t), n = t.replace(/<[^>]*>/g, '').replace(/&[a-z]+;/g, 'x').length, w = 5.5 * n, x = +a.x, y = +a.y;
  const at = a['text-anchor'] || 'start', off = at === 'end' ? -w : at === 'middle' ? -w / 2 : 0;
  // (turned to read upwards: rotate(-90) about its point)
  return a.transform ? { x0: x - 7, x1: x + 2, y0: y - off - w, y1: y - off } : { x0: x + off, x1: x + off + w, y0: y - 7, y1: y + 2 };
}
const crosses = (b, [p, q]) => Math.max(p.x, q.x) > b.x0 + 0.5 && Math.min(p.x, q.x) < b.x1 - 0.5 && Math.max(p.y, q.y) > b.y0 + 0.5 && Math.min(p.y, q.y) < b.y1 - 0.5;

test('#1137 schematic drawing: every symbol turned and mirrored, its pin names inside its body and off its leads, its clocks\' triangles', () => {
  const bad = [];
  for (const [type, params] of ALL) {
    for (const { rot, mirror } of ORIENTS) {
      const sym = { id: 'S1', type, x: 200, y: 100, rot, mirror, name: 'U1', params: { ...defaultParams(type), ...(params || {}) } };
      const def = symbolDef(sym, MODULES), what = `${type}${params ? JSON.stringify(params) : ''} rot ${rot}${mirror ? ' mirrored' : ''}`;
      const svg = symbolSvg(sym, def);
      const [a, b, c, d, e, f] = svg.match(/transform="matrix\(([^)]*)\)"/)[1].split(',').map(Number);
      const at = (x, y) => ({ x: a * x + c * y + e, y: b * x + d * y + f });
      const leads = [...bodySvg(sym, def).matchAll(/<line class="pin[^"]*"[^>]*>/g)].map((m) => { const l = attrs(m[0]); return [at(+l.x1, +l.y1), at(+l.x2, +l.y2)]; });
      const p0 = at(def.body.x, def.body.y), p1 = at(def.body.x + def.body.w, def.body.y + def.body.h);
      const body = { x0: Math.min(p0.x, p1.x) - 1, x1: Math.max(p0.x, p1.x) + 1, y0: Math.min(p0.y, p1.y) - 1, y1: Math.max(p0.y, p1.y) + 1 };
      const names = [...svg.matchAll(/<text class="pname"[^>]*>[^<]*<\/text>/g)].map((m) => m[0]);
      const sb = symbolBox(sym, MODULES, def);
      for (const t of [...svg.matchAll(/<text class="pwidth[^"]*"[^>]*>[^<]*<\/text>/g)].map((m) => m[0])) {
        const box = textBox(t), w = t.replace(/<[^>]*>/g, '');
        if (box.x0 < sb.x - 1 || box.x1 > sb.x + sb.w + 1 || box.y0 < sb.y - 1 || box.y1 > sb.y + sb.h + 1) bad.push(`${what}: width ${w} out of the box`);
        // (on its own lead, which it breaks: no other one, #1174)
        const at = { x: +attrs(t).x, y: +attrs(t).y - 3 };
        const own = (l) => (l[0].x === l[1].x ? Math.abs(l[0].x - at.x) < 0.5 && at.y >= Math.min(l[0].y, l[1].y) && at.y <= Math.max(l[0].y, l[1].y)
          : Math.abs(l[0].y - at.y) < 0.5 && at.x >= Math.min(l[0].x, l[1].x) && at.x <= Math.max(l[0].x, l[1].x));
        if (leads.some((l) => !own(l) && crosses(box, l))) bad.push(`${what}: width ${w} on a lead`);
        if (!leads.some(own)) bad.push(`${what}: width ${w} not on its lead`);
      }
      for (const t of names) {
        const box = textBox(t), name = t.replace(/<[^>]*>/g, '');
        if (box.x0 < body.x0 || box.x1 > body.x1 || box.y0 < body.y0 || box.y1 > body.y1) bad.push(`${what}: ${name} out of the body`);
        if (leads.some((l) => crosses(box, l))) bad.push(`${what}: ${name} on a lead`);
      }
      // the names hidden on purpose, whatever the orientation
      const shown = names.map((t) => t.replace(/<[^>]*>/g, ''));
      if (def.shape === 'mux' || ['sub', 'compare'].includes(type)) {
        for (const p of def.pins.filter((q) => q.side === 'E')) if (shown.includes(p.name)) bad.push(`${what}: ${p.name} shown`);
      }
      // a clock's triangle at its pin's lead end, on the body's edge
      const clocks = [...bodySvg(sym, def).matchAll(/<path class="clk" d="M([\d.-]+),([\d.-]+) L([\d.-]+),([\d.-]+)/g)].map((m) => ({ x: +m[3], y: +m[4] }));
      for (const p of def.pins.filter((q) => q.clock)) {
        if (!clocks.some((k) => Math.abs(k.y - p.y) < 0.5)) bad.push(`${what}: no clock triangle at ${p.name}`);
      }
    }
  }
  assert.deepEqual(bad, []);
});

// #1138: ADD and SUB in the adder's usual shape (narrower on the result's side, notched between A and B), each pin's
// lead ending on its outline; COMP, and ADD / SUB with a pin per bit, boxes
test('#1138 schematic drawing: ADD and SUB drawn as an adder (a notched trapezoid), their leads ending on it; COMP a box', () => {
  const onSeg = (p, a, b) => Math.abs((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)) < 1e-6
    && p.x >= Math.min(a.x, b.x) - 1e-6 && p.x <= Math.max(a.x, b.x) + 1e-6 && p.y >= Math.min(a.y, b.y) - 1e-6 && p.y <= Math.max(a.y, b.y) + 1e-6;
  for (const [type, params] of [['add', {}], ['add', { cin: true, cout: true }], ['sub', { bin: true, bout: true }]]) {
    const sym = { id: 'S1', type, x: 0, y: 0, rot: 0, mirror: false, name: 'U1', params: { ...defaultParams(type), ...params } };
    const def = symbolDef(sym), body = bodySvg(sym, def), what = `${type} ${JSON.stringify(params)}`;
    assert.doesNotMatch(body, /<rect class="gate"/, what);
    const d = attrs(body.match(/<path class="gate"[^>]*>/)[0]).d;
    const pts = [...d.matchAll(/(-?[\d.]+),(-?[\d.]+)/g)].map((m) => ({ x: +m[1], y: +m[2] }));
    assert.deepEqual(pts.map((p) => `${p.x},${p.y}`), ['20,0', '60,8', `60,${def.h - 8}`, `20,${def.h}`, '20,25', '27,20', '20,15'], what);
    // (the notch between A and B)
    const [a, b] = ['A', 'B'].map((n) => def.pins.find((p) => p.name === n).y);
    assert.ok(a < 20 && 20 < b, what);
    for (const p of def.pins) {
      const lead = [...body.matchAll(/<line class="pin[^"]*"[^>]*>/g)].map((m) => attrs(m[0])).find((l) => +l.x1 === p.x && +l.y1 === p.y || +l.x2 === p.x && +l.y2 === p.y);
      const inner = +lead.x1 === p.x && +lead.y1 === p.y ? { x: +lead.x2, y: +lead.y2 } : { x: +lead.x1, y: +lead.y1 };
      assert.ok(pts.some((q, i) => onSeg(inner, q, pts[(i + 1) % pts.length])), `${what}: ${p.name}'s lead on the outline`);
    }
  }
  for (const [type, params] of [['compare', {}], ['add', { width: 4, bits: true }]]) {
    const sym = { id: 'S1', type, x: 0, y: 0, rot: 0, mirror: false, name: 'U1', params: { ...defaultParams(type), ...params } };
    assert.match(bodySvg(sym, symbolDef(sym)), /<rect class="gate"/, type);
  }
});

// #1486: a gate wider than a bit (AND…XNOR, their inverted-input forms, INV, BUF, BUFE / BUFT) shows its width on each
// bus pin's lead, as the other symbols (pinWidth: 10 px in, upright, the lead broken under it), and nothing inside its
// shape; an inverted input's in the middle of its lead, clear of its bubble; a one-bit gate none
test('#1486 schematic drawing: a gate wider than a bit, its width at its input and output pins, not inside its shape', () => {
  const widths = (svg) => [...svg.matchAll(/<text class="pwidth on" x="([\d.-]+)" y="([\d.-]+)" text-anchor="middle">([^<]*)</g)]
    .map((m) => ({ x: +m[1], y: +m[2], w: m[3] }));
  for (const type of ['and2', 'or3', 'nand4', 'nor2', 'xor2', 'xnor3', 'and3b2', 'xor2b1', 'inv', 'buf', 'tbuf']) {
    for (const { rot, mirror } of ORIENTS) {
      const sym = { id: 'S1', type, x: 200, y: 100, rot, mirror, name: 'U1', params: { ...defaultParams(type), width: 8 } };
      const def = symbolDef(sym), svg = symbolSvg(sym, def), what = `${type} rot ${rot}${mirror ? ' mirrored' : ''}`;
      const pins = symbolPins(sym, null, def), bus = def.pins.map((p, i) => [p, pins[i]]).filter(([p]) => p.width > 1);
      // (every pin but the tri-state buffer's enable)
      assert.equal(bus.length, def.pins.length - (type === 'tbuf' ? 1 : 0), what);
      const at = bus.map(([lp, p]) => {
        const v = { W: [1, 0], E: [-1, 0], N: [0, 1], S: [0, -1] }[p.side];
        const xe = lp.inv ? +attrs(bodySvg(sym, def).match(new RegExp(`<circle class="gate bubble" cx="([\\d.]+)" cy="${lp.y}"`))[0]).cx - 4 : 0;
        const d = lp.inv ? xe / 2 : 10;
        return { x: r1(p.x + d * v[0]), y: r1(p.y + d * v[1] + 3), w: '8' };
      });
      assert.deepEqual(widths(svg), at, what);
      // nothing in the shape: no pin name, no other text but the type under it
      assert.doesNotMatch(svg, /class="pname"/, what);
      assert.deepEqual([...svg.matchAll(/<text class="(\w+)/g)].map((m) => m[1]).filter((c) => c !== 'pwidth'), type === 'tbuf' ? [] : ['stype'], what);
    }
    const one = { id: 'S1', type, x: 200, y: 100, rot: 0, mirror: false, name: 'U1', params: { ...defaultParams(type), width: 1 } };
    assert.deepEqual(widths(symbolSvg(one, symbolDef(one))), [], `${type} one bit`);
    assert.doesNotMatch(symbolSvg(one, symbolDef(one)), /class="pname"/, `${type} one bit`);
  }
  // an inverted input's width clear of its bubble (AND3B2: the bubble 12..20, the width at 6)
  const sym = { id: 'S1', type: 'and3b2', x: 0, y: 0, rot: 0, mirror: false, name: 'U1', params: { width: 16 } };
  assert.deepEqual(widths(symbolSvg(sym, symbolDef(sym))).map((t) => t.x), [6, 6, 10, 70]);
});

// #1488: the bus join and the bus tap show their width on their pins, as every other symbol: the join's on its output
// (its inputs their indices instead, #1908); the tap's none (#1800)
test('#1488 #1800 schematic drawing: the bus join\'s width on its output; the bus tap shows none', () => {
  const widths = (svg) => [...svg.matchAll(/<text class="pwidth on" x="([\d.-]+)" y="([\d.-]+)" text-anchor="middle">([^<]*)</g)].map((m) => `${m[3]} at ${m[1]},${m[2]}`);
  const draw = (type, params, rot = 0, mirror = false, ctx) => { const sym = { id: 'S1', type, x: 200, y: 100, rot, mirror, name: 'U1', params: { ...defaultParams(type), ...params } }; return symbolSvg(sym, symbolDef(sym), '', ctx); };
  // (the join's output's lead 22..40: 10 px in from its pin's end)
  assert.deepEqual(widths(draw('busjoin', { widths: '4,4' })), ['8 at 230,123']);
  assert.deepEqual(widths(draw('busjoin', { widths: '1,7' })), ['8 at 230,123']);
  // (the bus tap shows none: its indices say it, #1800)
  for (const { rot, mirror } of ORIENTS) {
    assert.deepEqual(widths(draw('slice', { msb: 7, lsb: 4 }, rot, mirror, { busName: 'DATA' })), [], `rot ${rot}${mirror ? ' mirrored' : ''}`);
  }
});

// #1908: the bus join's inputs each show their bits of its output on their wire, inside the symbol, as the bus tap's
// (#1800): (7:4) for a bus, (3) for a bit, I0 the most significant part; centred on the input's lead (0..18), with the
// widths' halo; no width of their own; in every orientation
test('#1908 schematic drawing: the bus join\'s inputs show their bits of its output on their wire, (7:4)', () => {
  const draw = (rot, mirror, widths) => {
    const sym = { id: 'S1', type: 'busjoin', x: 200, y: 100, rot, mirror, name: 'U1', params: { ...defaultParams('busjoin'), widths } };
    const def = symbolDef(sym);
    return { svg: symbolSvg(sym, def), def, sym };
  };
  const labels = (svg) => [...svg.matchAll(/<text class="stext on"[^>]*>([^<]*)</g)].map((m) => ({ ...attrs(m[0]), text: m[1] }));
  for (const [widths, want] of [['4,4', ['(7:4)', '(3:0)']], ['1,7', ['(7)', '(6:0)']], ['2,1,5', ['(7:6)', '(5)', '(4:0)']], ['1,1', ['(1)', '(0)']], ['16', ['(15:0)']]]) {
    for (const { rot, mirror } of ORIENTS) {
      const where = `${widths} rot ${rot}${mirror ? ' mirrored' : ''}`;
      const { svg, def, sym } = draw(rot, mirror, widths);
      const ls = labels(svg);
      assert.deepEqual(ls.map((l) => l.text), want, where);
      // each on its input's lead, half way along it
      const ins = def.pins.filter((p) => p.dir === 'in');
      assert.deepEqual(ls.map((l) => [+l.x, +l.y, l['text-anchor']]), ins.map((p) => { const m = xform(sym, def, 9, p.y); return [m.x, m.y + 3, 'middle']; }), where);
      assert.equal([...svg.matchAll(/class="pwidth/g)].length, 1, `${where}: the output's width only`);
    }
  }
  // the widths of no input: no label, no width
  const none = draw(0, false, '').svg;
  assert.deepEqual([labels(none), [...none.matchAll(/class="pwidth/g)].length], [[], 0]);
});

// #1726: the bus tap drawn as ISE's: its input (I) on the bus, a diagonal entry from there to the line of the bit(s)
// it takes, their wire to its output (O), a grid step aside from the input; its bit(s) with the bus's name on that wire,
// inside the symbol, where a bus pin's width is (#1800: the tap shows no width); in every orientation
test('#1726 schematic drawing: the bus tap as ISE\'s, a diagonal entry from its bus, A(5:2) on its wire inside it', () => {
  const draw = (rot, mirror, params = { msb: 5, lsb: 2 }) => {
    const sym = { id: 'S1', type: 'slice', x: 200, y: 100, rot, mirror, name: 'U1', params: { ...defaultParams('slice'), ...params } };
    const def = symbolDef(sym);
    return { svg: symbolSvg(sym, def, '', { busName: 'A' }), pins: Object.fromEntries(symbolPins(sym, null, def).map((p) => [p.name, p])) };
  };
  const sym0 = { type: 'slice', params: defaultParams('slice') };
  assert.deepEqual([symbolDef(sym0).w, symbolDef(sym0).h, symbolDef(sym0).pins.map((p) => `${p.name} ${p.x},${p.y} ${p.side}`)], [40, 20, ['I 0,0 W', 'O 40,10 E']]);
  for (const { rot, mirror } of ORIENTS) {
    const { svg, pins } = draw(rot, mirror);
    const where = `rot ${rot}${mirror ? ' mirrored' : ''}`;
    const [a, b, c, d, e, f] = svg.match(/transform="matrix\(([^)]*)\)"/)[1].split(',').map(Number);
    const at = (x, y) => ({ x: a * x + c * y + e, y: b * x + d * y + f });
    const leads = [...svg.matchAll(/<line class="(pin[^"]*)"[^>]*>/g)].map((m) => { const l = attrs(m[0]); return { cls: m[1], p: at(+l.x1, +l.y1), q: at(+l.x2, +l.y2) }; });
    // the diagonal: a bus lead from the input, at 45°, a grid step across; then the output's lead, in line with O
    const [diag, out] = leads;
    assert.equal(diag.cls, 'pin bus', where);
    assert.deepEqual([diag.p.x, diag.p.y], [pins.I.x, pins.I.y], `${where}: the diagonal from the input`);
    assert.deepEqual([Math.abs(diag.q.x - diag.p.x), Math.abs(diag.q.y - diag.p.y)], [10, 10], `${where}: at 45°`);
    assert.deepEqual([out.p, out.q].map((p) => [p.x, p.y]), [[diag.q.x, diag.q.y], [pins.O.x, pins.O.y]], `${where}: the output's lead from its end`);
    assert.equal(out.cls, 'pin bus', `${where}: 4 bits, a bus`);
    // the text on the output's wire, centred where a bus pin's width is, with its halo (#1800); no width
    assert.equal(svg.match(/<text class="stext on"[^>]*>([^<]*)</)[1], 'A(5:2)');
    const t = attrs(svg.match(/<text class="stext on"[^>]*>/)[0]);
    const mid = { x: (diag.q.x + pins.O.x) / 2, y: (diag.q.y + pins.O.y) / 2 };
    assert.deepEqual([+t.x, +t.y, t['text-anchor']], [mid.x, mid.y + 3, 'middle'], `${where}: on the output's wire, centred`);
    assert.doesNotMatch(svg, /class="pwidth/, `${where}: no width`);
  }
  // one bit: a thin output
  const one = draw(0, false, { msb: 3, lsb: 3 }).svg;
  assert.match(one, /<line class="pin" x1="10" y1="10" x2="40" y2="10"\/>/);
});

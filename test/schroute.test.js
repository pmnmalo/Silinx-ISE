// Moving schematic symbols: stretched wires are re-routed without changing the connectivity.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as sd from '../core/schdoc.js';
import { rerouteAfterMove, connectivity, placementClashes } from '../core/schroute.js';
import { compile, elaborate } from '../core/compile.js';

const EX = new URL('../examples/blinky/', import.meta.url);
const files = ['src/top.vhd', 'src/knight.vhd', 'src/counter.v', 'src/speed_ctrl.vhd'];
const sources = Object.fromEntries(files.map(f => [f, fs.readFileSync(new URL(f, EX), 'utf8')]));
const lib = compile(Object.entries(sources).map(([path, text]) => ({ path, text })));
const modules = sd.modulesFromLibrary(lib, { sources });

test('moving any symbol of the blinky top schematic keeps its connections (when the drop does not land on another net)', async () => {
  const orig = sd.normalizeDoc(await sd.schematicFromHdl(elaborate(lib, 'top').top, { sources, modules, lang: 'vhdl' }));
  const before = connectivity(orig, modules);
  let tried = 0, kept = 0;
  for (const s of orig.symbols) for (const [dx, dy] of [[70, 50], [-60, 30], [40, -80], [0, 40]]) {
    const doc = structuredClone(orig);
    const sym = doc.symbols.find(x => x.id === s.id);
    const moved = new Set(sd.symbolPins(sym, modules).map(p => `${p.x},${p.y}`));
    const attach = [];
    for (const w of doc.wires) {
      const a = moved.has(`${w.points[0].x},${w.points[0].y}`), b = moved.has(`${w.points.at(-1).x},${w.points.at(-1).y}`);
      if (a || b) attach.push({ id: w.id, a, b });
    }
    sym.x += dx; sym.y += dy;
    if (placementClashes(doc, { moved: { symIds: new Set([s.id]), portIds: new Set() }, attachedIds: new Set(attach.map(a => a.id)), modules })) continue;
    tried++;
    const r = rerouteAfterMove(doc, { orig: structuredClone(orig), attached: attach, dx, dy, modules });
    const after = connectivity(sd.normalizeDoc(doc), modules);
    if (!r.failed.length && JSON.stringify(after) === JSON.stringify(before)) kept++;
    else if (process.env.DEBUG_ROUTE) console.log(s.name, s.type, dx, dy, r.failed, before.filter(n => !after.includes(n)), after.filter(n => !before.includes(n)));
  }
  assert.ok(tried > 20, `tried ${tried}`);
  assert.equal(kept, tried, `connections kept in ${kept} of ${tried} moves`);
});

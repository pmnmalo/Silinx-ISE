// The HLS corpus (#1597): its manifest (AMD's Vitis HLS examples pinned to a commit, a licence; each design's top, files,
// test bench, headers, language), the configs read as Vitis HLS writes them, a design's unit, its stages on a design
// of its own (the C simulation of its test bench, the C synthesis, the co-simulation), the comparison with the
// expectations and the README's table. No network: the corpus itself is run by npm run test:hls.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { readConfig, designOf, HLS_MANIFEST } from '../scripts/hls-corpus-manifest.mjs';
import { unitOf, runDesign, compareExpectations, table } from './hls-corpus/lib.mjs';

test('#1597 the manifest: AMD\'s examples at a pinned commit (Apache-2.0); every design its top, files, language; its expectations for each', () => {
  const m = JSON.parse(fs.readFileSync(HLS_MANIFEST, 'utf8'));
  const src = m.sources['vitis-hls-examples'];
  assert.match(src.commit, /^[0-9a-f]{40}$/);
  assert.equal(src.licence, 'Apache-2.0');
  assert.ok(m.designs.length >= 70);
  for (const d of m.designs) {
    assert.ok(d.top && d.files.length, d.name);
    assert.ok(['c', 'c++'].includes(d.language), d.name);
  }
  const expected = JSON.parse(fs.readFileSync(new URL('./hls-corpus/expected.json', import.meta.url), 'utf8'));
  assert.deepEqual(Object.keys(expected).sort(), m.designs.map((d) => d.name).sort());
});

test('#1597 a config as Vitis HLS writes it; a design from it (files of another folder, a test bench folder, the headers beside its sources)', () => {
  const cfg = readConfig('part=xc7z020\n[hls]\nflow_target=vivado\nclock=4\nsyn.file=../top.c\nsyn.top=top\ntb.file=top_test.c\ntb.file=data # golden\nsyn.directive.interface=top mode=m_axi port=d\n');
  assert.deepEqual(cfg, { top: 'top', files: ['../top.c'], tb: ['top_test.c', 'data'], blackbox: [], flow: 'vivado', clock: '4', directives: ['interface top mode=m_axi port=d'] });
  const d = designOf('A/b', cfg, ['A/top.c', 'A/top.h', 'A/b/top_test.c', 'A/b/data/in.dat', 'A/b/data/out.dat', 'A/b/other.hpp', 'B/x.h']);
  assert.deepEqual(d, { name: 'a-b', source: 'vitis-hls-examples', dir: 'A/b', top: 'top', language: 'c', files: ['A/top.c'], tb: ['A/b/top_test.c', 'A/b/data/in.dat', 'A/b/data/out.dat'], headers: ['A/top.h', 'A/b/other.hpp'], directives: ['interface top mode=m_axi port=d'] });
});

test('#1903 a config with syn.blackbox.file: its description, and the C models and RTL beside it', () => {
  const cfg = readConfig('[hls]\nsyn.blackbox.file=m.json\nsyn.file=e.cpp\nsyn.top=e\ntb.file=t.cpp\n');
  assert.deepEqual(cfg.blackbox, ['m.json']);
  const d = designOf('M', cfg, ['M/e.cpp', 'M/e.h', 'M/t.cpp', 'M/m.json', 'M/m.cpp', 'M/m.v', 'M/run.py', 'N/x.v']);
  assert.deepEqual(d.blackbox, { descriptions: ['M/m.json'], files: ['M/m.cpp', 'M/m.v'] });
  assert.deepEqual(JSON.parse(fs.readFileSync(HLS_MANIFEST, 'utf8')).designs.find((x) => x.name === 'misc-rtl-as-blackbox').blackbox, { descriptions: ['Misc/rtl_as_blackbox/rtl_model.json'], files: ['Misc/rtl_as_blackbox/rtl_model.cpp', 'Misc/rtl_as_blackbox/rtl_model.v'] });
});

test('#1597 a design through the stages; the differences from the expectations; the table', () => {
  const design = { name: 'acc', top: 'acc', language: 'c', files: ['x/acc.c'], tb: ['x/acc_test.c'], headers: ['x/acc.h'] };
  const texts = {
    'x/acc.h': '#pragma once\nint acc(int v);\n',
    'x/acc.c': '#include "acc.h"\nint acc(int v) { static int s = 0; s += v; return s; }\n',
    'x/acc_test.c': '#include <stdio.h>\n#include "acc.h"\nint main(void) { int r = 0; for (int i = 1; i <= 4; i++) r = acc(i); printf("%d\\n", r); return r == 10 ? 0 : 1; }\n',
  };
  assert.equal(unitOf(design, texts).unit, '#include "x/acc.c"\n#include "x/acc_test.c"\n');
  const r = runDesign(design, texts);
  assert.deepEqual({ ...r, latency: !!r.latency }, { csim: 'pass', synth: 'pass', cosim: 'pass', latency: true, reason: null });
  const bad = runDesign(design, { ...texts, 'x/acc_test.c': texts['x/acc_test.c'].replace('r == 10', 'r == 11') });
  assert.deepEqual([bad.csim, bad.synth, bad.cosim, bad.reason], ['fail', 'pass', 'skip', 'C simulation: main() returned 1']);
  // (a C++ design: its unit C++, a reference parameter)
  const cpp = runDesign({ ...design, language: 'c++' }, { ...texts, 'x/acc.c': texts['x/acc.c'].replace('int acc(int v) {', 'int acc(int v) {\n  int &w = v; (void)w;') });
  assert.equal(cpp.synth, 'fail');
  assert.deepEqual(compareExpectations({ acc: r, new1: r }, { acc: { ...r, cosim: 'fail' } }), [{ name: 'acc', stage: 'cosim', expected: 'fail', got: 'pass' }, { name: 'new1', stage: '*', expected: 'none', got: 'new design' }]);
  assert.match(table({ designs: [design] }, { acc: r }), /^\| acc \| C \| pass \| pass \| pass \| \d+ \|  \|$/m);
});

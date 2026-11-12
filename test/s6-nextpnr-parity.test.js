// The bar of #3139 (nextpnr's Spartan-6 Map against Silinx's Map): the board's examples' periods within 5 % on average,
// the geometric mean of their ratios (examples-nextpnr-s6-pack-lib.mjs, the maintainer's bar of 2026-11-12), checked on
// the periods recorded in packages/silinx-fpga/research/s6/README.md against the product's root, computed here.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './examples-lib.mjs';
import { PARITY, PERIOD_NOISE, meanRatio } from './examples-nextpnr-s6-pack-lib.mjs';

// the README's table (2026-11-12): Silinx's Map / nextpnr's, the best of 3 seeds (ns), the nine clocked examples
const RECORDED = {
  nexys3: [[5.739, 6.082], [4.646, 4.726], [8.171, 8.216], [8.941, 9.067], [6.577, 5.782], [6.501, 6.824], [4.435, 4.392], [5.845, 6.015], [8.640, 9.759]],
  atlys: [[5.775, 6.241], [4.653, 4.744], [8.203, 8.160], [9.354, 9.489], [5.567, 5.902], [6.384, 6.869], [4.610, 4.759], [5.689, 5.788], [8.434, 9.065]],
};
const root = pairs => pairs.reduce((p, [s, n]) => p * n / s, 1) ** (1 / pairs.length);
const percent = r => ((r - 1) * 100).toFixed(1);

test('#3139 the bar: 5 % on average, 15 % on one example', () => {
  assert.equal(PARITY, 1.05);
  assert.equal(PERIOD_NOISE, 1.15);
});

test('#3139 the board\'s average: the geometric mean of the ratios, the README\'s 1.7 % on the Nexys3 and 4.1 % on the Atlys, within the bar', () => {
  for (const [board, pairs] of Object.entries(RECORDED)) {
    const mean = meanRatio(pairs.map(([s, n]) => n / s));
    assert.ok(Math.abs(mean - root(pairs)) < 1e-12, board);
    assert.ok(mean <= PARITY, `${board}: ${mean}`);
  }
  assert.equal(percent(meanRatio(RECORDED.nexys3.map(([s, n]) => n / s))), '1.7');
  assert.equal(percent(meanRatio(RECORDED.atlys.map(([s, n]) => n / s))), '4.1');
});

test('#3139 the bar\'s edges: 5 % passes, more fails; one example\'s 13 % passes when the others make up for it', () => {
  assert.ok(meanRatio([1.05, 1.05, 1.05]) <= PARITY + 1e-12);
  assert.ok(!(meanRatio([1.06, 1.05, 1.05]) <= PARITY));
  assert.ok(meanRatio([1.04, 1.04, 1.04]) <= PARITY);
  assert.ok(meanRatio([1.13, 0.95, 1.0]) <= PARITY);
  assert.equal(meanRatio([0.9, 1 / 0.9]).toFixed(12), '1.000000000000');
  // no example measured: no average (NaN, never within the bar)
  assert.ok(Number.isNaN(meanRatio([])) && !(meanRatio([]) <= PARITY));
});

test('#3139 the README states the bar the test checks', () => {
  const readme = fs.readFileSync(path.join(ROOT, 'packages/silinx-fpga/research/s6/README.md'), 'utf8');
  const section = readme.slice(readme.indexOf('### nextpnr\'s Map against Silinx\'s Map (#3139'));
  assert.match(section, new RegExp(`the periods within ${Math.round((PARITY - 1) * 100)} % of its on average on\\s+each board`));
  assert.match(section, new RegExp(`within ${Math.round((PERIOD_NOISE - 1) * 100)} % and the board's within ${Math.round((PARITY - 1) * 100)} % on average`));
  assert.doesNotMatch(section, /within about 4 %/);
});

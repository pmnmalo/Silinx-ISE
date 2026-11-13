// The micro80 example's warnings under ISE (test/ise-micro80-warnings.mjs, #2688): the lists the ISE tests compare with
// what ISE says, sorted and deduplicated as they sort ISE's lines, so a list out of order fails here and not on the ISE machine.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { micro80S3eWarnings, MICRO80_S6_WARNINGS } from './ise-micro80-warnings.mjs';

const asIseSorts = list => [...new Set(list.map(l => l.replace(/\s+/g, ' ').trim()))].sort();

test('the Spartan-3E list: 41 warnings of XST, sorted, the top\'s unconnected ports in the folder given', () => {
  for (const dir of ['/work/src/src', '/work/src']) {
    const list = micro80S3eWarnings(dir);
    assert.equal(list.length, 41);
    assert.deepEqual(list, asIseSorts(list));
    assert.ok(list.every(l => l.startsWith('WARNING:Xst:')));
    const ports = list.filter(l => l.startsWith('WARNING:Xst:753 '));
    assert.deepEqual(ports.map(l => /port '(\w+)'/.exec(l)[1]), ['fetch', 'halt', 'inta', 'inte', 'rd', 'vma']);
    assert.ok(ports.every(l => l.includes(`"${dir}/micro80_top.vhd" line 74:`)));
  }
});

test('the Spartan-6 list: 26 warnings of XST, map and par, sorted, no path in them', () => {
  assert.equal(MICRO80_S6_WARNINGS.length, 26);
  assert.deepEqual(MICRO80_S6_WARNINGS, asIseSorts(MICRO80_S6_WARNINGS));
  assert.deepEqual([...new Set(MICRO80_S6_WARNINGS.map(l => /^WARNING:(\w+):/.exec(l)[1]))], ['Par', 'PhysDesignRules', 'Xst']);
  assert.ok(!MICRO80_S6_WARNINGS.some(l => l.includes('/work/')));
});

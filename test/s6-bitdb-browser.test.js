// The Spartan-6's bit databases in the browser (#2103): fpga/s6/bitdb.js fetchBitDbS6, from fetched files, gives the
// same object as the server's loadBitDbS6 (bitdb-node.js, node:fs) for both parts, with and without the CMTs' input
// bits; it asks for the files the part reads only, each once; every file of bitdb/s6 but the tests' is one a part reads
// (a new one the browser would not fetch fails here); a file the site has not is null, as on the disk.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadBitDbS6, S6_DB_DIR } from '../packages/silinx-fpga/src/node.js';
import { fetchBitDbS6, s6DbNames, bitDbS6 } from '../packages/silinx-fpga/src/index.js';

// a site's bitdb/s6 folder: each file as the worker's fetch gives it (r.ok ? r.json() : null), the names asked
const site = (dir = S6_DB_DIR) => {
  const asked = [];
  const fetchJson = async f => {
    asked.push(f);
    const p = path.join(dir, f);
    return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null;
  };
  return { asked, fetchJson };
};

for (const part of ['xc6slx16csg324-3', 'xc6slx45csg324-3']) {
  test(`#2103 ${part}: fetchBitDbS6 gives loadBitDbS6's object, each file asked once`, async () => {
    const { asked, fetchJson } = site();
    const db = await fetchBitDbS6(part, fetchJson);
    assert.deepEqual(db, loadBitDbS6(part));
    assert.deepEqual(asked.slice().sort(), s6DbNames(part).map(n => `${n}.json`).sort());
    assert.equal(new Set(asked).size, asked.length);
    // (the part's own files, not the other part's)
    const other = part.startsWith('xc6slx16') ? 'xc6slx45' : 'xc6slx16';
    assert.deepEqual(asked.filter(f => f.startsWith(`${other}-`) && !/^xc6slx16-(slice|int)/.test(f)), []);
    assert.ok(db.slices.lut && db.iob && db.hard && db.cmtSettings && db.cmtInput && db.ologic, 'its databases there');
  });

  test(`#2103 ${part}: cmtInput: false, as loadBitDbS6's: the CMTs' input bits neither fetched nor given`, async () => {
    const { asked, fetchJson } = site();
    const db = await fetchBitDbS6(part, fetchJson, { cmtInput: false });
    assert.deepEqual(db, loadBitDbS6(part, { cmtInput: false }));
    assert.equal(db.cmtInput, null);
    assert.deepEqual(asked.filter(f => /cmt-input/.test(f)), []);
  });
}

// (xc6slx16-cmt.json: the DCMs' and PLLs' measured variants, which the clock tests read, not the flow)
const NOT_THE_FLOWS = ['xc6slx16-cmt'];
test('#2103 every file of bitdb/s6 is one a part reads: the browser fetches them all', () => {
  const files = fs.readdirSync(S6_DB_DIR).filter(f => f.endsWith('.json') && !/ \d+\.json$/.test(f)).map(f => f.slice(0, -5)).filter(f => !NOT_THE_FLOWS.includes(f)).sort();
  const read = [...new Set(['xc6slx16csg324-3', 'xc6slx45csg324-3'].flatMap(s6DbNames))].sort();
  assert.deepEqual(read, files);
});

test('#2103 a file the site has not: null in the object, as a file missing on the disk', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 's6db-'));
  try {
    for (const f of fs.readdirSync(S6_DB_DIR)) if (f.endsWith('.json') && !/^s6-ologic|hard\.json$/.test(f)) fs.copyFileSync(path.join(S6_DB_DIR, f), path.join(tmp, f));
    const db = await fetchBitDbS6('xc6slx16csg324-3', site(tmp).fetchJson);
    assert.equal(db.ologic, null);
    assert.equal(db.hard, null);
    assert.deepEqual(db, loadBitDbS6('xc6slx16csg324-3', { dir: tmp }));
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

test('#2103 bitDbS6: the PIPs of the other tiles merged in order (the open flow\'s last), from any reader', () => {
  const files = { 'xc6slx16-int': { pips: { a: 1 } }, 'xc6slx16-int-cover': { pips: {} }, 'xc6slx16-int-own': { pips: {} },
    's6-pips-other': { pips: { p: 'other', q: 'other' } }, 'xc6slx16-pips-cmt': { pips: { q: 'cmt', r: 'cmt' } }, 's6-pips-flow': { pips: { r: 'flow' } } };
  const db = bitDbS6(n => files[n] ?? null, 'xc6slx16csg324-3');
  assert.deepEqual(db.other.pips, { p: 'other', q: 'cmt', r: 'flow' });
  assert.deepEqual(db.int, { pips: { a: 1 }, cover: {}, own: {} });
  assert.equal(db.iob, null);
});

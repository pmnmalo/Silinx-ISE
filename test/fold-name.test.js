// core/fold-name.js (#3034): a name as a case-insensitive file system may read it, one fold for the server, the import
// gate, the browser's stores and the design links.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { foldName, foldsToProjectFile, PROJECT_FILE } from '../core/fold-name.js';

test('#3034 foldName: the full case fold and NFKC; the server\'s foldName is this one', async () => {
  assert.equal(PROJECT_FILE, 'silinx.json');
  for (const s of ['silinx.json', 'SILINX.JSON', 'Silinx.Json', 'ſilinx.json', 'ｓilinx.json']) {
    assert.equal(foldName(s), 'silinx.json', s);
    assert.equal(foldsToProjectFile(s), true, s);
  }
  assert.equal('ſilinx.json'.toLowerCase(), 'ſilinx.json');   // (what toLowerCase alone leaves)
  assert.equal(foldName('buıld'), 'build');   // (the dotless i)
  assert.equal(foldName('café'), foldName('café'));   // (NFC and NFD)
  assert.equal(foldName(7), '7');
  for (const s of ['src/silinx.json', 'silinx.json5', 'xilinx.json', 'silinx_json', '']) assert.equal(foldsToProjectFile(s), false, s);
  const P = await import('../server/projects.js');
  assert.equal(P.foldName, foldName);
});

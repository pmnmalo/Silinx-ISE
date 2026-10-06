import { test } from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createZip, readZip, textOf } from '../core/zip.js';

const codec = { deflate: d => zlib.deflateRawSync(d), inflate: d => zlib.inflateRawSync(d) };

test('zip round trip (stored + deflated, UTF-8 names, binary)', async () => {
  const files = [
    { path: 'blinky.xise', data: '<?xml version="1.0"?>\n' + '<project>'.repeat(50) },
    { path: 'src/top.vhd', data: 'entity top is end;\n'.repeat(40) },
    { path: 'src/é.v', data: 'x' },
    { path: 'build/top.bit', data: new Uint8Array([0, 9, 15, 240, 255, 1, 2, 3]) },
  ];
  const z = await createZip(files, codec);
  const back = await readZip(z, codec);
  assert.deepEqual(back.map(e => e.path), files.map(f => f.path));
  assert.equal(textOf(back[1]), files[1].data);
  assert.deepEqual([...back[3].data], [...files[3].data]);
});

test('zip is readable by the system unzip and reads system zip output', async () => {
  let hasUnzip = true;
  try { execFileSync('unzip', ['-v'], { stdio: 'ignore' }); execFileSync('zip', ['-v'], { stdio: 'ignore' }); } catch { hasUnzip = false; }
  if (!hasUnzip) return;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xlzip-'));
  const z = await createZip([{ path: 'a/b.txt', data: 'hello '.repeat(100) }], codec);
  fs.writeFileSync(path.join(dir, 'x.zip'), z);
  assert.equal(execFileSync('unzip', ['-p', path.join(dir, 'x.zip'), 'a/b.txt']).toString(), 'hello '.repeat(100));
  fs.mkdirSync(path.join(dir, 'p/src'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'p/src/m.v'), 'module m; endmodule\n'.repeat(20));
  execFileSync('zip', ['-qr', '../y.zip', '.'], { cwd: path.join(dir, 'p') });
  const back = await readZip(fs.readFileSync(path.join(dir, 'y.zip')), codec);
  assert.equal(textOf(back.find(e => e.path === 'src/m.v')), 'module m; endmodule\n'.repeat(20));
  fs.rmSync(dir, { recursive: true, force: true });
});

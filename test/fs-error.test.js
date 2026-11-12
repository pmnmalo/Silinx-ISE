// A file system error on a project's file as the server answers it (server/fs-error.js, #3537): the project's path and
// a plain message for each code, never Node's own (which names the server's absolute path); any other error is not one.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fsFailure } from '../server/fs-error.js';

test('fsFailure: each code by the project\'s path; a file on the way named; other errors none', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-fserr-'));
  try {
    fs.mkdirSync(path.join(dir, 'src'));
    fs.writeFileSync(path.join(dir, 'src', 'a.v'), 'module a; endmodule\n');
    const at = (...p) => path.join(dir, ...p);
    const sys = (code) => Object.assign(new Error(`${code}: something, open '${dir}/x'`), { code, syscall: 'open' });
    // a real error of the system: a folder made through a file
    let real;
    try { fs.mkdirSync(at('src', 'a.v', 'b'), { recursive: true }); } catch (e) { real = e; }
    assert.deepEqual(await fsFailure(real, dir, at('src', 'a.v', 'b', 'c.v')), { status: 400, message: "'src/a.v' is a file, not a folder" });
    for (const [code, full, out] of [
      ['ENOTDIR', at('src', 'a.v', 'b.v'), { status: 400, message: "'src/a.v' is a file, not a folder" }],
      ['EEXIST', at('src', 'b.v'), { status: 409, message: "'src/b.v' already exists" }],
      ['EISDIR', at('src'), { status: 400, message: "'src' is a folder, not a file" }],
      ['ENOENT', at('src', 'none.v'), { status: 404, message: "no file or folder 'src/none.v'" }],
      ['EACCES', at('src', 'a.v'), { status: 403, message: "'src/a.v': permission denied" }],
      ['EPERM', at('src', 'a.v'), { status: 403, message: "'src/a.v': permission denied" }],
      ['ENAMETOOLONG', at('src', 'x.v'), { status: 400, message: "'src/x.v': name too long" }],
      ['ENOSPC', at('src', 'x.v'), { status: 507, message: "'src/x.v': no space left on the disk" }],
      ['EROFS', at('src', 'x.v'), { status: 403, message: "'src/x.v': the disk is read-only" }],
      ['EIO', at('src', 'x.v'), { status: 500, message: "'src/x.v': the file system's error EIO" }],
    ]) {
      const f = await fsFailure(sys(code), dir, full);
      assert.deepEqual(f, out, code);
      assert.ok(!f.message.includes(dir), code);
    }
    // not the system's: thrown as it is
    assert.equal(await fsFailure(new TypeError('x'), dir, at('a')), null);
    assert.equal(await fsFailure(Object.assign(new Error('x'), { code: 'ERR_INVALID_ARG_TYPE' }), dir, at('a')), null);
    assert.equal(await fsFailure(null, dir, at('a')), null);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

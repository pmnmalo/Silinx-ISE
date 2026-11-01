// A package's .tgz of a test's own, made by the system's tar (an independent writer): { bytes, integrity } (#2444)
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

export function fakeTgz(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-tgz-'));
  try {
    for (const [name, data] of Object.entries(files)) {
      const f = path.join(dir, 'package', name);
      fs.mkdirSync(path.dirname(f), { recursive: true });
      fs.writeFileSync(f, data);
    }
    execFileSync('tar', ['-czf', 'p.tgz', 'package'], { cwd: dir, env: { ...process.env, COPYFILE_DISABLE: '1' } });
    const bytes = new Uint8Array(fs.readFileSync(path.join(dir, 'p.tgz')));
    return { bytes, integrity: `sha512-${crypto.createHash('sha512').update(bytes).digest('base64')}` };
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

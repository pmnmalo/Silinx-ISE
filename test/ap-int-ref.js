// The reference of the Silinx HLS tests for ap_int / ap_uint (#1588): AMD's open ap_int.h (Xilinx/HLS_arbitrary_Precision_Types,
// Apache-2.0), at a fixed commit, each header checked against its git blob hash, fetched once into the machine's temporary
// folder (never into the repository); a program compiled with it by the host's C++ compiler. With no C++ compiler or
// no network, the tests that need it are skipped and say why.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { lf } from './c-helpers.js';

export const AP_INT_COMMIT = '200a9aecaadf471592558540dc5a88256cbf880f';
const FILES = {
  'ap_common.h': '4d2886cbde0677df934734737548b3437f2b12f8',
  'ap_decl.h': 'ddd00f1c7fd335af69311657a3aebfd106a5d292',
  'ap_fixed.h': 'cd0192bcb991d0c1bc30ea45273ee60f673a62dc',
  'ap_fixed_base.h': '1d94b938f04af5316d476d0b6b39d515a5431b85',
  'ap_fixed_ref.h': 'aefda0a6767aa0530931b9441dc549ab0e8aa839',
  'ap_fixed_special.h': '0f7a9f7eb35605b91ca5d32cd03115a94b554b7a',
  'ap_int.h': 'db3044d48ce8b19696aac46b97512da8efa5a5a7',
  'ap_int_base.h': '091552a88186d221c87d871200d8bd85339145f6',
  'ap_int_ref.h': '421f09fda6c7f194e7192fbb5a77ab984fb0e435',
  'ap_int_special.h': '3afc6192bae84676443f0375a9caf42ffadd3c7e',
  'etc/ap_private.h': '0c29a0ac1a65e671bf7b4509f58d452c83855e28',
};
const blobHash = (buf) => crypto.createHash('sha1').update(`blob ${buf.length}\0`).update(buf).digest('hex');

export const CXX = (() => { for (const c of ['c++', 'g++', 'clang++']) { try { execFileSync(c, ['--version'], { stdio: 'ignore' }); return c; } catch { /* next */ } } return null; })();

/** The folder of AMD's headers (fetched and checked once), or the reason there is none. */
export async function apIntHeaders() {
  if (!CXX) return { dir: null, why: 'no C++ compiler on this machine' };
  const dir = path.join(os.tmpdir(), `silinx-ap-int-${AP_INT_COMMIT.slice(0, 12)}`);
  const ok = (f) => { try { return blobHash(fs.readFileSync(path.join(dir, f))) === FILES[f]; } catch { return false; } };
  try {
    for (const f of Object.keys(FILES)) {
      if (ok(f)) continue;
      const res = await fetch(`https://raw.githubusercontent.com/Xilinx/HLS_arbitrary_Precision_Types/${AP_INT_COMMIT}/include/${f}`);
      if (!res.ok) return { dir: null, why: `AMD's ap_int.h could not be fetched (${res.status})` };
      const buf = Buffer.from(await res.arrayBuffer());
      if (blobHash(buf) !== FILES[f]) throw new Error(`${f}: not the file of commit ${AP_INT_COMMIT}`);
      fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
      fs.writeFileSync(path.join(dir, f), buf);
    }
  } catch (e) {
    if (/not the file of commit/.test(e.message)) throw e;
    return { dir: null, why: `AMD's ap_int.h could not be fetched (${e.message})` };
  }
  return { dir, why: null };
}

/** The output of a program compiled as C++ with AMD's headers. */
export function runWithApInt(src, headers) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-apref-'));
  try {
    fs.writeFileSync(path.join(tmp, 't.cpp'), src);
    const exe = path.join(tmp, process.platform === 'win32' ? 't.exe' : 't');
    // (ap_int_special.h and ap_fixed_special.h left out, std::complex of ap_int and ap_fixed: its own declaration of std::complex is ambiguous with libc++)
    execFileSync(CXX, ['-std=c++11', '-w', '-D__AP_INT_SPECIAL_H__', '-D__AP_FIXED_SPECIAL_H__', '-fsigned-char', '-fwrapv', '-ffp-contract=off', '-O0', '-I', headers, '-o', exe, path.join(tmp, 't.cpp')], { stdio: ['ignore', 'ignore', 'pipe'], encoding: 'utf8' });
    return lf(execFileSync(exe, { encoding: 'utf8' }));
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

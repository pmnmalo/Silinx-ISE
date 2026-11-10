// The ISE image kit's build scripts (docker/ise/build-ise-image.sh, .ps1): they parse; the inputs are taken from
// ~/Downloads only when no argument says, and the script says which; the staging folder is a new one of the
// run (nothing that was there before is removed); the help says what the MD5 check is (#1442). The image is
// never built here: the run stops at Docker.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SH = path.join(ROOT, 'docker/ise/build-ise-image.sh');
const PS1 = path.join(ROOT, 'docker/ise/build-ise-image.ps1');
const posix = process.platform !== 'win32';
const TAR = 'Xilinx_ISE_DS_Lin_14.7_1015_1.tar';

/** build-ise-image.sh with a home and a current folder of its own, a docker on the PATH that is not running. */
function run(args, { downloads = [], cwd = [] } = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ise-kit-'));
  const home = path.join(tmp, 'hm'), here = path.join(tmp, 'here'), bin = path.join(tmp, 'bin');
  for (const d of [path.join(home, 'Downloads'), here, bin]) fs.mkdirSync(d, { recursive: true });
  const write = (dir, f) => fs.writeFileSync(path.join(dir, f), f === 'Xilinx.lic' ? 'INCREMENT ISE_WebPACK xilinxd 2099.12 permanent uncounted HOSTID=ANY\n' : 'not an installer\n');
  for (const f of downloads) write(path.join(home, 'Downloads'), f);
  for (const f of cwd) write(here, f);
  fs.writeFileSync(path.join(bin, 'docker'), '#!/bin/sh\nexit 1\n', { mode: 0o755 });
  const r = spawnSync('bash', [SH, ...args], { cwd: here, encoding: 'utf8', env: { PATH: `${bin}:${process.env.PATH}`, HOME: home } });
  fs.rmSync(tmp, { recursive: true, force: true });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

test('ise image kit: the scripts parse; the help says the MD5 check is integrity, not authenticity', { skip: !posix }, () => {
  assert.equal(spawnSync('bash', ['-n', SH], { encoding: 'utf8' }).status, 0);
  const help = spawnSync('bash', [SH, '--help'], { encoding: 'utf8' });
  assert.equal(help.status, 0);
  assert.match(help.stdout, /Build the private Silinx Xilinx ISE 14\.7 image/);
  assert.match(help.stdout, /The MD5 check compares the installer with the sum AMD publishes: it tells a corrupt or a different\n# download apart \(integrity\), not who made the file \(authenticity\)/);
  assert.match(help.stdout, /free disk during the build/, 'the help prints the whole header');
  assert.match(fs.readFileSync(PS1, 'utf8'), /\(integrity\), not who made the file \(authenticity\)/);
  assert.match(fs.readFileSync(path.join(ROOT, 'docker/ise/README.md'), 'utf8'), /tells a corrupt or a different download apart,\nnot who made the file/);
});

test('ise image kit: the inputs from ~/Downloads only when no argument says, and said; not from the current folder (#1442)', { skip: !posix }, () => {
  // both in ~/Downloads: taken, said, and the run goes on to Docker (which is not running here)
  let r = run([], { downloads: [TAR, 'Xilinx.lic'] });
  assert.equal(r.code, 1);
  assert.match(r.out, new RegExp(`^==> installer: \\S+/hm/Downloads/${TAR.replace(/\./g, '\\.')} \\(no --installer given\\)\n==> license: \\S+/hm/Downloads/Xilinx\\.lic \\(no --license given\\)\n$`));
  assert.match(r.err, /^ERROR: the docker daemon is not running/);
  // in the current folder only: not taken
  r = run([], { cwd: [TAR, 'Xilinx.lic'] });
  assert.equal(r.code, 1);
  assert.equal(r.out, '');
  assert.match(r.err, /^ERROR: installer not found\./);
  // given: nothing said
  r = run(['--installer', TAR, '--license', 'Xilinx.lic'], { cwd: [TAR, 'Xilinx.lic'] });
  assert.equal(r.code, 1);
  assert.equal(r.out, '');
  assert.match(r.err, /^ERROR: the docker daemon is not running/);
  const ps1 = fs.readFileSync(PS1, 'utf8').replace(/\r\n/g, '\n');   // CRLF
  assert.match(ps1, /function Find-Default\(\$name\) \{\n  \$p = Join-Path "\$HOME\\Downloads" \$name; if \(Test-Path \$p\) \{ return \$p \}\n  return ""\n\}/);
  assert.doesNotMatch(ps1, /Get-Location/);
});

test('ise image kit: the staging folder is a new one of the run, the only one the trap removes (#1442)', () => {
  const sh = fs.readFileSync(SH, 'utf8');
  assert.match(sh, /\nINSTALLER_DIR="\$\(mktemp -d "\$\(cd "\$\(dirname "\$INSTALLER"\)" && pwd\)\/\.silinx-stage\.XXXXXX" 2>\/dev\/null \|\| mktemp -d\)"\ntrap 'rm -rf "\$INSTALLER_DIR"' EXIT\n/);
  assert.doesNotMatch(sh, /mkdir -p "\$INSTALLER_DIR"/);
  assert.doesNotMatch(sh, /\.silinx-stage"/);
  for (const m of sh.matchAll(/trap '([^']*)' EXIT/g)) assert.match(m[1], /^rm -rf (?:"\$(?:LICENSE_DIR|INSTALLER_DIR|tmp)" ?)+$/, m[1]);
  const ps1 = fs.readFileSync(PS1, 'utf8').replace(/\r\n/g, '\n');   // CRLF
  assert.match(ps1, /\$Stage = Join-Path \(Split-Path -Parent \$Installer\) \("\.silinx-stage\." \+ \[guid\]::NewGuid\(\)\.ToString\("N"\)\.Substring\(0, 8\)\)\nNew-Item -ItemType Directory -Path \$Stage \| Out-Null\n/);
  assert.doesNotMatch(ps1, /-Force -Path \$Stage/);
});

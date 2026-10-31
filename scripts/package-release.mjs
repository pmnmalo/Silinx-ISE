#!/usr/bin/env node
// Packages the files of a GitHub release (used by .github/workflows/release.yml, and by the release
// test, test/release/, which unzips the app and runs it: the two cannot drift apart).
//   node scripts/package-release.mjs [version] [--out out] [--app-only]
//     silinx-ise-<version>.zip             full app: the tracked files + production node_modules
//     silinx-ise-docker-kit-<version>.zip  builder kit of the private Xilinx ISE 14.7 Docker image
//     Silinx-ISE.html                      the single-file edition (copied from dist/, built before
//                                          with npm run build:standalone; left out when not built)
//     SHA256SUMS                           the SHA-256 checksums of the files above (#485)
// version dev: the files of the pre-release "Development build" (silinx-ise-dev.zip, …).
// --app-only: only the app zip. The version defaults to package.json's. Needs `zip` (Linux, macOS)
// and npm (the production dependencies are installed from package-lock.json: npm ci --omit=dev).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { sha256sums, SUMS_FILE } from './checksums.mjs';
import { leaveOutChipdbs } from '../packages/silinx-fpga/src/nextpnr-chipdb-node.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const opt = (name, def) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : def; };
const version = String(argv.find((a, i) => !a.startsWith('--') && argv[i - 1] !== '--out') || JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version).replace(/^v/, '');
// (dev: the pre-release "Development build", .github/workflows/dev-release.yml)
if (!/^(\d+\.\d+\.\d+|dev)$/.test(version)) { console.error('usage: node scripts/package-release.mjs [version] [--out dir] [--app-only]'); process.exit(2); }
const out = path.resolve(opt('out', path.join(root, 'out')));
const appOnly = argv.includes('--app-only');
const run = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, stdio: ['ignore', 'inherit', 'inherit'], shell: process.platform === 'win32' && cmd === 'npm' });

/** The tracked files the app never reads, left out of the zip: the device measurements (#3, #1541), the tests (#2329). */
const NOT_RELEASED = /^(packages\/silinx-fpga\/research\/s3e-device\/data|test|packages\/silinx-fpga\/test)\//;

const NEXTPNR_PACKAGES = ['@silinx/nextpnr-himbaechel-spartan3e', '@silinx/nextpnr-himbaechel-spartan6'];

/**
 * The tracked files (as `git archive HEAD` gives them in a clean checkout, the release's case) with
 * the file modes of the repository: the start scripts stay executable.
 */
function copyTracked(dest) {
  const list = execFileSync('git', ['ls-files', '-s', '-z'], { cwd: root, encoding: 'utf8', maxBuffer: 64 << 20 });
  for (const entry of list.split('\0').filter(Boolean)) {
    const [, mode, rel] = /^(\d+) \S+ \d+\t(.*)$/s.exec(entry);
    if (NOT_RELEASED.test(rel)) continue;
    const src = path.join(root, rel), dst = path.join(dest, rel);
    if (!fs.existsSync(src)) continue;            // deleted in the working tree
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    if (mode === '120000') fs.symlinkSync(fs.readlinkSync(src), dst);
    else { fs.copyFileSync(src, dst); fs.chmodSync(dst, mode === '100755' ? 0o755 : 0o644); }
  }
}

/** npm's links in node_modules to this repository's own packages (its workspaces, packages/*: silinx-fpga, #1677)
 *  removed: they are in the app as files (packages/), are not third-party, and a symbolic link is no use in a zip
 *  unpacked on Windows (#1874). */
function unlinkWorkspaces(app) {
  const dir = path.join(app, 'packages');
  if (!fs.existsSync(dir)) return [];
  const names = fs.readdirSync(dir, { withFileTypes: true }).filter(e => e.isDirectory())
    .map(e => { try { return JSON.parse(fs.readFileSync(path.join(dir, e.name, 'package.json'), 'utf8')).name; } catch { return null; } }).filter(Boolean);
  const gone = [];
  for (const name of names) {
    const link = path.join(app, 'node_modules', name);
    let st = null;
    try { st = fs.lstatSync(link); } catch { continue; }
    if (st.isSymbolicLink()) { fs.rmSync(link); gone.push(name); }
  }
  return gone;
}

/** The full app: tracked files + production dependencies, in a folder silinx-ise/. */
function packageApp() {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-pkg-'));
  try {
    const app = path.join(work, 'silinx-ise');
    copyTracked(app);
    run('npm', ['ci', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'], app);
    unlinkWorkspaces(app);
    // nextpnr's chip databases: downloaded on their first use (#2329)
    for (const pkg of NEXTPNR_PACKAGES) leaveOutChipdbs(path.join(app, 'node_modules', pkg));
    fs.rmSync(path.join(app, '.github'), { recursive: true, force: true });
    const zip = path.join(out, `silinx-ise-${version}.zip`);
    fs.rmSync(zip, { force: true });
    run('zip', ['-qr', zip, 'silinx-ise'], work);
    return zip;
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}

fs.mkdirSync(out, { recursive: true });
const made = [packageApp()];
if (!appOnly) {
  // no Xilinx software or licence inside: only the scripts that build the image from the user's own
  const kit = path.join(out, `silinx-ise-docker-kit-${version}.zip`);
  fs.rmSync(kit, { force: true });
  run('zip', ['-qr', kit, 'ise'], path.join(root, 'docker'));
  made.push(kit);
  const html = path.join(root, 'dist', 'Silinx-ISE.html');
  if (fs.existsSync(html)) { fs.copyFileSync(html, path.join(out, 'Silinx-ISE.html')); made.push(path.join(out, 'Silinx-ISE.html')); }
}
// (sha256sum -c SHA256SUMS checks a download; the Release workflow attests the files it lists)
fs.writeFileSync(path.join(out, SUMS_FILE), sha256sums(made));
for (const f of made) console.log(`${f}  ${(fs.statSync(f).size / 1048576).toFixed(1)} MB`);

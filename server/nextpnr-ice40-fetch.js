// The iCE40's nextpnr and icepack on the local server (#2444): the package @yowasp/nextpnr-ice40 when it is installed; else
// (the release zip leaves it out: 78 MB packed, every iCE40's chip database) its tarball, at the version and the SHA-512 of
// package-lock.json, downloaded by the first run from npm's registry, checked and kept in ~/.silinx/nextpnr/
// (SILINX_CONFIG_DIR overrides ~/.silinx), as nextpnr-spartan's chip databases are (#2329).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { checkIntegrity, untgz } from '../core/tgz.js';

const NAME = '@yowasp/nextpnr-ice40';
const ROOT = fileURLToPath(new URL('..', import.meta.url));

/** { version, url, integrity } of the package in a package-lock.json; null when it has none. */
export function ice40Package(lockFile = path.join(ROOT, 'package-lock.json')) {
  try {
    const e = JSON.parse(fs.readFileSync(lockFile, 'utf8')).packages[`node_modules/${NAME}`];
    return e?.resolved && e.integrity ? { version: e.version, url: e.resolved, integrity: e.integrity } : null;
  } catch { return null; }
}

/** The folder of a version's files. */
export const ice40CacheDir = version => path.join(process.env.SILINX_CONFIG_DIR || path.join(os.homedir(), '.silinx'), 'nextpnr', `nextpnr-ice40-${version}`);

const MODULE = 'gen/bundle.js';

/** Is it there without a download: installed, or kept by an earlier run? */
export function ice40Present(pkg = ice40Package()) {
  try { import.meta.resolve(NAME); return true; } catch { /* not installed */ }
  return !!pkg && fs.existsSync(path.join(ice40CacheDir(pkg.version), MODULE));
}

/**
 * The package's module: the installed one, the one kept, or downloaded and kept. log(line) says the download; offline, an
 * error that says what to do.
 */
export async function loadIce40({ log = () => {}, fetchFn = fetch, pkg = ice40Package(), installed = () => import(NAME) } = {}) {
  try {
    return await installed();
  } catch (e) {
    if (e.code !== 'ERR_MODULE_NOT_FOUND') throw e;
  }
  if (!pkg) throw new Error(`nextpnr-ice40 is not installed: npm install ${NAME}`);
  const dir = ice40CacheDir(pkg.version), mod = path.join(dir, MODULE);
  if (!fs.existsSync(mod)) {
    log(`Place & Route: downloading nextpnr-ice40 and icepack (about 80 MB, from ${new URL(pkg.url).host}: once, then kept in ${dir})…`);
    let bytes;
    try {
      const response = await fetchFn(pkg.url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      bytes = new Uint8Array(await response.arrayBuffer());
    } catch (e) {
      throw new Error(`nextpnr-ice40 is not in this installation and could not be downloaded from ${pkg.url} (${e.message}): connect to the Internet once`);
    }
    try { await checkIntegrity(bytes, pkg.integrity); } catch (e) { throw new Error(`nextpnr-ice40 downloaded from ${pkg.url}: ${e.message}: not used`); }
    const files = await untgz(bytes);
    if (!files[MODULE]) throw new Error(`nextpnr-ice40 downloaded from ${pkg.url}: no ${MODULE}`);
    // (written whole, then renamed: a run stopped half way leaves nothing that looks kept)
    const tmp = `${dir}.${process.pid}.tmp`;
    fs.rmSync(tmp, { recursive: true, force: true });
    for (const [name, data] of Object.entries(files)) {
      const f = path.join(tmp, name);
      fs.mkdirSync(path.dirname(f), { recursive: true });
      fs.writeFileSync(f, data);
    }
    fs.rmSync(dir, { recursive: true, force: true });
    fs.renameSync(tmp, dir);
  }
  return import(pathToFileURL(mod).href);
}

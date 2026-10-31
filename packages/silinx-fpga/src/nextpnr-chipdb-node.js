// Silinx toolchain - nextpnr's chip databases fetched on first use, in Node (#2329). The release zip leaves them out of
// the nextpnr packages (@silinx/nextpnr-himbaechel-spartan3e, -spartan6: about 24 MB zipped, over the zip's budget): it
// keeps, in each package's chipdb/, a manifest (fetch.json) with where they are (the fork pmnmalo/nextpnr-spartan's
// GitHub release of the package's version, one asset per device) and each one's size and SHA-256. The first Place &
// Route of a device downloads its database, checks it and keeps it in ~/.silinx/nextpnr/ (SILINX_CONFIG_DIR overrides
// ~/.silinx), as the browser edition fetches it from the site and keeps it.
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';

export const CHIPDB_MANIFEST = 'fetch.json';

/** The GitHub release of a nextpnr package's version: v<version> for the Spartan-3E's, spartan6-v<version> for the
 *  Spartan-6's (the fork's tags). */
export function chipdbReleaseUrl(name, version) {
  const family = /-(spartan\w+)$/.exec(name)?.[1];
  if (!family) throw new Error(`${name}: not a nextpnr package of nextpnr-spartan`);
  return `https://github.com/pmnmalo/nextpnr-spartan/releases/download/${family === 'spartan3e' ? '' : `${family}-`}v${version}/`;
}

/** Folder of the downloaded databases of a package's version. */
export function chipdbCacheDir(name, version) {
  return path.join(process.env.SILINX_CONFIG_DIR || path.join(os.homedir(), '.silinx'), 'nextpnr', `${name.split('/').pop()}-${version}`);
}

const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

/**
 * The release zip's step (scripts/package-release.mjs): the package's databases (pkgDir/chipdb/*.bin.gz) replaced by
 * their manifest; returns the bytes removed.
 */
export function leaveOutChipdbs(pkgDir) {
  const { name, version } = JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf8'));
  const dir = path.join(pkgDir, 'chipdb');
  const files = {};
  let bytes = 0;
  for (const f of fs.readdirSync(dir).filter(f => /^chipdb-.+\.bin\.gz$/.test(f)).sort()) {
    const data = fs.readFileSync(path.join(dir, f));
    files[f] = { size: data.length, sha256: sha256(data) };
    bytes += data.length;
    fs.rmSync(path.join(dir, f));
  }
  fs.writeFileSync(path.join(dir, CHIPDB_MANIFEST), JSON.stringify({ name, version, url: chipdbReleaseUrl(name, version), files }, null, 2) + '\n');
  return bytes;
}

// (the database itself, as the package's chipdb(part) gives it)
const unzipped = gz => new Uint8Array(zlib.gunzipSync(gz));
const MB = n => `${(n / 1048576).toFixed(1)} MB`;

/**
 * The database `file` of a package left out of this installation: the cached one, or downloaded (and cached) as the
 * manifest says; log(line) says the download. Offline, an error that says what to do.
 */
export async function fetchChipdb(manifest, file, part, { log = () => {}, fetchFn = fetch } = {}) {
  const want = manifest.files?.[file];
  if (!want) throw new Error(`no chip database ${file} of ${part} in ${manifest.name} ${manifest.version}`);
  const dir = chipdbCacheDir(manifest.name, manifest.version), cached = path.join(dir, file);
  try {
    const data = fs.readFileSync(cached);
    if (sha256(data) === want.sha256) return unzipped(data);
  } catch { /* not downloaded yet */ }
  const url = manifest.url + file;
  log(`Place & Route: downloading nextpnr's chip database of ${part} (${MB(want.size)}, from ${new URL(url).host}: once, then kept in ${dir})…`);
  let data;
  try {
    const response = await fetchFn(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    data = Buffer.from(await response.arrayBuffer());
  } catch (e) {
    throw new Error(`nextpnr's chip database of ${part} is not in this installation (the release zip leaves it out, #2329) and could not be downloaded from ${url} (${e.message}): connect to the Internet once, or choose the Silinx engine (Process Properties ▸ Place & Route Engine)`);
  }
  if (data.length !== want.size || sha256(data) !== want.sha256) {
    throw new Error(`nextpnr's chip database of ${part} downloaded from ${url} is not the one of ${manifest.name} ${manifest.version} (its size or SHA-256 differs): not used`);
  }
  fs.mkdirSync(dir, { recursive: true });
  const tmp = `${cached}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, cached);
  return unzipped(data);
}

/**
 * io (nextpnr-io.js) whose chipdb(part, log) fetches a database the installation does not have (the package's
 * chipdb/fetch.json says where), else the package's own as before.
 */
export function withChipdbFetch(io, { fetchFn } = {}) {
  return {
    ...io,
    chipdb: async (part, log) => {
      try {
        return await io.chipdb(part);
      } catch (e) {
        if (e.code !== 'ENOENT' || !e.path) throw e;
        let manifest;
        try { manifest = JSON.parse(fs.readFileSync(path.join(path.dirname(e.path), CHIPDB_MANIFEST), 'utf8')); } catch { throw e; }
        return fetchChipdb(manifest, path.basename(e.path), part, { log, fetchFn });
      }
    },
  };
}

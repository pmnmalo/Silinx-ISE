// Silinx - the device routing graph cache, Node side (the only Node-only part of core/fpga).
//
// The graph of the XC3S250E-CP132 (Basys2-250) ships with Silinx (packages/silinx-fpga/devices/, built from
// ISE's device report; see docs/OPEN-TOOLCHAIN.md). The graph of any other device is built once per
// user from the device report of their own ISE installation, then cached as gzipped JSON:
//
//   xdl -report -pips -all_conns xc3s250ecp132-4 dev-full.xdlrc
//   node bin/... or research/s3e-route/build-device.mjs dev-full.xdlrc
//     -> ~/.silinx/devices/xc3s250ecp132-4.json.gz   (SILINX_CONFIG_DIR overrides ~/.silinx)
//
// The browser loads the same file with fetch + DecompressionStream('gzip') + JSON.parse + loadDevice().

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { DeviceBuilder, loadDevice } from './device.js';

/** Folder of the device caches. */
export function devicesDir() {
  return path.join(process.env.SILINX_CONFIG_DIR || path.join(os.homedir(), '.silinx'), 'devices');
}

/** Default cache file of a part (e.g. 'xc3s250ecp132-4'). */
export function deviceCachePath(part) { return path.join(devicesDir(), `${part}.json.gz`); }

/** The graphs that ship with Silinx (packages/silinx-fpga/devices/<part>.json.gz). */
export const SHIPPED_DEVICES_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'devices');
export function shippedDevicePath(part) { return path.join(SHIPPED_DEVICES_DIR, `${part}.json.gz`); }

/**
 * Where the graph of a part is: the user's own cache (built from their ISE) first, then the one
 * shipped with Silinx; null when neither exists. A graph does not depend on the speed grade: a
 * part with another speed (xc3s250ecp132-5) finds the one of any speed of the same device and package.
 */
export function findDeviceGraph(part) {
  const tries = [deviceCachePath(part), shippedDevicePath(part)];
  const base = String(part).replace(/-\d+$/, '');
  for (const dir of [devicesDir(), SHIPPED_DEVICES_DIR]) {
    try { for (const f of fs.readdirSync(dir)) if (f.startsWith(`${base}-`) && f.endsWith('.json.gz')) tries.push(path.join(dir, f)); } catch { /* no folder */ }
  }
  return tries.find(f => fs.existsSync(f)) || null;
}

/** Stream-parse a device report file (plain or gzipped: .gz) into the packed graph (the report is
 *  ~200 MB for the XC3S250E, more for larger chips: never read whole). */
export async function packDeviceFile(xdlrcPath) {
  const b = new DeviceBuilder();
  const file = fs.createReadStream(xdlrcPath);
  const input = /\.gz$/i.test(xdlrcPath) ? file.pipe(zlib.createGunzip()) : file;
  const rl = readline.createInterface({ input, crlfDelay: Infinity });
  for await (const l of rl) { b.line(l); if (b.done) { rl.close(); break; } }
  return b.finish();
}

/** Build the cache from a report; returns { path, packed, bytes }. */
export async function buildDeviceCache(xdlrcPath, outPath = null) {
  const packed = await packDeviceFile(xdlrcPath);
  const out = outPath || deviceCachePath(packed.part);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const gz = zlib.gzipSync(JSON.stringify(packed), { level: 9 });
  fs.writeFileSync(out, gz);
  return { path: out, packed, bytes: gz.length };
}

/** Load a graph (a part name: findDeviceGraph; or a file path) into a Device. */
export function loadDeviceCache(partOrPath) {
  const isPath = /[\\/]|\.gz$|\.json$/.test(partOrPath);
  const f = isPath ? partOrPath : findDeviceGraph(partOrPath);
  if (!f) throw new Error(`no routing graph of ${partOrPath}: build it from your ISE's device report (research/s3e-route/build-device.mjs)`);
  let buf = fs.readFileSync(f);
  if (buf[0] === 0x1f && buf[1] === 0x8b) buf = zlib.gunzipSync(buf);
  return loadDevice(JSON.parse(buf.toString('utf8')));
}

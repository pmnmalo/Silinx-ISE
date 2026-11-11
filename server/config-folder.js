// The configuration folder (~/.silinx) kept its owner's (#3410): the folder 0700, config.json 0600. A mkdir with a mode
// changes no folder that exists, and a writeFile with one no file that exists: a folder made before #2564, by hand or by
// an older version stayed readable by the computer's other users, with the configuration's ssh machine and user. Both
// are tightened when they are the user's own (not on Windows, whose modes are not these).
import fs from 'node:fs';
import path from 'node:path';
import { configDir, configPath } from './toolchain.js';

/** The configuration folder made (0700) or tightened to 0700, its config.json to 0600, when the user owns them; returns
 *  what was tightened ([{ path, was }], `was` the old mode in octal), for the log. */
export function tightenConfigFolder({ dir = configDir(), file = configPath(), platform = process.platform } = {}) {
  const out = [];
  try { fs.mkdirSync(dir, { recursive: true, mode: 0o700 }); } catch { return out; }
  if (platform === 'win32') return out;
  const uid = process.getuid?.();
  for (const [p, mode] of [[dir, 0o700], [file, 0o600]]) {
    let st;
    try { st = fs.lstatSync(p); } catch { continue; }   // (no config.json yet)
    // (the user's own only, never through a link: another user's folder is not changed)
    if (st.isSymbolicLink() || (uid != null && st.uid !== uid) || (st.mode & 0o777) === mode) continue;
    try { fs.chmodSync(p, mode); out.push({ path: p, was: (st.mode & 0o777).toString(8) }); } catch { /* left as it is */ }
  }
  return out;
}

/** The log's line for what tightenConfigFolder changed, or null. */
export const tightenedMessage = changed => (changed.length
  ? `Silinx: the configuration folder made its owner's only: ${changed.map(c => `${path.basename(c.path)} (was ${c.was})`).join(', ')}`
  : null);

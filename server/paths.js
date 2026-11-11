// A project's paths stay inside its folder, also once their symbolic links are followed (#1234): a folder put in
// the workspace by hand (a clone, a copy) may hold a link to a file of the user's (src/top.vhd -> ~/.ssh/id_rsa).
import fs from 'node:fs';
import path from 'node:path';

/** Where a path really is: its deepest part that exists, with its symbolic links resolved, then the rest. real: the
 *  resolver (fs.realpathSync's; nativeRealOf: the system's). */
export function realOf(p, real = q => fs.realpathSync(q)) {
  const rest = [];
  for (let q = p; ;) {
    try { return path.join(real(q), ...rest); } catch { /* not there (yet): its folder */ }
    const up = path.dirname(q);
    if (up === q) return p;
    rest.unshift(path.basename(q));
    q = up;
  }
}

/** Where a path really is as the system names it (realpath's native form: on Windows, a short name such as GIT~1
 *  expanded to the long one, .git). */
export const nativeRealOf = p => realOf(p, q => fs.realpathSync.native(q));

/** A hidden file's or folder's name (.git, .env), or what may be another name of one: a short (8.3) name, GIT~1 for
 *  .git on Windows, has a '~' and digits in its base name (core/import-gate.js refuses them too). */
export const hiddenName = s => (s.startsWith('.') && s !== '.' && s !== '..') || /^[^.]*~\d/.test(s);

const isIn = (dir, full) => full === dir || full.startsWith(dir + path.sep);

/** Is `full` (absolute) the folder `dir` or inside it, by name and once the links of both are followed? */
export function within(dir, full) {
  return isIn(dir, full) && isIn(realOf(dir), realOf(full));
}

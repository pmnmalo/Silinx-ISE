// A file's name as a case-insensitive file system may read it (#2956, #3034): one fold for the server, the import gate,
// the browser's folder store and the design links. Isomorphic module (browser + Node), no imports.

// full case folding (ſ is s, K is k) and NFKC, not toLowerCase alone ('ſilinx.json' is silinx.json on APFS, #2956)
export const foldName = s => String(s).normalize('NFKC').toUpperCase().toLowerCase();
/** The project's description, silinx.json. */
export const PROJECT_FILE = 'silinx.json';
/** Whether a name (a path's last segment, or a project-relative path) is silinx.json to a case-insensitive file system. */
export const foldsToProjectFile = s => foldName(s) === PROJECT_FILE;

/** The name of `names` (a folder's) that a case-insensitive file system reads as `name`: `name` itself if there, else
 *  the first that folds to it (SRC for src), else null. */
export function sameNameIn(name, names) {
  const all = [...names];
  if (all.includes(name)) return name;
  const f = foldName(name);
  return all.find(n => foldName(n) === f) ?? null;
}

/** A project-relative path (a/b/c) with each of its folders, and its last name unless `last` is false, spelled as the
 *  project already spells it (#3536): SRC/extra.vhd is src/extra.vhd when the project has a folder src, as a
 *  case-insensitive file system (macOS, Windows) writes it, so the project's description, its export and a clone on a
 *  case-sensitive one (Linux) name the same file. names(folder): the names in the project's folder ('' its root), an
 *  array or a promise of one ([] for a folder that does not exist). */
export async function spelledAs(key, names, { last = true } = {}) {
  const parts = key.split('/'), out = [];
  for (let i = 0; i < parts.length; i++) {
    const n = (last || i < parts.length - 1) ? sameNameIn(parts[i], await names(out.join('/'))) : null;
    out.push(n ?? parts[i]);
  }
  return out.join('/');
}

// A project's name (#3538): one rule and one message for the New Project wizard, the import dialogs, the browser's
// stores, the local server, the design links and the MCP server. Isomorphic module (browser + Node), no imports.

/** A project's name: a letter, then up to 63 letters, digits, - and _ (its folder's name, on every system). */
export const PROJECT_NAME_RE = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;

/** Why `name` is no project's name, or null. */
export const projectNameError = name => (typeof name === 'string' && PROJECT_NAME_RE.test(name) ? null
  : `invalid project name '${name}': a letter, then up to 63 letters, digits, - and _`);

/** A project's name made from a file's or a folder's (an import's .zip, .xise, an old bundle's .silinx.json, a folder):
 *  its extension and an export's -silinx off, every other character than a letter, a digit, - or _ as _, p_ before one
 *  that starts with no letter, at most 64 characters (2026-lab.zip: p_2026-lab); '' for none. */
export function projectNameFrom(file) {
  const n = String(file ?? '').split(/[\\/]/).pop().replace(/\.(zip|xise|silinx\.json|json)$/i, '').replace(/-silinx$/i, '').replace(/[^A-Za-z0-9_-]/g, '_');
  return (n && !/^[A-Za-z]/.test(n) ? `p_${n}` : n).slice(0, 64);
}

/** The project of `list` (names, or { name }) that has the name `name` in any case (A1 for a1: one folder on a
 *  case-insensitive file system, macOS's and Windows'), or undefined. */
export const sameProject = (list, name) => {
  const low = String(name).toLowerCase();
  return list.find(p => String(p?.name ?? p).toLowerCase() === low);
};

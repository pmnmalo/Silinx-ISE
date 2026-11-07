// A file's name as a case-insensitive file system may read it (#2956, #3034): one fold for the server, the import gate,
// the browser's folder store and the design links. Isomorphic module (browser + Node), no imports.

// full case folding (ſ is s, K is k) and NFKC, not toLowerCase alone ('ſilinx.json' is silinx.json on APFS, #2956)
export const foldName = s => String(s).normalize('NFKC').toUpperCase().toLowerCase();
/** The project's description, silinx.json. */
export const PROJECT_FILE = 'silinx.json';
/** Whether a name (a path's last segment, or a project-relative path) is silinx.json to a case-insensitive file system. */
export const foldsToProjectFile = s => foldName(s) === PROJECT_FILE;

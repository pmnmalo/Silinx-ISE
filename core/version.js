// Product name and version, shown in the UI (title bar, About, Design Summary).
// VERSION is kept equal to package.json by scripts/sync-version.mjs (run by `npm version`).
export const PRODUCT = 'Silinx ISE';
export const PRODUCT_FULL = 'Silinx ISE (Integrated Synthesis Environment)';
export const VERSION = '15.9.1';
export const MAJOR = VERSION.split('.')[0];
export const REPOSITORY = 'pmnmalo/Silinx-ISE';   // GitHub owner/name (About, Check for Updates)

/** Compare dotted versions ("15.3.0" vs "v15.10.1"): negative, 0 or positive. */
export function compareVersions(a, b) {
  const p = (v) => String(v).replace(/^v/i, '').split(/[.+-]/).map((x) => parseInt(x, 10) || 0);
  const A = p(a), B = p(b);
  for (let i = 0; i < Math.max(A.length, B.length); i++) if ((A[i] || 0) !== (B[i] || 0)) return (A[i] || 0) - (B[i] || 0);
  return 0;
}
